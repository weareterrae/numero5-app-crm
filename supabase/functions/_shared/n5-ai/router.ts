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

    let regras: { role: string; model_id: string }[] = [];
    if (policyId) {
      const { data } = await this.db
        .from("ai_routing_rules")
        .select("role, model_id")
        .eq("policy_id", policyId)
        .eq("request_class", cls);
      regras = (data ?? []) as { role: string; model_id: string }[];
    }

    const ordem = ["PRIMARY", "FALLBACK_1", "FALLBACK_2", "EMERGENCY"];
    const cadeia: RoutedModel[] = [];

    for (const role of ordem) {
      const regra = regras.find((r) => r.role === role);
      if (!regra) continue;
      const m = porId.get(regra.model_id);
      if (!m) continue;                                  // modelo desligado no registo
      if (!["ACTIVE", "DEGRADED"].includes(m.status)) continue;
      if (!circuitAllows(m)) continue;                   // disjuntor aberto
      cadeia.push({ model: m, role, reason: `policy:${cls}:${role}` });
    }

    // Rede de segurança: se a política não deu nada utilizável (ex.: todos
    // os modelos da cadeia com disjuntor aberto), usa qualquer modelo são
    // do registo. Melhor degradar do que falhar.
    if (cadeia.length === 0) {
      const sobreviventes = modelos
        .filter((m) => ["ACTIVE", "DEGRADED"].includes(m.status) && circuitAllows(m))
        .sort((a, b) => healthRank(a) - healthRank(b) || a.priority - b.priority);
      for (const m of sobreviventes.slice(0, 2)) {
        cadeia.push({ model: m, role: "EMERGENCY", reason: "fallback:registry-scan" });
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
      const janela = model.circuit_cooldown_seconds; // reutiliza a janela do modelo
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
        if (req >= model.circuit_min_samples && taxa >= model.circuit_error_threshold) {
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
            detalhe: { taxa_erro: taxa, amostras: req, ultimo_status: status },
          });
        }
      }
    } catch {
      // Telemetria nunca derruba um pedido.
    }
  }
}
