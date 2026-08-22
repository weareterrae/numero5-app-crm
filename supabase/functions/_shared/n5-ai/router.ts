// =====================================================================
// Router + Circuit Breaker
// ---------------------------------------------------------------------
// P0 é DETERMINÍSTICO: nenhum LLM decide qual LLM chamar. A cadeia vem
// da tabela (PRIMARY → FALLBACK_1 → FALLBACK_2 → EMERGENCY), filtrada
// por saúde e por estado do disjuntor.
//
// Fallback é por capacidade equivalente e ordem explícita — nunca
// aleatório, nunca "tenta o próximo que houver".
//
// Lição de 21/08/2026 codificada aqui: um modelo que devolve 404 ou
// 503 de forma repetida deixa de receber tráfego automaticamente, em
// vez de continuar a queimar 50s por pedido em tentativas inúteis.
// =====================================================================

import type { ModelRow, RequestClass } from "./types.ts";
import type { DbClient } from "./registry.ts";
import { Registry } from "./registry.ts";

export const ROUTING_VERSION = "p0.1";

export type RoutedModel = {
  model: ModelRow;
  role: string;
  reason: string;
  /** Configuração da regra: o que ESTA classe precisa deste modelo. */
  maxOutputTokens?: number;
  grounding?: boolean;
  temperature?: number;
  tokenHeadroom?: number;
};

/**
 * Um modelo pode receber tráfego?
 * Regra do disjuntor:
 *   CLOSED    → sim
 *   OPEN      → não, até passar o arrefecimento; depois entra HALF_OPEN
 *   HALF_OPEN → sim, mas só como tentativa de recuperação
 */
export function circuitAllows(m: ModelRow, now = Date.now()): boolean {
  if (m.circuit_state === "CLOSED") return true;
  if (m.circuit_state === "HALF_OPEN") return true;
  // OPEN: só reabre depois do arrefecimento configurado (nada hardcoded)
  if (!m.circuit_opened_at) return true;
  const abertoHa = now - new Date(m.circuit_opened_at).getTime();
  return abertoHa >= m.circuit_cooldown_seconds * 1000;
}

/** Ordena candidatos: saúde primeiro, depois a prioridade do registo. */
function healthRank(m: ModelRow): number {
  switch (m.health_status) {
    case "HEALTHY": return 0;
    case "UNKNOWN": return 1;   // ainda sem dados — vale a pena tentar
    case "DEGRADED": return 2;
    case "UNHEALTHY": return 3;
    default: return 4;
  }
}

export class Router {
  constructor(private readonly db: DbClient, private readonly registry: Registry) {}

  /**
   * Devolve a cadeia ORDENADA de modelos a tentar para este pedido.
   * O gateway percorre-a até um responder. Se a cadeia vier vazia,
   * é um incidente de configuração — não uma falha de fornecedor.
   */
  async chain(policyId: string | null, cls: RequestClass): Promise<RoutedModel[]> {
    const modelos = await this.registry.models();
    const porId = new Map(modelos.map((m) => [m.id, m]));

    type Regra = {
      role: string; model_id: string;
      max_output_tokens: number | null; grounding: boolean;
      temperature: number | null; token_headroom: number;
    };
    let regras: Regra[] = [];
    if (policyId) {
      const { data } = await this.db
        .from("ai_routing_rules")
        .select("role, model_id, max_output_tokens, grounding, temperature, token_headroom")
        .eq("policy_id", policyId)
        .eq("request_class", cls);
      regras = (data ?? []) as Regra[];
    }
    // Uma classe que exige pesquisa não pode cair num modelo que a ignora
    // em silêncio — devolveria uma resposta plausível e sem fontes.
    const exigeGrounding = regras.some((r) => r.grounding);

    const ordem = ["PRIMARY", "FALLBACK_1", "FALLBACK_2", "EMERGENCY"];
    const cadeia: RoutedModel[] = [];

    for (const role of ordem) {
      const regra = regras.find((r) => r.role === role);
      if (!regra) continue;
      const m = porId.get(regra.model_id);
      if (!m) continue;                                  // modelo desligado no registo
      if (!["ACTIVE", "DEGRADED"].includes(m.status)) continue;
      if (!circuitAllows(m)) continue;                   // disjuntor aberto
      if (regra.grounding && !(m as any).supports_grounding) continue; // não sabe pesquisar
      cadeia.push({
        model: m, role, reason: `policy:${cls}:${role}`,
        maxOutputTokens: regra.max_output_tokens ?? undefined,
        grounding: regra.grounding,
        temperature: regra.temperature == null ? undefined : Number(regra.temperature),
        tokenHeadroom: regra.token_headroom,
      });
    }

    // Rede de segurança: se a política não deu nada utilizável (ex.: todos
    // os modelos da cadeia com disjuntor aberto), usa qualquer modelo são
    // do registo. Melhor degradar do que falhar.
    if (cadeia.length === 0) {
      const sobreviventes = modelos
        .filter((m) => ["ACTIVE", "DEGRADED"].includes(m.status) && circuitAllows(m))
        // Se a classe exige pesquisa, a varredura também a tem de respeitar:
        // é preferível não responder a responder sem fontes.
        .filter((m) => !exigeGrounding || (m as any).supports_grounding)
        .sort((a, b) => healthRank(a) - healthRank(b) || a.priority - b.priority);
      for (const m of sobreviventes.slice(0, 2)) {
        cadeia.push({
          model: m, role: "EMERGENCY", reason: "fallback:registry-scan",
          grounding: exigeGrounding,
          maxOutputTokens: exigeGrounding ? 8000 : undefined,
        });
      }
    }

    return cadeia;
  }

