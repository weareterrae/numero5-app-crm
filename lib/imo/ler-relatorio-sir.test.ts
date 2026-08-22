// =====================================================================
// Testes do leitor de relatórios Micro-SIR
// ---------------------------------------------------------------------
// As posições aqui são as REAIS do relatório de Cascais de junho/2026.
// Não são inventadas: foram extraídas do PDF e é por isso que servem de
// referência — se a plataforma mudar o desenho, estes testes falham e
// alguém corrige o leitor, em vez de metade dos números entrarem errados
// sem ninguém reparar.
//
// O caso que estes testes existem para impedir: o relatório tem DUAS
// colunas de euros com as MESMAS etiquetas — €/m² e preço por fogo. Duas
// tentativas minhas puseram «6 857 €» (um €/m²) no lugar de «944 075 €»
// (um preço de fogo). Plausível à vista, errado por duas ordens de
// grandeza, e num benchmark isso não grita: só faz as avaliações daquela
// zona ficarem silenciosamente erradas.
// =====================================================================
import { describe, it, expect } from "vitest";
import { lerMicroSIR, lerIndicadores, coordenada, mesAno } from "./ler-relatorio-sir";

/** Página do Micro-SIR, com as coordenadas reais do PDF. */
const PAGINA_MICRO = [
  { t: "ESTATÍSTICAS DA MICRO-ZONA", x: 41, y: 240 },
  { t: "Dados de: Junho, 2026", x: 41, y: 264 },
  { t: "Concelho:  Cascais", x: 41, y: 276 },
  { t: "Freguesia:  UF Cascais e Estoril", x: 41, y: 288 },
  { t: "Centroide da micro-zona:  38°42'59.206\"N 9°22'24.541\"W", x: 41, y: 300 },
  { t: "AMOSTRA TOTAL: 9866", x: 41, y: 393 },

  // coluna €/m² (etiquetas em x=227) — os valores deslocam-se para a
  // direita conforme o comprimento, porque estão dentro de barras
  { t: "PERCENTIL 25", x: 227, y: 341 }, { t: "3 922 €", x: 256, y: 350 },
  { t: "MÉDIA", x: 227, y: 365 }, { t: "5 841 €", x: 284, y: 374 },
  { t: "PERCENTIL 75", x: 227, y: 389 }, { t: "6 857 €", x: 296, y: 398 },
  { t: "APT. ≤ T1", x: 227, y: 425 }, { t: "6 119 €", x: 286, y: 434 },
  { t: "APT. T2", x: 227, y: 449 }, { t: "5 481 €", x: 281, y: 458 },
  { t: "APT. T3", x: 227, y: 473 }, { t: "5 642 €", x: 283, y: 482 },
  { t: "APT. ≥ T4", x: 227, y: 497 }, { t: "7 044 €", x: 299, y: 506 },
  { t: "MOR. ≤ T3", x: 227, y: 521 }, { t: "5 647 €", x: 283, y: 530 },
  { t: "MOR. ≥ T4", x: 227, y: 545 }, { t: "6 333 €", x: 290, y: 554 },
  { t: "NOVOS", x: 227, y: 581 }, { t: "8 608 €", x: 320, y: 590 },
  { t: "USADOS", x: 227, y: 605 }, { t: "5 050 €", x: 268, y: 614 },

  // coluna preço por fogo (etiquetas em x=345)
  { t: "PERCENTIL 25", x: 345, y: 341 }, { t: "354 400 €", x: 347, y: 350 },
  { t: "MÉDIA", x: 345, y: 365 }, { t: "845 677 €", x: 397, y: 374 },
  { t: "PERCENTIL 75", x: 345, y: 389 }, { t: "944 075 €", x: 407, y: 398 },
  { t: "APT. ≤ T1", x: 345, y: 425 }, { t: "346 050 €", x: 347, y: 434 },
  { t: "APT. T2", x: 345, y: 449 }, { t: "513 885 €", x: 372, y: 458 },
];

describe("as duas colunas de euros não se trocam", () => {
  const v = lerMicroSIR(PAGINA_MICRO);

  it("lê o €/m² da coluna esquerda", () => {
    expect(v.eur_m2.p25).toBe(3922);
    expect(v.eur_m2.media).toBe(5841);
    expect(v.eur_m2.p75).toBe(6857);
  });

  it("lê o preço por fogo da coluna direita — e não o €/m²", () => {
    expect(v.preco_fogo.p25).toBe(354400);
    expect(v.preco_fogo.media).toBe(845677);
    // Este é O teste. Duas versões minhas puseram 6857 aqui.
    expect(v.preco_fogo.p75).toBe(944075);
  });

  it("não confunde as colunas mesmo quando o valor se desloca", () => {
    // «6 857 €» está em x=296, mais perto do rótulo da coluna direita
    // (345) do que do da esquerda (227). Pertence à esquerda na mesma,
    // porque o que manda é o rótulo à sua esquerda, não a proximidade.
    expect(v.eur_m2.p75).not.toBe(v.preco_fogo.p75);
  });
});

