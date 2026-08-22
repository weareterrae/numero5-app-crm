// =====================================================================
// N5 AI Gateway — orquestração
// ---------------------------------------------------------------------
// O caminho crítico e nada mais:
//   autenticar → resolver assistente → validar origem → limite de
//   tráfego → orçamento → escolher modelo são → montar prompt →
//   chamar fornecedor → STREAM.
//
// Tudo o que é contabilidade, saúde e classificação corre DEPOIS da
// resposta sair. O utilizador nunca espera por analítica.
//
// Portabilidade: só APIs Web. Quem injeta segredos e cria a resposta
// HTTP é o wrapper do runtime.
// =====================================================================

import type {
  AssistantRow, ChatRequest, ModelRow, N5Message, RequestClass, StreamEvent, AttemptRecord,
} from "./types.ts";
import { Registry, originAllowed, type DbClient } from "./registry.ts";
import { Router, ROUTING_VERSION } from "./router.ts";
import { Budgets, PostgresRateLimiter, hashIp, type RateRule } from "./budgets.ts";
import { estimateCost } from "./providers/shared.ts";

/** Timeout por tentativa. Curto de propósito: falhar depressa e passar
 *  ao modelo seguinte é melhor do que pendurar o visitante 50s — foi
 *  isso que provocou os 504 de 21/08/2026. */
const TIMEOUT_TENTATIVA_MS = 12_000;

/** Pedidos com pesquisa web (diagnósticos) demoram muito mais: a Google
 *  vai à net, lê fontes e só depois escreve. As Edge Functions dão 400s
 *  de wall-clock em plano pago, por isso há folga de sobra. */
const TIMEOUT_GROUNDING_MS = 90_000;

export type GatewayDeps = {
  db: DbClient;
  getEnv: (name: string) => string | undefined;
  /** Corre trabalho fora do caminho crítico (ex.: EdgeRuntime.waitUntil). */
  background: (p: Promise<unknown>) => void;
};

export type RequestContext = {
  origin: string | null;
  referer: string | null;
  ip: string | null;
};

export class Gateway {
  private registry: Registry;
  private router: Router;
  private budgets: Budgets;
  private rateLimiter: PostgresRateLimiter;

  constructor(private readonly deps: GatewayDeps) {
    this.registry = new Registry(deps.db, deps.getEnv);
    this.router = new Router(deps.db, this.registry);
    this.budgets = new Budgets(deps.db);
    this.rateLimiter = new PostgresRateLimiter(deps.db);
  }

