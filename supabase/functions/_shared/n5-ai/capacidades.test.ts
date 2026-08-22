// =====================================================================
// Testes das capacidades por classe: pesquisa web e orçamento de saída.
// ---------------------------------------------------------------------
// Estas regras vieram do código de produção da Terrae, que já tinha
// pago o preço de as descobrir. Falham TODAS em silêncio — sem estes
// testes, um diagnóstico sem fontes ou truncado a meio passa por bom.
// =====================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { GoogleProvider } from "./providers/google.ts";

afterEach(() => vi.restoreAllMocks());

function espiar() {
  const spy = vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
  } as unknown as Response));
  vi.stubGlobal("fetch", spy);
  return spy;
}
const corpo = (spy: any) => JSON.parse(spy.mock.calls[0]?.[1]?.body ?? "{}");

describe("Google · pesquisa web (grounding)", () => {
  it("liga google_search quando a classe o exige", async () => {
    const spy = espiar();
    const p = new GoogleProvider("google", "https://x", "k");
    await p.generate({
      model: "gemini-pro-latest", messages: [{ role: "user", content: "€/m² em Oeiras?" }],
      grounding: true, timeoutMs: 5000,
    });
    expect(corpo(spy).tools).toEqual([{ google_search: {} }]);
  });

  it("NÃO liga pesquisa num chat normal — custo e latência à toa", async () => {
    const spy = espiar();
    const p = new GoogleProvider("google", "https://x", "k");
    await p.generate({
      model: "gemini-flash-lite-latest", messages: [{ role: "user", content: "olá" }],
      timeoutMs: 5000,
    });
    expect(corpo(spy)).not.toHaveProperty("tools");
  });
});

describe("Google · orçamento de saída e thinking", () => {
  // Sintoma real documentado no código da Terrae: respostas cortadas a
  // meio ("…2.98") porque o raciocínio consumiu o orçamento. O teto é
  // um LIMITE, não um gasto — por isso vai sempre com folga.
  it("soma folga ao teto pedido", async () => {
    const spy = espiar();
    const p = new GoogleProvider("google", "https://x", "k");
    await p.generate({
      model: "gemini-pro-latest", messages: [{ role: "user", content: "x" }],
      maxOutputTokens: 8000, tokenHeadroom: 6000, timeoutMs: 5000,
    });
    expect(corpo(spy).generationConfig.maxOutputTokens).toBe(14000);
  });

  it("usa folga por omissão mesmo sem a pedirem", async () => {
    const spy = espiar();
    const p = new GoogleProvider("google", "https://x", "k");
    await p.generate({
      model: "gemini-pro-latest", messages: [{ role: "user", content: "x" }],
      maxOutputTokens: 800, timeoutMs: 5000,
    });
    // 800 de conteúdo + 6000 de folga por defeito
    expect(corpo(spy).generationConfig.maxOutputTokens).toBe(6800);
  });

  it("NÃO envia thinkingBudget ao Pro — dá 400", async () => {
    const spy = espiar();
    const p = new GoogleProvider("google", "https://x", "k");
    await p.generate({
      model: "gemini-pro-latest", messages: [{ role: "user", content: "x" }], timeoutMs: 5000,
    });
    expect(corpo(spy).generationConfig).not.toHaveProperty("thinkingConfig");
  });

  it("pede thinkingBudget:0 nos flash — mas o teto tem folga na mesma", async () => {
    const spy = espiar();
    const p = new GoogleProvider("google", "https://x", "k");
    await p.generate({
      model: "gemini-3.5-flash", messages: [{ role: "user", content: "x" }],
      maxOutputTokens: 800, timeoutMs: 5000,
    });
    const c = corpo(spy).generationConfig;
    expect(c.thinkingConfig).toEqual({ thinkingBudget: 0 });
    // A folga existe PORQUE o pedido pode ser ignorado sem dar erro.
    expect(c.maxOutputTokens).toBeGreaterThan(800);
  });
});
