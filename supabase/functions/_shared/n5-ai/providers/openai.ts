// =====================================================================
// Adaptador OpenAI — serve TAMBÉM o AWS Bedrock
// ---------------------------------------------------------------------
// Validado na documentação AWS a 21/08/2026: o Bedrock expõe os modelos
// GPT-5.6 (Sol/Terra/Luna) numa superfície compatível com a OpenAI, em
//   https://bedrock-runtime.{region}.amazonaws.com/openai/v1
// Por isso o MESMO adaptador serve os dois: muda o base_url e a chave,
// que vêm do registo (ai_providers). Acrescentar o Bedrock passa a ser
// configuração, não código.
//
// Nota Bedrock: o modelo tem de nomear um perfil de inferência
// cross-region (ex.: 'global.openai.gpt-5.6-terra'). Isso já está
// guardado em ai_models.provider_model_id — o adaptador não sabe nem
// precisa de saber.
// =====================================================================

import type {
  AIProvider, GenerateOptions, ProviderResult, StreamChunk, TokenUsage,
} from "../types.ts";
import { classifyStatus, withTimeout } from "./shared.ts";

export class OpenAIProvider implements AIProvider {
  constructor(
    readonly id: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      "authorization": `Bearer ${this.apiKey}`,
      "content-type": "application/json",
    };
  }

  private body(opts: GenerateOptions, stream: boolean) {
    const messages = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    for (const m of opts.messages) messages.push({ role: m.role, content: m.content });
    const body: Record<string, unknown> = {
      model: opts.model,
      messages,
      max_completion_tokens: opts.maxOutputTokens ?? 1024,
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
    };
    // Os modelos de raciocínio (família GPT-5.x) rejeitam temperature
    // diferente do valor por omissão com HTTP 400. Só a enviamos quando
    // é pedida explicitamente — apanhado nas probes a 22/08/2026.
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    // Saida estruturada. O prompt TEM de pedir JSON explicitamente, senao a
    // OpenAI recusa com 400 — por isso o gateway valida antes de enviar.
    if (opts.jsonMode) body.response_format = { type: "json_object" };
    return body;
  }

  private usageFrom(u: unknown): TokenUsage | undefined {
    if (!u || typeof u !== "object") return undefined;
    const o = u as Record<string, unknown>;
    const details = (o.prompt_tokens_details ?? {}) as Record<string, unknown>;
    return {
      input: typeof o.prompt_tokens === "number" ? o.prompt_tokens : undefined,
      output: typeof o.completion_tokens === "number" ? o.completion_tokens : undefined,
      cached: typeof details.cached_tokens === "number" ? details.cached_tokens : undefined,
    };
  }

  async generate(opts: GenerateOptions): Promise<ProviderResult> {
    const { signal, done } = withTimeout(opts.timeoutMs, opts.signal);
    try {
      const r = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.body(opts, false)),
        signal,
      });
      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        return {
          ok: false, text: "", status: r.status,
          kind: classifyStatus(r.status),
          errorCode: String(r.status),
          errorMessage: errText.slice(0, 300),
        };
      }
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content ?? "";
      return { ok: true, text, status: 200, kind: "ok", usage: this.usageFrom(data?.usage) };
    } catch (e) {
      // AbortError (timeout) ou falha de rede → vale a pena tentar outro modelo
      return {
        ok: false, text: "", status: 0, kind: "transient",
        errorCode: "network", errorMessage: String(e).slice(0, 200),
      };
    } finally {
      done();
    }
  }

  async *stream(opts: GenerateOptions): AsyncGenerator<StreamChunk, ProviderResult, void> {
    const { signal, done } = withTimeout(opts.timeoutMs, opts.signal);
    let usage: TokenUsage | undefined;
    let full = "";
    try {
      const r = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.body(opts, true)),
        signal,
      });
      if (!r.ok || !r.body) {
        const errText = await r.text().catch(() => "");
        return {
          ok: false, text: "", status: r.status,
          kind: classifyStatus(r.status),
          errorCode: String(r.status),
          errorMessage: errText.slice(0, 300),
        };
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finishReason: string | undefined;

      while (true) {
        const { done: end, value } = await reader.read();
        if (end) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE: eventos separados por linha em branco; dados em 'data: '
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            const delta = j?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              full += delta;
              yield { type: "delta", text: delta };
            }
            const fr = j?.choices?.[0]?.finish_reason;
            if (fr) finishReason = fr;
            if (j?.usage) usage = this.usageFrom(j.usage);
          } catch { /* fragmento incompleto — ignora */ }
        }
      }

      if (usage) yield { type: "usage", usage };
      yield { type: "done", finishReason };
      return { ok: true, text: full, status: 200, kind: "ok", usage };
    } catch (e) {
      return {
        ok: false, text: full, status: 0, kind: "transient",
        errorCode: "network", errorMessage: String(e).slice(0, 200),
      };
    } finally {
      done();
    }
  }

  async health(model: string): Promise<{ ok: boolean; latencyMs: number; status: number }> {
    const t0 = Date.now();
    // Probe deliberadamente mínima: custo desprezável.
    const res = await this.generate({
      model,
      messages: [{ role: "user", content: "Respond only with OK." }],
      // 32 tokens: os modelos de raciocínio gastam orçamento a pensar
      // antes de emitir texto; com 5 devolviam 400.
      maxOutputTokens: 32,
      // temperature NÃO é enviada de propósito (ver body()).
      timeoutMs: 15000,
    });
    return { ok: res.ok, latencyMs: Date.now() - t0, status: res.status };
  }
}
