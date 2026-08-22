// =====================================================================
// Testes da investigação em várias passagens
// ---------------------------------------------------------------------
// É a peça de que mais depende a credibilidade dos relatórios da Terrae,
// e falha em silêncio de duas maneiras:
//
//  · uma passagem só traz anúncios, e anúncios são o que se PEDE, não o
//    que se fecha — o valor sai sistematicamente inflacionado;
//  · se as passagens seguintes não virem o que as anteriores apuraram,
//    repetem a mesma busca e a última nunca chega a contrariar nada.
//
// Estes testes fixam as duas coisas. O prompt exato pode mudar; o que
// não pode mudar é cada passagem receber o apurado e um ângulo próprio.
// =====================================================================
import { describe, it, expect, vi } from "vitest";
import { Gateway } from "./gateway.ts";

/** Fornecedor de mentira que regista o que lhe pedem. */
function fornecedorEspiao(respostas: string[]) {
  const pedidos: any[] = [];
  return {
    pedidos,
    generate: vi.fn(async (o: any) => {
      pedidos.push(o);
      return {
        ok: true,
        text: respostas[pedidos.length - 1] ?? "sem mais nada",
        status: 200,
        kind: "ok" as const,
        groundingUsed: true,
        groundingSources: 2,
        groundingUris: [`fonte-${pedidos.length}.pt`],
        usage: { input: 100, output: 50 },
      };
    }),
    stream: vi.fn(),
  };
}

/** Chama o método privado sem expor a classe inteira nos testes. */
function investigar(gw: Gateway, args: any) {
  return (gw as any).investigar(args);
}

function montar(provider: any) {
  const gw = Object.create(Gateway.prototype) as Gateway;
  (gw as any).registry = { providerFor: async () => provider };
  // A investigação regista a saúde de cada modelo que tenta — é assim que o
  // disjuntor aprende que o modelo da frente está doente.
  (gw as any).router = { record: async () => {} };
  (gw as any).deps = { background: (p: Promise<unknown>) => { void p; } };
  return gw;
}

const cadeia = [{ model: { provider_id: "google", provider_model_id: "gemini-pro-latest", supports_grounding: true } }];
const base = {
  cadeia,
  mensagens: [{ role: "user" as const, content: "Quanto vale este T3?" }],
  system: "És o motor de avaliação.",
  assistant: {} as any,
};

