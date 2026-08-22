// =====================================================================
// Adaptador Google (Gemini) — API generativelanguage v1beta
// ---------------------------------------------------------------------
// Porta a resiliência que já existia em lib/ia/provider.ts e nos sites,
// mas SEM listas de modelos escritas à mão: o modelo vem sempre do
// registo (ai_models). Esta é a mudança que evita repetir o incidente
// de 21/08/2026.
// =====================================================================

import type {
  AIProvider, GenerateOptions, ProviderResult, StreamChunk, TokenUsage,
} from "../types.ts";
import { classifyStatus, withTimeout } from "./shared.ts";

export class GoogleProvider implements AIProvider {
  constructor(
    readonly id: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private body(opts: GenerateOptions) {
    const conteudo = opts.maxOutputTokens ?? 1024;
    // FOLGA — lição do código da Terrae, com sintomas reais documentados
    // (respostas cortadas a meio, "…2.98"). `thinkingBudget: 0` dá 400 no
    // Pro e é IGNORADO em silêncio por alguns flash recentes: pensam à
    // mesma e o raciocínio consome o orçamento de saída. Como
    // maxOutputTokens é um TETO e não um gasto, dar folga é seguro e
    // evita truncar.
    const folga = opts.tokenHeadroom ?? 6000;

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: conteudo + folga,
      temperature: opts.temperature ?? 0.7,
    };
    // Só desligamos o thinking nos flash — no Pro devolve 400. E mesmo
    // nos flash tratamos isto como pedido, não como garantia.
    if (/flash/i.test(opts.model)) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const body: Record<string, unknown> = {
      contents: opts.messages.map((m) => ({
        // A Gemini não tem role 'system' nos contents; vai em system_instruction.
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig,
    };
    if (opts.system) body.system_instruction = { parts: [{ text: opts.system }] };
    // Pesquisa web real. Sem isto, um prompt que proíbe citar números não
    // vindos da pesquisa devolve campos vazios — que é como os
    // diagnósticos da Terrae deixariam de funcionar.
    if (opts.grounding) body.tools = [{ google_search: {} }];
    return body;
  }

  /**
   * Junta as partes, descartando o "thinking" (parts com thought: true).
   *
   * ⚠️ `trim` TEM de ser false no streaming. Cada chunk é um pedaço de
   * uma frase: se cada um for aparado, os espaços entre chunks
   * desaparecem e o texto sai colado — "Bom dia" + " e bem-aparecido"
   * vira "Bom diae bem-aparecido". Bug real apanhado no piloto a
   * 22/08/2026. Só a resposta COMPLETA pode ser aparada.
   */
  private extractText(data: unknown, trim = true): string {
    const d = data as Record<string, any>;
    const parts = d?.candidates?.[0]?.content?.parts ?? [];
    const texto = parts
      .filter((p: any) => p && typeof p.text === "string" && !p.thought)
      .map((p: any) => p.text)
      .join("");
    return trim ? texto.trim() : texto;
  }

  private usageFrom(data: unknown): TokenUsage | undefined {
    const u = (data as Record<string, any>)?.usageMetadata;
    if (!u) return undefined;
    return {
      input: u.promptTokenCount,
      output: u.candidatesTokenCount,
      cached: u.cachedContentTokenCount,
    };
  }

  async generate(opts: GenerateOptions): Promise<ProviderResult> {
    const { signal, done } = withTimeout(opts.timeoutMs, opts.signal);
    try {
      const r = await fetch(`${this.baseUrl}/models/${opts.model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": this.apiKey, "content-type": "application/json" },
        body: JSON.stringify(this.body(opts)),
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
      return {
        ok: true, text: this.extractText(data), status: 200, kind: "ok",
        usage: this.usageFrom(data),
      };
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
    let groundingUsado = false;
    let fontes = 0;
    try {
      // alt=sse devolve Server-Sent Events, igual em forma ao da OpenAI
      const url = `${this.baseUrl}/models/${opts.model}:streamGenerateContent?alt=sse`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "x-goog-api-key": this.apiKey, "content-type": "application/json" },
        body: JSON.stringify(this.body(opts)),
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
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (!payload) continue;
          try {
            const j = JSON.parse(payload);
            // Ter a ferramenta disponível NÃO garante que o modelo a usou:
            // ele decide. Um diagnóstico respondido de memória parece bom
            // e não tem fontes — por isso registamos se houve mesmo
            // pesquisa, para se poder medir.
            const gm = j?.candidates?.[0]?.groundingMetadata;
            if (gm && (gm.groundingChunks?.length || gm.webSearchQueries?.length)) {
              groundingUsado = true;
              fontes = gm.groundingChunks?.length ?? fontes;
            }
            const text = this.extractText(j, false);   // NUNCA aparar um chunk
            if (text) {
              full += text;
              yield { type: "delta", text };
            }
            const fr = j?.candidates?.[0]?.finishReason;
            if (fr) finishReason = fr;
            const u = this.usageFrom(j);
            if (u) usage = u;   // a Gemini reenvia o total acumulado
          } catch { /* fragmento incompleto */ }
        }
      }

      if (usage) yield { type: "usage", usage };
      yield { type: "done", finishReason };
      return { ok: true, text: full, status: 200, kind: "ok", usage, groundingUsed: groundingUsado, groundingSources: fontes };
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
