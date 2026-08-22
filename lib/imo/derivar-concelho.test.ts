// =====================================================================
// Testes da derivação de um valor de concelho
// ---------------------------------------------------------------------
// O SIR não produz relatórios de concelho. Quem escreve uma freguesia
// que não temos — «Quinta do Anjo», «Pinhal Novo» — resolve para o
// concelho, e o concelho vazio faz a avaliação perder a âncora de
// mercado e cair no caminho lento.
//
// Derivar resolve isso. Mas derivar mal é pior do que não derivar: um
// número de concelho errado é confiante, aplica-se a muitas zonas, e não
// dá erro nenhum. Estes testes fixam onde está a linha.
// =====================================================================
import { describe, it, expect } from "vitest";
import { derivarConcelho, mediana, MINIMO_ZONAS, type Zona } from "./derivar-concelho";

const zona = (nome: string, eur: number, extra: Partial<Zona> = {}): Zona => ({
  geografia_id: nome, nome, tipo_imovel: "", tipologia: "",
  eur_m2_medio: eur, n_transacoes: 1000, periodo: "2026-06",
  desconto_medio: -0.1, ...extra,
});

describe("com material que chegue", () => {
  it("devolve a mediana das zonas, não a média", () => {
    // Média = 6000; mediana = 5000. Uma zona cara não arrasta o concelho.
    const r = derivarConcelho([zona("A", 4000), zona("B", 5000), zona("C", 9000)]);
    expect(r[0].eur_m2_medio).toBe(5000);
  });

  it("soma as amostras — a do concelho é mesmo a soma das zonas", () => {
    const r = derivarConcelho([
      zona("A", 4000, { n_transacoes: 9000 }),
      zona("B", 5000, { n_transacoes: 9800 }),
    ]);
    expect(r[0].n_transacoes).toBe(18800);
  });

  it("diz de que zonas veio — sem isso ninguém o pode julgar", () => {
    const r = derivarConcelho([zona("Algés", 5800), zona("Carnaxide", 4900)]);
    expect(r[0].de_zonas).toEqual(["Algés", "Carnaxide"]);
  });

  it("fica com o período mais recente, não com o mais antigo", () => {
    const r = derivarConcelho([
      zona("A", 4000, { periodo: "2026-03" }),
      zona("B", 5000, { periodo: "2026-06" }),
    ]);
    expect(r[0].periodo).toBe("2026-06");
  });

  it("separa por tipo e tipologia", () => {
    const r = derivarConcelho([
      zona("A", 4000, { tipo_imovel: "apartamento", tipologia: "T2" }),
      zona("B", 4400, { tipo_imovel: "apartamento", tipologia: "T2" }),
      zona("A", 6000, { tipo_imovel: "moradia", tipologia: "T4" }),
      zona("B", 6400, { tipo_imovel: "moradia", tipologia: "T4" }),
    ]);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.tipologia === "T2")!.eur_m2_medio).toBe(4200);
    expect(r.find((x) => x.tipologia === "T4")!.eur_m2_medio).toBe(6200);
  });
});

describe("onde está a linha, e porquê", () => {
  it("uma zona só NÃO faz um concelho", () => {
    // O único relatório de Almada é da Caparica, que é costa e é mais
    // cara do que Almada terra adentro. Chamar-lhe «Almada» seria pegar
    // num retângulo desenhado à mão e promovê-lo a concelho.
    expect(derivarConcelho([zona("Caparica", 3388)])).toHaveLength(0);
    expect(MINIMO_ZONAS).toBe(2);
  });

  it("a mesma zona duas vezes continua a ser uma zona", () => {
    // O mesmo retângulo entra como freguesia E como microzona. Contá-lo
    // duas vezes fingiria concordância: a mediana de dois números iguais
    // é esse número, e o concelho parecia coerentíssimo sem o ser.
    const dup = { geografia_id: "x", nome: "UF Cascais e Estoril" };
    expect(derivarConcelho([
      { ...zona("UF Cascais e Estoril", 5841), ...dup },
      { ...zona("UF Cascais e Estoril", 5841), ...dup },
    ])).toHaveLength(0);
  });

  it("ignora zonas sem valor em vez de as contar como zero", () => {
    const r = derivarConcelho([zona("A", 4000), zona("B", 0), zona("C", 5000)]);
    expect(r[0].eur_m2_medio).toBe(4500);
    expect(r[0].de_zonas).toHaveLength(2);
  });

  it("sem material nenhum devolve vazio — que é a resposta certa", () => {
    // De vazio sabe-se que não se sabe. De um número errado, não.
    expect(derivarConcelho([])).toEqual([]);
  });
});

describe("mediana", () => {
  it("ímpar: o do meio", () => expect(mediana([1, 5, 9])).toBe(5));
  it("par: a média dos dois do meio", () => expect(mediana([1, 4, 6, 9])).toBe(5));
  it("vazio: zero, e quem chama filtra antes", () => expect(mediana([])).toBe(0));
});