  /**
   * Devolve um ReadableStream de eventos SSE. Começa a emitir assim que
   * o primeiro token chega — é isto que mata o TTFT e o 504.
   */
  async handle(req: ChatRequest, ctx: RequestContext): Promise<Response> {
    const t0 = Date.now();
    const requestId = crypto.randomUUID();
    const traceId = crypto.randomUUID();

    // ---- 1. assistente (server-side; o browser só manda a chave pública)
    let assistant: AssistantRow | null = null;
    try {
      assistant = await this.registry.assistant(req.assistant_key);
    } catch (e) {
      return this.erroSSE(requestId, "registry_error", String(e));
    }
    if (!assistant) return this.erroSSE(requestId, "unknown_assistant", "Assistente não encontrado.");

    // ---- 2. origem (allowlist do registo, nunca o que o browser diz ser)
    if (!originAllowed(assistant, ctx.origin, ctx.referer)) {
      this.logAsync({
        request_id: requestId, trace_id: traceId, org_id: assistant.org_id,
        assistant_id: assistant.id, status: "blocked", error_code: "origin_denied",
        requested_class: "STANDARD", routing_reason: "n/a", routing_version: ROUTING_VERSION,
        fallback_used: false, attempt_chain: [], streamed: false,
        gateway_ms: Date.now() - t0,
      });
      return this.erroSSE(requestId, "origin_denied", "Origem não autorizada.");
    }

    // ---- 2b. rollout: é o GATEWAY que decide, não o site.
    // O site chama sempre; se este pedido não pertence à fatia migrada,
    // respondemos 'rollout_excluded' e o site serve pelo caminho antigo.
    // Assim a percentagem vive num só sítio (o registo), muda sem deploy,
    // e nenhum site precisa de ler a base de dados.
    if (!assistant.gateway_enabled || assistant.traffic_percentage <= 0) {
      return this.erroSSE(requestId, "rollout_excluded", "Fora da fatia migrada.");
    }
    if (assistant.traffic_percentage < 100) {
      // Balde estável por sessão/IP: um visitante não salta de caminho a
      // meio da conversa, e a comparação legacy vs gateway não fica suja.
      const semente = req.session_id ?? ctx.ip ?? crypto.randomUUID();
      const salt2 = this.deps.getEnv("N5_AI_IP_SALT") ?? "n5";
      const h = await hashIp(semente, salt2);
      const balde = parseInt(h.slice(0, 4), 16) % 100;
      if (balde >= assistant.traffic_percentage) {
        return this.erroSSE(requestId, "rollout_excluded", "Fora da fatia migrada.");
      }
    }

    // ---- 3. limites de tráfego (duráveis, partilhados entre instâncias)
    const salt = this.deps.getEnv("N5_AI_IP_SALT") ?? "n5";
    const regras: RateRule[] = [
      { scope: "assistant", key: assistant.id, limit: 600, windowSeconds: 60 },
    ];
    if (ctx.ip) {
      regras.unshift({ scope: "ip", key: await hashIp(ctx.ip, salt), limit: 20, windowSeconds: 60 });
    }
    if (req.session_id) {
      regras.push({ scope: "session", key: req.session_id, limit: 40, windowSeconds: 60 });
    }
    const rl = await this.rateLimiter.check(regras);
    if (!rl.allow) {
      this.logAsync({
        request_id: requestId, trace_id: traceId, org_id: assistant.org_id,
        assistant_id: assistant.id, status: "rate_limited", error_code: `rate:${rl.scope}`,
        requested_class: "STANDARD", routing_reason: "n/a", routing_version: ROUTING_VERSION,
        fallback_used: false, attempt_chain: [], streamed: false, gateway_ms: Date.now() - t0,
      });
      return this.erroSSE(requestId, "rate_limited", "Demasiados pedidos. Tenta daqui a pouco.");
    }

    // ---- 4. orçamento (pode forçar modelo mais barato em vez de bloquear)
    const orc = await this.budgets.check(assistant.org_id, assistant.id);
    if (!orc.allow) {
      this.logAsync({
        request_id: requestId, trace_id: traceId, org_id: assistant.org_id,
        assistant_id: assistant.id, status: "budget_exceeded", error_code: "budget",
        requested_class: "STANDARD", routing_reason: "n/a", routing_version: ROUTING_VERSION,
        fallback_used: false, attempt_chain: [], streamed: false, gateway_ms: Date.now() - t0,
      });
      return this.erroSSE(requestId, "budget_exceeded", "Serviço temporariamente indisponível.");
    }

    // ---- 5. classificar e rotear (determinístico — nenhum LLM decide)
    const cls = this.classify(req);
    let cadeia = await this.router.chain(assistant.routing_policy_id, cls);
    if (orc.forceModelId) {
      const barato = await this.registry.model(orc.forceModelId);
      if (barato) cadeia = [{ model: barato, role: "PRIMARY", reason: "budget:route_cheaper" }];
    }
    if (cadeia.length === 0) {
      this.incidenteAsync("MODEL_UNHEALTHY", "crit", "Sem modelos disponíveis para routing", assistant);
      return this.erroSSE(requestId, "no_model", "Sem modelo disponível.");
    }

    // ---- 6. montar o pedido (prompt do registo, nunca do browser)
    const mensagens = this.trim(req.messages, assistant);
    const system = await this.systemPrompt(assistant);

    // ---- 7. executar com streaming e fallback silencioso
    const gatewayMs = Date.now() - t0;
    return this.executar({
      requestId, traceId, assistant, cadeia, mensagens, system, cls, gatewayMs, t0,
    });
  }

  // -------------------------------------------------------------------

