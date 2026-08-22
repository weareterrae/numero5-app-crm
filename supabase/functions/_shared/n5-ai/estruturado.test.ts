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

describe("pesquisa e JSON não se pedem ao mesmo tempo", () => {
  // Este teste já afirmou o CONTRÁRIO — que os dois modos coexistiam. Era
  // uma suposição minha, nunca medida. Medida a 22/08/2026 contra a API:
  // com `google_search` + `responseMimeType: application/json`, a Google
  // devolve HTTP 200 e ZERO fontes. O modelo deixa de pesquisar e responde
  // de memória, em JSON impecável, com nomes de fontes inventados.
  //
  // Num diagnóstico imobiliário isso é um relatório com preços falsos e ar
  // de verdadeiro. O gateway passou a fazer dois passos (investigar em
  // prosa, formatar depois) e o fornecedor deixou de juntar as duas coisas.

  it("com pesquisa, NÃO força responseMimeType — senão o modelo deixa de pesquisar", async () => {
    const spy = espiarGoogle();
    await new GoogleProvider("google", "https://x", "k").generate({
      model: "gemini-pro-latest", messages: [{ role: "user", content: "diagnóstico" }],
      jsonMode: true, grounding: true, maxOutputTokens: 8000, tokenHeadroom: 6000,
      timeoutMs: 90000,
    });
    const b = corpo(spy);
    expect(b.generationConfig.responseMimeType).toBeUndefined();
    expect(b.tools).toEqual([{ google_search: {} }]);
    expect(b.generationConfig.maxOutputTokens).toBe(14000);
  });

  it("sem pesquisa, o modo JSON continua a valer (é o passo de formatar)", async () => {
    const spy = espiarGoogle();
    await new GoogleProvider("google", "https://x", "k").generate({
      model: "gemini-pro-latest", messages: [{ role: "user", content: "formata isto" }],
      jsonMode: true, maxOutputTokens: 8000, tokenHeadroom: 6000, timeoutMs: 90000,
    });
    const b = corpo(spy);
    expect(b.generationConfig.responseMimeType).toBe("application/json");
    expect(b.tools).toBeUndefined();
  });
});

describe("o thinkingBudget:0 não pode gastar a tentativa", () => {
  // O gemini-flash-lite-latest rejeita `thinkingBudget: 0` com 400
  // INVALID_ARGUMENT. Sem recuperação, todos os diagnósticos falhavam em
  // 142ms e esgotavam a cadeia sem chegar a um modelo bom.
  it("repete sem thinkingConfig depois de um 400", async () => {
    const chamadas: any[] = [];
    const spy = vi.spyOn(globalThis, "fetch" as any).mockImplementation(async (_u: any, init: any) => {
      chamadas.push(JSON.parse(init.body));
      return chamadas.length === 1
        ? new Response("{}", { status: 400 })
        : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 });
    });
    const r = await new GoogleProvider("google", "https://x", "k").generate({
      model: "gemini-flash-lite-latest", messages: [{ role: "user", content: "olá" }], timeoutMs: 5000,
    });
    spy.mockRestore();
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0].generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(chamadas[1].generationConfig.thinkingConfig).toBeUndefined();
    expect(r.ok).toBe(true);
  });
});
