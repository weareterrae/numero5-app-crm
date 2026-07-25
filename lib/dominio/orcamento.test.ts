import { describe, it, expect } from "vitest";
import {
  ESCOPO_VAZIO,
  alertas,
  arredondarComercial,
  calcular,
  euroHora,
  margem,
  normalizarEscopo,
  type Escopo,
  type Preco,
} from "./orcamento";

// Tabela de preços a espelhar o catálogo real.
const P: Preco[] = [
  { chave: "post", rotulo: "Post", tipo: "mensal", unidade: "unidade", preco: 32, minutos: null },
  { chave: "carrossel", rotulo: "Carrossel", tipo: "mensal", unidade: "unidade", preco: 58, minutos: null },
  { chave: "reel", rotulo: "Reel", tipo: "mensal", unidade: "unidade", preco: 80, minutos: null },
  { chave: "story", rotulo: "Story", tipo: "mensal", unidade: "unidade", preco: 13, minutos: null },
  { chave: "gestao_canal", rotulo: "Gestão 1.º canal", tipo: "mensal", unidade: "canal", preco: 130, minutos: null },
  { chave: "gestao_canal_extra", rotulo: "Gestão canal adicional", tipo: "mensal", unidade: "canal", preco: 60, minutos: null },
  { chave: "anuncios", rotulo: "Gestão de anúncios", tipo: "mensal", unidade: "fixo", preco: 150, minutos: null },
  { chave: "anuncios_pct", rotulo: "Anúncios %", tipo: "mensal", unidade: "percentagem", preco: 10, minutos: null },
  { chave: "moderacao", rotulo: "Moderação", tipo: "mensal", unidade: "fixo", preco: 100, minutos: null },
  { chave: "assistente", rotulo: "Assistente", tipo: "mensal", unidade: "fixo", preco: 45, minutos: null },
  { chave: "relatorio", rotulo: "Relatório", tipo: "mensal", unidade: "fixo", preco: 60, minutos: null },
  { chave: "foto", rotulo: "Fotografia", tipo: "setup", unidade: "projeto", preco: null, minutos: null },
  // com tempo planeado, para o €/hora
  { chave: "post_t", rotulo: "Post c/ tempo", tipo: "mensal", unidade: "unidade", preco: 32, minutos: null, custo_interno: 8, tempo_planeado_min: 30 },
];

const esc = (over: {
  producao?: Partial<Escopo["producao"]>;
  canais?: Escopo["canais"];
  extras?: Partial<Escopo["extras"]>;
  servicos?: Escopo["servicos"];
  verba_anuncios?: number;
  site?: Escopo["site"];
  ambitos?: Escopo["ambitos"];
}): Escopo => ({
  ...ESCOPO_VAZIO,
  ...over,
  producao: { ...ESCOPO_VAZIO.producao, ...(over.producao ?? {}) },
  extras: { ...ESCOPO_VAZIO.extras, ...(over.extras ?? {}) },
  canais: over.canais ?? {},
  ambitos: { ...ESCOPO_VAZIO.ambitos, ...(over.ambitos ?? {}) },
});

describe("arredondamento comercial (ceil ao múltiplo de 50)", () => {
  it.each([
    [646, 650],
    [967, 1000],
    [1307, 1350],
    [1680, 1700],
    [2280, 2300],
    [2300, 2300],
    [0, 0],
  ])("%d € → %d €", (dado, esperado) => {
    expect(arredondarComercial(dado, 50)).toBe(esperado);
  });
});

