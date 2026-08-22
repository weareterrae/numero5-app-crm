// =====================================================================
// Testes da saída estruturada e do system dinâmico.
// ---------------------------------------------------------------------
// Estes dois modos são poderosos e falham em silêncio:
//  · sem JSON garantido, a avaliação de um consultor da Academia
//    devolve prosa e o JSON.parse do chamador rebenta (ou pior: passa
//    lixo que ninguém valida);
//  · quem envia o system controla o assistente — por isso a autorização
//    tem de ser por assistente, nunca geral.
// =====================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { GoogleProvider } from "./providers/google.ts";
import { OpenAIProvider } from "./providers/openai.ts";

afterEach(() => vi.restoreAllMocks());

function espiarGoogle() {
  const spy = vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }),
  } as unknown as Response));
  vi.stubGlobal("fetch", spy);
  return spy;
}
function espiarOpenAI() {
  const spy = vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content: "{}" } }] }),
  } as unknown as Response));
  vi.stubGlobal("fetch", spy);
  return spy;
}
const corpo = (spy: any) => JSON.parse(spy.mock.calls[0]?.[1]?.body ?? "{}");

describe("saída estruturada · Google", () => {
  it("pede responseMimeType JSON quando o modo é ligado", async () => {
    const spy = espiarGoogle();
    await new GoogleProvider("google", "https://x", "k").generate({
      model: "gemini-pro-latest", messages: [{ role: "user", content: "avalia" }],
      jsonMode: true, timeoutMs: 5000,
    });
    expect(corpo(spy).generationConfig.responseMimeType).toBe("application/json");
  });

  it("não pede JSON numa conversa normal", async () => {
    const spy = espiarGoogle();
    await new GoogleProvider("google", "https://x", "k").generate({
      model: "gemini-pro-latest", messages: [{ role: "user", content: "olá" }], timeoutMs: 5000,
    });
    expect(corpo(spy).generationConfig).not.toHaveProperty("responseMimeType");
  });
});

describe("saída estruturada · OpenAI", () => {
  it("pede response_format json_object", async () => {
    const spy = espiarOpenAI();
    await new OpenAIProvider("openai", "https://x", "k").generate({
      model: "gpt-5.4-mini", messages: [{ role: "user", content: "avalia em JSON" }],
      jsonMode: true, timeoutMs: 5000,
    });
    expect(corpo(spy).response_format).toEqual({ type: "json_object" });
  });

  it("não pede formato numa conversa normal", async () => {
    const spy = espiarOpenAI();
    await new OpenAIProvider("openai", "https://x", "k").generate({
      model: "gpt-5.4-mini", messages: [{ role: "user", content: "olá" }], timeoutMs: 5000,
    });
    expect(corpo(spy)).not.toHaveProperty("response_format");
  });
});

describe("os dois modos combinam com o resto sem se anularem", () => {
  it("JSON + pesquisa + folga de tokens coexistem", async () => {
    const spy = espiarGoogle();
    await new GoogleProvider("google", "https://x", "k").generate({
      model: "gemini-pro-latest", messages: [{ role: "user", content: "diagnóstico" }],
      jsonMode: true, grounding: true, maxOutputTokens: 8000, tokenHeadroom: 6000,
      timeoutMs: 90000,
    });
    const b = corpo(spy);
    expect(b.generationConfig.responseMimeType).toBe("application/json");
    expect(b.tools).toEqual([{ google_search: {} }]);
    expect(b.generationConfig.maxOutputTokens).toBe(14000);
  });
});
