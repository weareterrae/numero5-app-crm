import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { obterIA, lerJson } from "./provider";

// Respostas Gemini falsas (só os campos que o provider lê).
function respOk(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    text: async () => "",
  } as unknown as Response;
}
function respErro(status: number, body = "") {
  return { ok: false, status, json: async () => ({}), text: async () => body } as unknown as Response;
}

const AMBIENTE = { ...process.env };
beforeEach(() => {
  process.env.IA_PROVIDER = "gemini";
  process.env.IA_API_KEY = "chave-de-teste";
  process.env.IA_MODELO = "m-primario";
  process.env.IA_MODELO_FALLBACK = "m-fallback";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env = { ...AMBIENTE };
});

describe("lerJson", () => {
  it("lê JSON puro", () => expect(lerJson('{"a":1}')).toEqual({ a: 1 }));
  it("lê JSON com texto à volta", () => expect(lerJson('aqui vai {"a":1} fim')).toEqual({ a: 1 }));
  it("devolve null se não houver JSON", () => expect(lerJson("sem json nenhum")).toBeNull());
  it("devolve null com JSON malformado", () => expect(lerJson("{ partido")).toBeNull());
});

describe("provider resiliente", () => {
  it("repete num 503 transitório e depois tem sucesso", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respErro(503, "overloaded"))
      .mockResolvedValueOnce(respOk("olá"));
    vi.stubGlobal("fetch", fetchMock);

    const r = await obterIA()!.gerar({ sistema: "s", utilizador: "u" });
    expect(r).toEqual({ ok: true, texto: "olá" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cai para o modelo alternativo quando o primário dá erro permanente", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respErro(400, "modelo inválido")) // m-primario (permanente)
      .mockResolvedValueOnce(respOk("do fallback")); // m-fallback
    vi.stubGlobal("fetch", fetchMock);

    const r = await obterIA()!.gerar({ sistema: "s", utilizador: "u" });
    expect(r).toEqual({ ok: true, texto: "do fallback" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("m-primario");
    expect(String(fetchMock.mock.calls[1][0])).toContain("m-fallback");
  });

  it("um erro permanente não repete no mesmo modelo", async () => {
    process.env.IA_MODELO_FALLBACK = "m-primario"; // dedup → um só modelo
    const fetchMock = vi.fn().mockResolvedValue(respErro(401, "chave inválida"));
    vi.stubGlobal("fetch", fetchMock);

    const r = await obterIA()!.gerar({ sistema: "s", utilizador: "u" });
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // permanente → sem retry
  });

  it("desiste (ok:false) quando a rede/timeout falha sempre", async () => {
    process.env.IA_MODELO_FALLBACK = "m-primario"; // um só modelo → menos esperas
    const fetchMock = vi.fn().mockRejectedValue(new Error("AbortError"));
    vi.stubGlobal("fetch", fetchMock);

    const r = await obterIA()!.gerar({ sistema: "s", utilizador: "u", timeoutMs: 10 });
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 3 tentativas no único modelo
  }, 10000);

  it("sem IA_API_KEY, obterIA devolve null", () => {
    delete process.env.IA_API_KEY;
    expect(obterIA()).toBeNull();
  });
});