describe("cálculo de propostas", () => {
  it("produção conta uma vez em dois canais", () => {
    const o = calcular(
      esc({
        producao: { posts: 4, carrosseis: 0, reels: 0, stories: 0 },
        canais: { instagram: { ativo: true, proprio: false }, facebook: { ativo: true, proprio: false } },
      }),
      P,
    );
    const post = o.mensal.find((l) => l.chave === "post");
    expect(post?.quantidade).toBe(4); // não 8
    expect(post?.total).toBe(128);
    // 1.º canal (130) + adicional partilhado (60) = 190
    expect(o.totalMensal).toBe(128 + 190);
  });

  it("primeiro canal a 130 €, adicional partilhado a 60 €", () => {
    const um = calcular(esc({ canais: { instagram: { ativo: true, proprio: false } } }), P);
    expect(um.mensal.find((l) => l.chave === "gestao_canal")?.total).toBe(130);
    const dois = calcular(
      esc({ canais: { instagram: { ativo: true, proprio: false }, facebook: { ativo: true, proprio: false } } }),
      P,
    );
    expect(dois.mensal.find((l) => l.chave === "gestao_canal")?.total).toBe(130);
    expect(dois.mensal.find((l) => l.chave === "gestao_canal_extra")?.total).toBe(60);
  });

  it("canal com conteúdo próprio paga gestão completa", () => {
    const o = calcular(esc({ canais: { instagram: { ativo: true, proprio: true } } }), P);
    expect(o.mensal.find((l) => l.chave === "gestao_canal")?.total).toBe(130);
    expect(o.mensal.find((l) => l.chave === "gestao_canal_extra")).toBeUndefined();
  });

  it("anúncios: mínimo de 150 € quando a % é menor", () => {
    const o = calcular(esc({ verba_anuncios: 500, extras: { anuncios: true } }), P);
    expect(o.mensal.find((l) => l.chave === "anuncios")?.total).toBe(150);
  });

  it("anúncios: 10% da verba quando é maior", () => {
    const o = calcular(esc({ verba_anuncios: 3000, extras: { anuncios: true } }), P);
    expect(o.mensal.find((l) => l.chave === "anuncios")?.total).toBe(300);
  });

  it("Motor — âmbito limitado dá 646 € → 650 € comercial", () => {
    const o = calcular(
      esc({
        producao: { posts: 4, carrosseis: 2, reels: 2, stories: 4 },
        canais: { instagram: { ativo: true, proprio: false } },
        extras: { relatorio: true },
      }),
      P,
    );
    expect(o.totalMensal).toBe(646);
    expect(arredondarComercial(o.totalMensal, 50)).toBe(650);
  });

  it("serviço [A DEFINIR] (preço null) fica em porDefinir e não soma", () => {
    const o = calcular(esc({ servicos: [{ chave: "foto", rotulo: "Fotografia", quantidade: 1 }] }), P);
    expect(o.porDefinir).toContain("Fotografia");
    expect(o.totalSetup).toBe(0);
  });

  it("horas e €/hora do tempo planeado", () => {
    const o = calcular(esc({ producao: { posts: 10, carrosseis: 0, reels: 0, stories: 0 } }), [
      ...P.filter((p) => p.chave !== "post"),
      { ...P.find((p) => p.chave === "post_t")!, chave: "post" },
    ]);
    // 10 posts × 30 min = 300 min = 5h; custo 10×8 = 80
    expect(o.tempoMensalMin).toBe(300);
    expect(o.custoMensal).toBe(80);
    expect(euroHora(320, o.tempoMensalMin)).toBeCloseTo(64); // 320 / 5h
    expect(margem(320, o.custoMensal)).toBeCloseTo((320 - 80) / 320);
  });
});

describe("âmbitos e alertas", () => {
  it("normalizarEscopo funde os âmbitos e mantém defeito vazio", () => {
    const e = normalizarEscopo({ producao: { reels: 2 }, ambitos: { reel_duracao: 30 } });
    expect(e.ambitos.reel_duracao).toBe(30);
    expect(e.ambitos.carrossel_slides).toBeUndefined();
  });

  it("avisa quando o âmbito fica por definir", () => {
    const e = esc({
      producao: { posts: 0, carrosseis: 2, reels: 1, stories: 0 },
      extras: { moderacao: true, assistente: true, anuncios: true },
      site: { tipo: "loja", paginas: 0 },
    });
    const textos = alertas(e, calcular(e, P)).map((a) => a.texto);
    expect(textos.some((t) => t.includes("Carrosséis sem"))).toBe(true);
    expect(textos.some((t) => t.includes("Reels sem"))).toBe(true);
    expect(textos.some((t) => t.includes("Loja online sem"))).toBe(true);
    expect(textos.some((t) => t.includes("Assistente sem"))).toBe(true);
    expect(textos.some((t) => t.includes("Moderação sem"))).toBe(true);
    expect(textos.some((t) => t.includes("verba"))).toBe(true);
  });

  it("não avisa quando o âmbito está preenchido", () => {
    const e = esc({
      producao: { posts: 0, carrosseis: 2, reels: 1, stories: 0 },
      extras: { moderacao: true, assistente: true, anuncios: true },
      verba_anuncios: 300,
      site: { tipo: "loja", paginas: 0 },
      ambitos: {
        carrossel_slides: 6,
        reel_duracao: 30,
        loja: "até 30 produtos",
        assistente: "FAQ + marcações",
        moderacao_limite: 200,
      },
    });
    const avisos = alertas(e, calcular(e, P)).filter((a) => a.nivel === "aviso");
    expect(avisos.length).toBe(0);
  });

  it("canal com conteúdo próprio gera nota informativa", () => {
    const e = esc({
      producao: { posts: 4, carrosseis: 0, reels: 0, stories: 0 },
      canais: { instagram: { ativo: true, proprio: true } },
    });
    const info = alertas(e, calcular(e, P)).filter((a) => a.nivel === "info");
    expect(info.some((a) => a.texto.includes("conteúdo próprio"))).toBe(true);
  });
});