  private async executar(a: {
    requestId: string; traceId: string; assistant: AssistantRow;
    cadeia: { model: ModelRow; role: string; reason: string }[];
    mensagens: N5Message[]; system: string; cls: RequestClass;
    gatewayMs: number; t0: number;
  }): Promise<Response> {
    const enc = new TextEncoder();
    const self = this;
    const tentativas: AttemptRecord[] = [];

    const stream = new ReadableStream({
      async start(controller) {
        const send = (ev: StreamEvent) =>
          controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));

        send({ type: "start", request_id: a.requestId });

        let ttft: number | undefined;
        let usado: ModelRow | null = null;
        let texto = "";
        let usage: { input?: number; output?: number; cached?: number } | undefined;
        let motivo = "";
        let fallback = false;
        let groundingPedido = false;
        let groundingReal = false;
        let fontesUsadas = 0;

        for (let i = 0; i < a.cadeia.length; i++) {
          const { model, role, reason, maxOutputTokens, grounding, temperature, tokenHeadroom } =
            a.cadeia[i];
          const tTent = Date.now();
          let provider;
          try {
            provider = await self.registry.providerFor(model.provider_id);
          } catch (e) {
            tentativas.push({
              provider_id: model.provider_id, provider_model_id: model.provider_model_id,
              role, status: 0, kind: "permanent", latency_ms: 0, error_code: "provider_init",
            });
            continue;
          }

          try {
            // A regra de routing manda sobre o assistente: uma classe de
            // diagnóstico precisa de mais tokens e de pesquisa do que o
            // teto genérico do assistente permite.
            const it = provider.stream({
              model: model.provider_model_id,
              system: a.system,
              messages: a.mensagens,
              maxOutputTokens: maxOutputTokens ?? a.assistant.max_output_tokens,
              temperature: temperature ?? Number(a.assistant.temperature),
              grounding,
              tokenHeadroom,
              // Pesquisa web e JSON grande demoram mais do que um chat.
              timeoutMs: grounding ? TIMEOUT_GROUNDING_MS : TIMEOUT_TENTATIVA_MS,
            });

            let deuAlgo = false;
            let res = await it.next();
            while (!res.done) {
              const chunk = res.value;
              if (chunk.type === "delta") {
                if (ttft === undefined) ttft = Date.now() - a.t0;
                deuAlgo = true;
                texto += chunk.text;
                send({ type: "delta", text: chunk.text });
              } else if (chunk.type === "usage") {
                usage = chunk.usage;
              }
              res = await it.next();
            }
            const final = res.value;

            tentativas.push({
              provider_id: model.provider_id, provider_model_id: model.provider_model_id,
              role, status: final.status, kind: final.kind,
              latency_ms: Date.now() - tTent, error_code: final.errorCode,
            });
            self.deps.background(
              self.router.record(model, final.ok, final.status, Date.now() - tTent, ttft),
            );

            if (final.ok && (deuAlgo || final.text)) {
              usado = model;
              groundingPedido = !!grounding;
              groundingReal = !!final.groundingUsed;
              fontesUsadas = final.groundingSources ?? 0;
              motivo = reason;
              fallback = i > 0;
              if (!usage && final.usage) usage = final.usage;
              break;
            }
            // falhou: continua para o modelo seguinte (fallback silencioso)
          } catch (e) {
            tentativas.push({
              provider_id: model.provider_id, provider_model_id: model.provider_model_id,
              role, status: 0, kind: "transient", latency_ms: Date.now() - tTent,
              error_code: "exception",
            });
            self.deps.background(self.router.record(model, false, 0));
          }
        }

        const total = Date.now() - a.t0;

        if (!usado) {
          send({ type: "error", code: "all_providers_failed", message: "Não consegui responder agora." });
          controller.close();
          self.logAsync({
            request_id: a.requestId, trace_id: a.traceId, org_id: a.assistant.org_id,
            assistant_id: a.assistant.id, requested_class: a.cls,
            routing_reason: "exhausted", routing_version: ROUTING_VERSION,
            fallback_used: true, fallback_reason: "all_failed",
            attempt_chain: tentativas, status: "error", error_code: "all_providers_failed",
            total_latency_ms: total, gateway_ms: a.gatewayMs, streamed: true,
          });
          self.incidenteAsync("HIGH_ERROR_RATE", "crit",
            "Toda a cadeia de modelos falhou", a.assistant);
          return;
        }

        // Metadados úteis ao cliente — sem revelar fornecedor nem prompt.
        send({ type: "metadata", data: { request_id: a.requestId, fallback_used: fallback, ttft_ms: ttft } });
        send({ type: "done" });
        controller.close();

        // ---- fora do caminho crítico
        const custo = estimateCost(usage, {
          input_cost: usado.input_cost, output_cost: usado.output_cost,
          cached_input_cost: usado.cached_input_cost,
        });
        self.logAsync({
          request_id: a.requestId, trace_id: a.traceId, org_id: a.assistant.org_id,
          assistant_id: a.assistant.id, requested_class: a.cls,
          provider_id: usado.provider_id, model_id: usado.id,
          provider_model_id: usado.provider_model_id,
          routing_reason: motivo, routing_version: ROUTING_VERSION,
          fallback_used: fallback,
          fallback_reason: fallback ? tentativas[0]?.error_code : undefined,
          attempt_chain: tentativas,
          input_tokens: usage?.input, output_tokens: usage?.output, cached_tokens: usage?.cached,
          estimated_cost: custo, ttft_ms: ttft, total_latency_ms: total,
          grounding_pedido: groundingPedido, grounding_usado: groundingReal, grounding_fontes: fontesUsadas,
          gateway_ms: a.gatewayMs, status: "ok", streamed: true,
        });
        if (custo) self.deps.background(self.budgets.commit(a.assistant.org_id, a.assistant.id, custo));
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store",
        "connection": "keep-alive",
        "x-request-id": a.requestId,
      },
    });
  }

  // -------------------------------------------------------------------
  // Auxiliares
  // -------------------------------------------------------------------

  /** P0: classificação barata por heurística. Sem LLM a decidir. */
  private classify(req: ChatRequest): RequestClass {
    if (req.hint_class && req.hint_class !== "STATIC") return req.hint_class;
    const ultima = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const n = ultima.trim().length;
    if (n <= 30) return "SIMPLE";
    if (n > 600) return "COMPLEX";
    return "STANDARD";
  }

  /** Corta o histórico ao âmbito configurado do assistente. */
  private trim(msgs: N5Message[], a: AssistantRow): N5Message[] {
    return msgs
      .filter((m) => m && typeof m.content === "string" && m.content.trim())
      .slice(-a.max_messages)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content.slice(0, a.max_chars_message),
      }));
  }

  /**
   * P0: o prompt vem da coluna do assistente. Em P1 passa a vir de
   * ai_prompts/ai_prompt_versions com versionamento e rollback.
   */
  private async systemPrompt(a: AssistantRow): Promise<string> {
    // system_prompt, NUNCA descricao. A `descricao` é a nota interna da
    // equipa; enviá-la ao modelo foi o bug que fez o piloto responder
    // sem personalidade e em pt-BR.
    const { data } = await this.deps.db
      .from("ai_assistants").select("system_prompt").eq("id", a.id).maybeSingle();
    return (data?.system_prompt ?? "").trim();
  }

  private logAsync(log: Record<string, unknown>) {
    this.deps.background(
      (async () => {
        try { await this.deps.db.from("ai_requests").insert(log); } catch { /* nunca derruba */ }
      })(),
    );
  }

  private incidenteAsync(tipo: string, sev: string, titulo: string, a: AssistantRow) {
    this.deps.background(
      (async () => {
        try {
          await this.deps.db.from("ai_incidents").insert({
            tipo, severidade: sev, titulo, org_id: a.org_id, assistant_id: a.id,
          });
        } catch { /* idem */ }
      })(),
    );
  }

  /** Erro em formato SSE, para o cliente ter sempre o mesmo contrato. */
  private erroSSE(requestId: string, code: string, message: string): Response {
    const enc = new TextEncoder();
    const body = [
      `data: ${JSON.stringify({ type: "start", request_id: requestId })}\n\n`,
      `data: ${JSON.stringify({ type: "error", code, message })}\n\n`,
    ].join("");
    return new Response(enc.encode(body), {
      status: 200, // o erro vai NO stream; o transporte está bem
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store",
        "x-request-id": requestId,
      },
    });
  }
}
