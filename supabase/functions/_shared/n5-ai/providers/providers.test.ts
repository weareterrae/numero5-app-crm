// =====================================================================
// Testes dos adaptadores de fornecedor.
// ---------------------------------------------------------------------
// Vários destes testes existem por causa de bugs REAIS apanhados no
// piloto a 22/08/2026. Cada um está marcado com o incidente que o
// originou, para ninguém os apagar por os achar redundantes.
// =====================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { GoogleProvider } from "./google.ts";
import { OpenAIProvider } from "./openai.ts";
import { classifyStatus, estimateCost, withTimeout } from "./shared.ts";

afterEach(() => vi.restoreAllMocks());

/** Constrói uma Response SSE falsa a partir de linhas de eventos. */
function respostaSSE(eventos: string[]): Response {
  const enc = new TextEncoder();
  return {
    ok: true, status: 200,
    body: new ReadableStream({
      start(c) {
        for (const e of eventos) c.enqueue(enc.encode(e));
        c.close();
      },
    }),
  } as unknown as Response;
}

async function recolher(gen: AsyncGenerator<any, any, void>) {
  const deltas: string[] = [];
  let r = await gen.next();
  while (!r.done) {
    if (r.value.type === "delta") deltas.push(r.value.text);
    r = await gen.next();
  }
  return { deltas, final: r.value };
}

describe("Google · integridade do texto em streaming", () => {
  // BUG 22/08/2026: cada chunk era aparado com .trim(), o que comia os
  // espaços ENTRE chunks. "Bom dia" + " e bem-aparecido" saía como
  // "Bom diae bem-aparecido". Corrompia todas as respostas.
  it("preserva os espaços nas fronteiras entre chunks", async () => {
    const chunk = (t: string) =>
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(async () => respostaSSE([
      chunk("Bom dia"), chunk(" e bem-aparecido."), chunk(" Fazemos sim."),
    ])));

    const p = new GoogleProvider("google", "https://x", "k");
    const { deltas } = await recolher(p.stream({
      model: "m", messages: [{ role: "user", content: "olá" }], timeoutMs: 5000,
    }));

    expect(deltas.join("")).toBe("Bom dia e bem-aparecido. Fazemos sim.");
    expect(deltas.join("")).not.toContain("diae");
  });

  it("descarta partes de raciocínio (thought) sem comer o texto real", async () => {
    const ev = `data: ${JSON.stringify({
      candidates: [{ content: { parts: [
        { text: "a pensar…", thought: true },
        { text: "Resposta." },
      ] } }],
    })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(async () => respostaSSE([ev])));

    const p = new GoogleProvider("google", "https://x", "k");
    const { deltas } = await recolher(p.stream({
      model: "m", messages: [{ role: "user", content: "olá" }], timeoutMs: 5000,
    }));
    expect(deltas.join("")).toBe("Resposta.");
  });

  it("ignora fragmentos JSON incompletos sem rebentar o stream", async () => {
    const bom = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(async () => respostaSSE([`data: {"incomp`, `leto\n\n`, bom])));

    const p = new GoogleProvider("google", "https://x", "k");
    const { deltas, final } = await recolher(p.stream({
      model: "m", messages: [{ role: "user", content: "olá" }], timeoutMs: 5000,
    }));
    expect(deltas.join("")).toBe("ok");
    expect(final.ok).toBe(true);
  });
});

