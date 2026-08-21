// =====================================================================
// Adaptador Anthropic — Messages API
// ---------------------------------------------------------------------
// Preparado e testável, mas o fornecedor entra DESLIGADO no registo
// (ai_providers.enabled = false) até a chave estar no ambiente. Ligar
// é um UPDATE, não um deploy.
// =====================================================================

import type {
  AIProvider, GenerateOptions, ProviderResult, StreamChunk, TokenUsage,
} from "../types.ts";
import { classifyStatus, withTimeout } from "./shared.ts";

const API_VERSION = "2023-06-01";

export class AnthropicProvider implements AIProvider {
  constructor(
    readonly id: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      "x-api-key": this.apiKey,
      "anthropic-version": API_VERSION,
      "content-type": "application/json",
    };
  }

  private body(opts: GenerateOptions, stream: boolean) {
    return {
      model: opts.model,
      // Na Anthropic o system é um campo próprio, não uma mensagem.
      ...(opts.system ? { system: opts.system } : {}),
      messages: opts.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
      max_tokens: opts.maxOutputTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      stream,
    };
  }

  private usageFrom(u: unknown): TokenUsage | undefined {
    if (!u || typeof u !== "object") return undefined;
    const o = u as Record<string, any>;
    return {
      input: o.input_tokens,
      output: o.output_tokens,
      cached: o.cache_read_input_tokens,
    };
  }

  async generate(opts: GenerateOptions): Promise<ProviderResult> {
    const { signal, done } = withTimeout(opts.timeoutMs, opts.signal);
    try {
      const r = await fetch(`${this.baseUrl}/messages`, {
        method: "POST", headers: this.headers(),
        body: JSON.stringify(this.body(opts, false)), signal,
      });
      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        return {
          ok: false, text: "", status: r.status, kind: classifyStatus(r.status),
          errorCode: String(r.status), errorMessage: errText.slice(0, 300),
        };
      }
      const data = await r.json();
      const text = (data?.content ?? [])
        .filter((b: any) => b?.type === "text").map((b: any) => b.text).join("").trim();
      return { ok: true, text, status: 200, kind: "ok", usage: this.usageFrom(data?.usage) };
    } catch (e) {
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
      const r = await fetch(`${this.baseUrl}/messages`, {
        method: "POST", headers: this.headers(),
        body: JSON.stringify(this.body(opts, true)), signal,
      });
      if (!r.ok || !r.body) {
        const errText = await r.text().catch(() => "");
        return {
          ok: false, text: "", status: r.status, kind: classifyStatus(r.status),
          errorCode: String(r.status), errorMessage: errText.slice(0, 300),
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
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          try {
            const j = JSON.parse(t.slice(5).trim());
            if (j?.type === "content_block_delta" && typeof j?.delta?.text === "string") {
              full += j.delta.text;
              yield { type: "delta", text: j.delta.text };
            }
            if (j?.type === "message_delta") {
              if (j?.delta?.stop_reason) finishReason = j.delta.stop_reason;
              if (j?.usage) usage = { ...usage, output: j.usage.output_tokens };
            }
            if (j?.type === "message_start" && j?.message?.usage) {
              usage = { ...this.usageFrom(j.message.usage), ...usage };
            }
          } catch { /* fragmento incompleto */ }
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