describe("investigação em várias passagens", () => {
  it("faz tantas chamadas quantas as passagens pedidas", async () => {
    const p = fornecedorEspiao(["anúncios", "dados oficiais", "contradições", "o que falta"]);
    await investigar(montar(p), { ...base, passos: 4 });
    expect(p.pedidos).toHaveLength(4);
  });

  it("cada passagem vê o que as anteriores apuraram", async () => {
    const p = fornecedorEspiao(["ANUNCIOS-X", "OFICIAIS-Y", "CONTRA-Z"]);
    await investigar(montar(p), { ...base, passos: 3 });
    // a primeira não tem nada atrás
    expect(p.pedidos[0].messages[0].content).not.toContain("JÁ APURASTE");
    // a segunda vê a primeira; a terceira vê as duas
    expect(p.pedidos[1].messages[0].content).toContain("ANUNCIOS-X");
    expect(p.pedidos[2].messages[0].content).toContain("ANUNCIOS-X");
    expect(p.pedidos[2].messages[0].content).toContain("OFICIAIS-Y");
  });

  it("a última passagem procura o que CONTRADIZ — é o que corrige o valor", async () => {
    const p = fornecedorEspiao(["a", "b", "c"]);
    await investigar(montar(p), { ...base, passos: 3 });
    expect(p.pedidos[2].messages[0].content).toMatch(/CONTRADIZ/);
  });

  it("nenhuma passagem pede JSON — pedi-lo desliga a pesquisa", async () => {
    const p = fornecedorEspiao(["a", "b"]);
    await investigar(montar(p), { ...base, passos: 2 });
    for (const pedido of p.pedidos) {
      expect(pedido.jsonMode).toBe(false);
      expect(pedido.grounding).toBe(true);
      // O system fala de JSON, mas para o PROIBIR. É essa a instrução que
      // mantém a pesquisa ligada.
      expect(pedido.system).toMatch(/Não uses JSON/i);
    }
  });

  it("junta as fontes de todas as passagens, sem repetir", async () => {
    const p = fornecedorEspiao(["a", "b", "c"]);
    const r = await investigar(montar(p), { ...base, passos: 3 });
    expect(r.fontes).toBe(3);
    expect(r.mensagens[0].content).toContain("fonte-1.pt");
    expect(r.mensagens[0].content).toContain("fonte-3.pt");
  });

  it("soma os tokens de TODAS as passagens — senão o custo aparece a menos", async () => {
    const p = fornecedorEspiao(["a", "b", "c", "d"]);
    const r = await investigar(montar(p), { ...base, passos: 4 });
    expect(r.usage.input).toBe(400);
    expect(r.usage.output).toBe(200);
  });

  it("manda cobrir a divergência em vez de escolher um número bonito", async () => {
    const p = fornecedorEspiao(["a", "b"]);
    const r = await investigar(montar(p), { ...base, passos: 2 });
    expect(r.mensagens[0].content).toMatch(/confiança NÃO pode ser alta/);
  });

  it("proíbe acrescentar fontes — o modelo enche o campo com nomes plausíveis", async () => {
    const p = fornecedorEspiao(["a"]);
    const r = await investigar(montar(p), { ...base, passos: 1 });
    expect(r.mensagens[0].content).toMatch(/não acrescentes nenhuma/);
  });

  it("se uma passagem falhar a meio, aproveita o que já apurou", async () => {
    const p = fornecedorEspiao(["primeira boa"]);
    p.generate = vi.fn(async (o: any) => {
      p.pedidos.push(o);
      return p.pedidos.length === 1
        ? { ok: true, text: "primeira boa", status: 200, kind: "ok" as const, groundingUsed: true, groundingSources: 1, groundingUris: ["a.pt"], usage: { input: 10, output: 5 } }
        : { ok: false, text: "", status: 503, kind: "transient" as const };
    });
    const r = await investigar(montar(p), { ...base, passos: 4 });
    expect(r).not.toBeNull();
    expect(r.mensagens[0].content).toContain("primeira boa");
  });

  it("sem nada apurado devolve null — quem chama segue pelo caminho antigo", async () => {
    const p = fornecedorEspiao([]);
    p.generate = vi.fn(async () => ({ ok: false, text: "", status: 500, kind: "transient" as const }));
    expect(await investigar(montar(p), { ...base, passos: 3 })).toBeNull();
  });

  it("dá sinal de vida a cada passagem — a ligação cai aos 150s sem bytes", async () => {
    const p = fornecedorEspiao(["a", "b", "c"]);
    const sinais: number[] = [];
    await investigar(montar(p), { ...base, passos: 3, sinal: (passo: number) => sinais.push(passo) });
    expect(sinais).toEqual([1, 2, 3]);
  });

  it("não passa dos ângulos que existem, mesmo que peçam mais", async () => {
    const p = fornecedorEspiao(["a", "b", "c", "d", "e", "f"]);
    await investigar(montar(p), { ...base, passos: 99 });
    expect(p.pedidos.length).toBeLessThanOrEqual(4);
  });
});

describe("a pesquisa também tem rede", () => {
  // Era a única parte do sistema sem fallback. Bastava o modelo da frente
  // devolver um 503 para a investigação morrer e o relatório sair sem uma
  // única fonte — com ar de bom. A 22/08/2026 o gemini-pro em sobrecarga
  // fez isso em 39 de 99 relatórios.
  function doisModelos() {
    const tentados: string[] = [];
    const provider = {
      generate: async (o: any) => {
        tentados.push(o.model);
        if (o.model === "mau") return { ok: false, text: "", status: 503, kind: "transient" as const };
        return {
          ok: true, text: "factos", status: 200, kind: "ok" as const,
          groundingUsed: true, groundingSources: 2, groundingUris: ["a.pt", "b.pt"],
          usage: { input: 10, output: 5 },
        };
      },
      stream: vi.fn(),
    };
    const gw = montar(provider);
    return { gw, tentados };
  }

  const cadeiaDupla = [
    { model: { provider_id: "google", provider_model_id: "mau", supports_grounding: true } },
    { model: { provider_id: "google", provider_model_id: "bom", supports_grounding: true } },
  ];

  it("se o melhor modelo falhar, tenta o seguinte na mesma passagem", async () => {
    const { gw, tentados } = doisModelos();
    const r = await investigar(gw, { ...base, cadeia: cadeiaDupla, passos: 1 });
    expect(tentados).toEqual(["mau", "bom"]);
    expect(r).not.toBeNull();
    expect(r.fontes).toBe(2);
  });

  it("mantém a ordem: o melhor primeiro, sempre", async () => {
    const { gw, tentados } = doisModelos();
    await investigar(gw, { ...base, cadeia: cadeiaDupla, passos: 2 });
    // duas passagens, e cada uma volta a começar pelo melhor
    expect(tentados).toEqual(["mau", "bom", "mau", "bom"]);
  });

  it("ignora modelos que não sabem pesquisar", async () => {
    const { gw, tentados } = doisModelos();
    await investigar(gw, {
      ...base,
      cadeia: [
        { model: { provider_id: "openai", provider_model_id: "sem-pesquisa", supports_grounding: false } },
        ...cadeiaDupla,
      ],
      passos: 1,
    });
    expect(tentados).not.toContain("sem-pesquisa");
  });
});