describe("OpenAI · parâmetros do pedido", () => {
  // BUG 22/08/2026: as probes enviavam temperature:0 e os modelos de
  // raciocínio (GPT-5.x) devolviam 400. O disjuntor abria-se contra
  // modelos saudáveis.
  it("NÃO envia temperature quando não é pedida", async () => {
    const spy = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: "OK" } }] }),
    } as unknown as Response));
    vi.stubGlobal("fetch", spy);

    const p = new OpenAIProvider("openai", "https://x", "k");
    await p.generate({ model: "gpt", messages: [{ role: "user", content: "olá" }], timeoutMs: 5000 });

    const corpo = JSON.parse(spy.mock.calls[0][1].body);
    expect(corpo).not.toHaveProperty("temperature");
  });

  it("envia temperature quando é pedida explicitamente", async () => {
    const spy = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: "OK" } }] }),
    } as unknown as Response));
    vi.stubGlobal("fetch", spy);

    const p = new OpenAIProvider("openai", "https://x", "k");
    await p.generate({
      model: "gpt", messages: [{ role: "user", content: "olá" }],
      temperature: 0.7, timeoutMs: 5000,
    });
    expect(JSON.parse(spy.mock.calls[0][1].body).temperature).toBe(0.7);
  });

  it("põe o system como primeira mensagem, não no corpo", async () => {
    const spy = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: "OK" } }] }),
    } as unknown as Response));
    vi.stubGlobal("fetch", spy);

    const p = new OpenAIProvider("openai", "https://x", "k");
    await p.generate({
      model: "gpt", system: "És o Mestre.",
      messages: [{ role: "user", content: "olá" }], timeoutMs: 5000,
    });
    const msgs = JSON.parse(spy.mock.calls[0][1].body).messages;
    expect(msgs[0]).toEqual({ role: "system", content: "És o Mestre." });
  });
});

describe("classifyStatus — decide se vale a pena outro modelo", () => {
  it("trata sobrecarga e falhas do fornecedor como transitórias", () => {
    for (const s of [408, 425, 429, 500, 502, 503, 504]) {
      expect(classifyStatus(s)).toBe("transient");
    }
  });

  it("trata 404 como permanente — não repetir no MESMO modelo", () => {
    // Foi o caso do gemini-2.0-flash (desligado) e do 2.5-pro (sem
    // acesso nesta conta): repetir ali é queimar tempo à toa.
    expect(classifyStatus(404)).toBe("permanent");
    expect(classifyStatus(400)).toBe("permanent");
    expect(classifyStatus(401)).toBe("permanent");
    expect(classifyStatus(403)).toBe("permanent");
  });
});

describe("estimateCost — a conta do dinheiro", () => {
  const precos = { input_cost: 2.0, output_cost: 12.0, cached_input_cost: 0.2 };

  it("calcula input e output por milhão de tokens", () => {
    // 1M input = 2$, 1M output = 12$
    expect(estimateCost({ input: 1_000_000, output: 1_000_000 }, precos)).toBeCloseTo(14, 6);
  });

  it("cobra os tokens em cache à tarifa reduzida, sem os contar duas vezes", () => {
    // 1M input dos quais 1M em cache → só a tarifa de cache
    expect(estimateCost({ input: 1_000_000, cached: 1_000_000, output: 0 }, precos))
      .toBeCloseTo(0.2, 6);
  });

  it("devolve indefinido quando não há uso ou não há preços", () => {
    expect(estimateCost(undefined, precos)).toBeUndefined();
    expect(estimateCost({ input: 100 }, { input_cost: null, output_cost: null, cached_input_cost: null }))
      .toBeUndefined();
  });

  it("nunca devolve custo negativo, mesmo com dados incoerentes", () => {
    // cached > input seria um erro do fornecedor; não pode virar crédito
    const c = estimateCost({ input: 10, cached: 999, output: 0 }, precos);
    expect(c).toBeGreaterThanOrEqual(0);
  });
});

describe("withTimeout — não deixar ligações penduradas", () => {
  it("aborta ao fim do prazo", async () => {
    const { signal, done } = withTimeout(10);
    await new Promise((r) => setTimeout(r, 40));
    expect(signal.aborted).toBe(true);
    done();
  });

  it("respeita um abort externo imediatamente", () => {
    const ext = new AbortController();
    ext.abort();
    const { signal, done } = withTimeout(5000, ext.signal);
    expect(signal.aborted).toBe(true);
    done();
  });

  it("done() limpa o temporizador e não aborta depois", async () => {
    const { signal, done } = withTimeout(20);
    done();
    await new Promise((r) => setTimeout(r, 50));
    expect(signal.aborted).toBe(false);
  });
});