  /**
   * Regista o desfecho de uma tentativa e move o disjuntor se preciso.
   * Corre FORA do caminho crítico (o gateway chama sem await).
   */
  async record(
    model: ModelRow, ok: boolean, status: number,
    latencyMs?: number, ttftMs?: number,
  ): Promise<void> {
    try {
      const agora = new Date();
      // A janela é a `circuit_window_seconds` — a coluna que existe para
      // isto. Antes usava-se o `circuit_cooldown_seconds` (120s), o que
      // encurtava a memória do disjuntor para metade e ajudava a que nunca
      // juntasse amostras suficientes para decidir.
      const janela = model.circuit_window_seconds;
      const inicio = new Date(Math.floor(agora.getTime() / (janela * 1000)) * janela * 1000);

      // Contador por janela — barato e suficiente para decidir o disjuntor.
      //
      // NOTA (bug corrigido): antes isto era `.rpc?.(…).catch?.(…)`. O
      // builder do supabase-js não expõe `.catch`, por isso o encadeado
      // opcional devolvia `undefined` e a query NUNCA era executada —
      // o `then()` nunca chegava a ser chamado. Resultado: a tabela de
      // saúde ficava sempre vazia, em silêncio. Agora é await direto,
      // com o try/catch à volta a garantir que nada disto derruba um
      // pedido do utilizador.
      await this.db.rpc("ai_health_bump", {
        p_model_id: model.id,
        p_window_start: inicio.toISOString(),
        p_ok: ok,
        p_status: status,
        p_latency_ms: latencyMs ?? null,
        p_ttft_ms: ttftMs ?? null,
      });

      // Transições de estado
      if (ok && model.circuit_state !== "CLOSED") {
        await this.db.from("ai_models").update({
          circuit_state: "CLOSED", circuit_opened_at: null,
          health_status: "HEALTHY", last_health_check: agora.toISOString(),
        }).eq("id", model.id);
        return;
      }
      if (!ok) {
        const { data } = await this.db
          .from("ai_model_health")
          .select("requests, errors")
          .eq("model_id", model.id)
          .gte("window_start", inicio.toISOString())
          .maybeSingle();
        const req = data?.requests ?? 0;
        const err = data?.errors ?? 0;
        const taxa = req > 0 ? err / req : 0;
        // Duas maneiras de abrir, porque uma só não chega.
        //
        // A TAXA serve caminhos com tráfego. Não serve os relatórios: cada
        // um faz UMA tentativa por janela, nunca junta as 5 amostras
        // mínimas, e o disjuntor ficava fechado para sempre. Foi o que se
        // viu a 22/08/2026 — o gemini-pro em 503 de sobrecarga, a gastar 78
        // segundos por pedido a devolver o erro, e o gateway a insistir nele
        // em todos os relatórios. Cada Mapa de Oportunidade pagava esse
        // tempo antes de chegar ao modelo que funcionava.
        //
        // Por isso: três erros na janela abrem, haja o tráfego que houver.
        // Num caminho movimentado três erros diluem-se e a taxa decide; num
        // caminho lento três erros seguidos são o sinal todo que existe.
        const porTaxa = req >= model.circuit_min_samples && taxa >= model.circuit_error_threshold;
        const porRepeticao = err >= 3;
        if (porTaxa || porRepeticao) {
          await this.db.from("ai_models").update({
            circuit_state: "OPEN",
            circuit_opened_at: agora.toISOString(),
            health_status: "UNHEALTHY",
            last_health_check: agora.toISOString(),
          }).eq("id", model.id);
          await this.db.from("ai_incidents").insert({
            tipo: "CIRCUIT_OPEN", severidade: "crit", model_id: model.id,
            provider_id: model.provider_id,
            titulo: `Disjuntor aberto: ${model.display_name}`,
            detalhe: {
              taxa_erro: taxa, amostras: req, erros: err, ultimo_status: status,
              motivo: porRepeticao && !porTaxa ? "tres erros na janela" : "taxa de erro",
            },
          });
        }
      }
    } catch {
      // Telemetria nunca derruba um pedido.
    }
  }
}