describe("valores por tipologia", () => {
  const v = lerMicroSIR(PAGINA_MICRO);

  it("lê os seis, com «≤» e «≥» normalizados", () => {
    expect(v.eur_m2.por_tipologia).toEqual({
      "apartamento|T1": 6119, "apartamento|T2": 5481, "apartamento|T3": 5642,
      "apartamento|T4": 7044, "moradia|T3": 5647, "moradia|T4": 6333,
    });
  });

  it("separa novos de usados — 70% de diferença não é detalhe", () => {
    expect(v.eur_m2.novos).toBe(8608);
    expect(v.eur_m2.usados).toBe(5050);
  });
});

describe("cabeçalho", () => {
  const v = lerMicroSIR(PAGINA_MICRO);
  it("identifica onde e quando", () => {
    expect(v.concelho).toBe("Cascais");
    expect(v.freguesia).toBe("UF Cascais e Estoril");
    expect(v.periodo).toBe("2026-06");
    expect(v.amostra).toBe(9866);
  });
  it("converte o centróide para decimal", () => {
    expect(v.centroide?.lat).toBeCloseTo(38.7164, 3);
    expect(v.centroide?.lng).toBeCloseTo(-9.3735, 3);
  });
  it("o oeste é negativo — trocar o sinal põe o imóvel na China", () => {
    expect(coordenada("38°42'59.206\"N 9°22'24.541\"W")?.lng).toBeLessThan(0);
  });
});

describe("indicadores de absorção", () => {
  const PAGINA_FREG = [
    { t: "Freguesia:  UF Cascais e Estoril", x: 41, y: 288 },
    { t: "Indicadores de absorção", x: 640, y: 640 },
    { t: "Tempo de Absorção:", x: 645, y: 660 }, { t: "5 meses", x: 645, y: 674 },
    { t: "Desconto Acumulado:", x: 645, y: 700 }, { t: "−7,9%", x: 645, y: 714 },
    { t: "Price Gap:", x: 645, y: 740 }, { t: "−26,6%", x: 645, y: 754 },
    { t: "Yield Bruta:", x: 645, y: 780 }, { t: "4,6%", x: 645, y: 794 },
  ];
  const i = lerIndicadores(PAGINA_FREG);

  it("lê os quatro", () => {
    expect(i.absorcao_meses).toBe(5);
    expect(i.yield_bruta).toBeCloseTo(0.046, 4);
  });

  it("guarda o desconto e o price gap como frações negativas", () => {
    // O sinal é informação: é um desconto, não um acréscimo. E são
    // grandezas DIFERENTES — o desconto é do preço inicial ao final do
    // mesmo imóvel vendido; o price gap compara o transacionado com a
    // oferta de tudo o que está à venda.
    expect(i.desconto_acumulado).toBeCloseTo(-0.079, 4);
    expect(i.price_gap).toBeCloseTo(-0.266, 4);
    expect(i.desconto_acumulado).not.toBe(i.price_gap);
  });
});

describe("períodos", () => {
  it("lê os meses em português", () => {
    expect(mesAno("Junho, 2026")).toBe("2026-06");
    expect(mesAno("Março, 2027")).toBe("2027-03");
    expect(mesAno("Dezembro, 2025")).toBe("2025-12");
  });
  it("devolve nulo em vez de adivinhar", () => {
    expect(mesAno("primavera de 2026")).toBeNull();
  });
});

describe("quando a estrutura muda, diz — não inventa", () => {
  it("assinala o que faltou em vez de devolver metade em silêncio", () => {
    const v = lerMicroSIR([
      { t: "Concelho:  Cascais", x: 41, y: 276 },
      { t: "Dados de: Junho, 2026", x: 41, y: 264 },
      { t: "PERCENTIL 25", x: 227, y: 341 }, { t: "3 922 €", x: 256, y: 350 },
    ]);
    expect(v.em_falta).toContain("€/m² médio (o valor central)");
    expect(v.em_falta.length).toBeGreaterThan(5);
  });

  it("um relatório vazio não produz números", () => {
    const v = lerMicroSIR([]);
    expect(v.eur_m2.media).toBeNull();
    expect(Object.keys(v.eur_m2.por_tipologia)).toHaveLength(0);
  });
});
