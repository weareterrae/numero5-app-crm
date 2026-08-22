// =====================================================================
// Testes das verificações de qualidade dos dados
// ---------------------------------------------------------------------
// Todos os defeitos aqui verificados JÁ ACONTECERAM neste sistema, num
// único dia. Não são hipóteses — são a lista do que correu mal e demorou
// a ser visto, porque nada nesta camada grita quando corre mal.
// =====================================================================
import { describe, it, expect } from "vitest";
import { verificar, type Benchmark, type Transacao, type Amostra } from "./qualidade-dados";

const HOJE = new Date("2026-08-22T12:00:00Z");

const bm = (x: Partial<Benchmark> = {}): Benchmark => ({
  id: "b1", fonte_id: "sir", geografia_id: "g1",
  geografia_nome: "Alcabideche", geografia_nivel: "freguesia",
  tipo_imovel: "apartamento", tipologia: "T3",
  eur_m2_medio: 5000, n_transacoes: 9000,
  periodo: "2026-06", periodo_fim: "2026-06-30",
  desconto_medio: -0.12, extra: null, ...x,
});

const so = (b: Partial<Benchmark> = {}) =>
  verificar({ benchmarks: [bm(b)], transacoes: [], amostras: [] }, HOJE);

describe("o preço por fogo na coluna do €/m²", () => {
  it("apanha as duas ordens de grandeza", () => {
    // 944.075 € é um preço de fogo. Já foi parar ao €/m² duas vezes ao
    // construir o leitor de PDF, e é plausível à vista nos dois sítios.
    const r = so({ eur_m2_medio: 944075 });
    expect(r[0]).toMatchObject({ tipo: "eur_m2_impossivel", severidade: "grave" });
  });

  it("não se queixa de um €/m² caro mas real", () => {
    // O Chiado existe. Um teto apertado de mais recusaria mercado a sério.
    expect(so({ eur_m2_medio: 9800 })).toHaveLength(0);
  });

  it("apanha o valor em falta", () => {
    expect(so({ eur_m2_medio: null })[0].tipo).toBe("benchmark_sem_valor");
  });
});

describe("indicadores que se contradizem a si próprios", () => {
  it("um price gap positivo diria que se escritura acima do pedido", () => {
    expect(so({ desconto_medio: 0.08 })[0].tipo).toBe("price_gap_estranho");
  });

  it("aceita o desconto normal do mercado português", () => {
    expect(so({ desconto_medio: -0.266 })).toHaveLength(0);
  });
});

describe("números que envelheceram", () => {
  it("seis meses ainda passam; um ano é grave", () => {
    expect(so({ periodo: "2026-04", periodo_fim: "2026-04-30" })).toHaveLength(0);
    const velho = so({ periodo: "2025-06", periodo_fim: "2025-06-30" });
    expect(velho[0]).toMatchObject({ tipo: "benchmark_velho", severidade: "grave" });
  });
});

describe("derivados que não derivam de nada", () => {
  it("um concelho tirado de uma zona só é o retângulo com outro nome", () => {
    const r = so({ extra: { derivado: true, de_zonas: ["Caparica"] } });
    expect(r[0]).toMatchObject({ tipo: "derivado_de_uma_zona", severidade: "grave" });
  });

  it("de duas zonas já é um agregado", () => {
    expect(so({ extra: { derivado: true, de_zonas: ["Algés", "Carnaxide"] } })).toHaveLength(0);
  });
});

describe("dois números para a mesma coisa", () => {
  it("assinala quando discordam muito", () => {
    // Quem lê não sabe qual acreditar, e um deles descreve outro sítio.
    const r = verificar({
      benchmarks: [bm({ id: "a", eur_m2_medio: 5000 }), bm({ id: "b", eur_m2_medio: 7000 })],
      transacoes: [], amostras: [],
    }, HOJE);
    expect(r.some((x) => x.tipo === "benchmarks_em_conflito")).toBe(true);
  });

  it("não se queixa de diferenças pequenas", () => {
    const r = verificar({
      benchmarks: [bm({ id: "a", eur_m2_medio: 5000 }), bm({ id: "b", eur_m2_medio: 5300 })],
      transacoes: [], amostras: [],
    }, HOJE);
    expect(r.some((x) => x.tipo === "benchmarks_em_conflito")).toBe(false);
  });
});

describe("vendas reais", () => {
  const t = (x: Partial<Transacao> = {}): Transacao => ({
    id: "t1", referencia: "alges-3", area: 110, preco_transacao: 520000,
    data_transacao: "2026-07-01", geografia_id: "g1", ...x,
  });
  const soT = (x: Partial<Transacao> = {}) =>
    verificar({ benchmarks: [], transacoes: [t(x)], amostras: [] }, HOJE);

  it("uma venda sem geografia existe e ninguém a encontra", () => {
    expect(soT({ geografia_id: null })[0]).toMatchObject({
      tipo: "venda_sem_geografia", severidade: "grave",
    });
  });

  it("apanha o zero a mais no preço", () => {
    expect(soT({ preco_transacao: 5200000 })[0].tipo).toBe("eur_m2_impossivel");
  });

  it("a venda normal não levanta nada", () => {
    expect(soT()).toHaveLength(0);
  });
});

describe("a armadilha da amostra fina", () => {
  const a = (x: Partial<Amostra> = {}): Amostra => ({
    id: "a1", chave: "k", n_itens: 5, valida_ate: "2026-08-29T00:00:00Z",
    geografia_nome: "Carnaxide", ...x,
  });

  it("assinala a amostra viva que o motor não consegue usar", () => {
    // Fina de mais para servir, e suficiente para impedir que outra a
    // substitua. Carnaxide ficou assim: cinco minutos por avaliação, sem
    // nunca melhorar, até expirar.
    const r = verificar({ benchmarks: [], transacoes: [], amostras: [a({ n_itens: 2 })] }, HOJE);
    expect(r[0]).toMatchObject({ tipo: "amostra_fina", severidade: "grave" });
  });

  it("uma amostra fina já expirada não é problema — já não bloqueia", () => {
    const r = verificar({
      benchmarks: [], transacoes: [],
      amostras: [a({ n_itens: 2, valida_ate: "2026-08-01T00:00:00Z" })],
    }, HOJE);
    expect(r).toHaveLength(0);
  });
});

describe("o resultado é útil a quem o lê", () => {
  it("os graves vêm primeiro", () => {
    const r = verificar({
      benchmarks: [bm({ id: "x", n_transacoes: 10 }), bm({ id: "y", eur_m2_medio: 99 })],
      transacoes: [], amostras: [],
    }, HOJE);
    expect(r[0].severidade).toBe("grave");
  });

  it("dados sãos não produzem ruído", () => {
    expect(verificar({ benchmarks: [bm()], transacoes: [], amostras: [] }, HOJE)).toEqual([]);
  });

  it("não depende do relógio da máquina", () => {
    const dados = { benchmarks: [bm()], transacoes: [], amostras: [] };
    const a = verificar(dados, new Date("2026-08-22T00:00:00Z"));
    const b = verificar(dados, new Date("2026-08-22T23:59:00Z"));
    expect(a).toEqual(b);
  });
});
