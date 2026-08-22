// =====================================================================
// Testes da validação de uma venda real
// ---------------------------------------------------------------------
// Uma venda real ancora o motor com até 50% do peso. Um zero a mais
// desloca as avaliações daquela zona durante meses — e não dá erro: o
// valor sai mais alto e parece plausível.
//
// A linha difícil não é entre certo e errado. É entre IMPOSSÍVEL e
// INVULGAR. A moradia de Carnaxide que vendeu por 2.358.000 € — 37%
// acima do que o motor estimava — é exatamente o caso que uma validação
// zelosa de mais teria recusado por «cara de mais», perdendo a única
// venda que apanhava aquele erro.
// =====================================================================
import { describe, it, expect } from "vitest";
import { validarVenda, numero } from "./venda";

const HOJE = new Date("2026-08-22T12:00:00Z");

/** Uma venda banal, para se alterar um campo de cada vez. */
const BASE = {
  tipo: "Apartamento", tipologia: "T3", zona: "Algés", concelho: "Oeiras",
  area: 110, preco_transacao: 520000, data_transacao: "2026-07-15",
};

describe("o que não pode faltar", () => {
  it("aceita uma venda completa", () => {
    const r = validarVenda(BASE, HOJE);
    expect(r.ok).toBe(true);
    expect(r.ok && r.venda.eur_m2).toBe(4727);
    expect(r.avisos).toHaveLength(0);
  });

  it("recusa sem preço, sem área, sem concelho ou sem data", () => {
    for (const campo of ["preco_transacao", "area", "concelho", "data_transacao"] as const) {
      const r = validarVenda({ ...BASE, [campo]: "" }, HOJE);
      expect(r.ok, `${campo} devia ser obrigatório`).toBe(false);
      expect(!r.ok && r.erros.some((e) => e.campo === campo)).toBe(true);
    }
  });

  it("uma escritura no futuro é um engano, não uma previsão", () => {
    const r = validarVenda({ ...BASE, data_transacao: "2027-01-01" }, HOJE);
    expect(r.ok).toBe(false);
  });
});

describe("a fronteira entre impossível e invulgar", () => {
  it("recusa o zero a mais — 47.000 €/m² não é uma casa", () => {
    const r = validarVenda({ ...BASE, preco_transacao: 5200000 }, HOJE);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erros[0].texto).toMatch(/não é possível/);
  });

  it("recusa o preço absurdamente baixo", () => {
    const r = validarVenda({ ...BASE, preco_transacao: 15000 }, HOJE);
    expect(r.ok).toBe(false);
  });

  it("ACEITA a moradia de Carnaxide, que é cara e é verdadeira", () => {
    // 2.358.000 € / 400 m² = 5.895 €/m². Normal para o produto.
    const r = validarVenda({
      ...BASE, tipo: "Moradia", tipologia: "T4", zona: "Carnaxide",
      area: 400, preco_transacao: 2358000,
    }, HOJE);
    expect(r.ok).toBe(true);
  });

  it("aceita mas pede confirmação num €/m² invulgar", () => {
    // 15.000 €/m²: existe em Portugal, é raro, e é onde o motor mais erra.
    const r = validarVenda({ ...BASE, area: 100, preco_transacao: 1500000 }, HOJE);
    expect(r.ok).toBe(true);
    expect(r.avisos.some((a) => /invulgar/.test(a.texto))).toBe(true);
  });
});

describe("coerência entre os preços", () => {
  it("avisa quando vendeu acima do pedido inicial", () => {
    const r = validarVenda({ ...BASE, preco_inicial: 500000 }, HOJE);
    expect(r.ok).toBe(true);
    expect(r.avisos.some((a) => a.campo === "preco_inicial")).toBe(true);
  });

  it("não avisa no caso normal — vendeu abaixo do pedido", () => {
    const r = validarVenda({ ...BASE, preco_inicial: 560000 }, HOJE);
    expect(r.avisos).toHaveLength(0);
  });
});

describe("dias de mercado", () => {
  it("são calculados das datas, não escritos à mão", () => {
    const r = validarVenda({ ...BASE, data_anuncio: "2026-05-16" }, HOJE);
    expect(r.ok && r.venda.dias_mercado).toBe(60);
  });

  it("um anúncio posterior à escritura é um engano", () => {
    const r = validarVenda({ ...BASE, data_anuncio: "2026-08-01" }, HOJE);
    expect(r.ok).toBe(false);
  });

  it("sem data de anúncio, fica nulo em vez de zero", () => {
    // Zero diria «vendeu no próprio dia», que é uma afirmação. Nulo diz
    // «não se sabe», que é a verdade.
    const r = validarVenda(BASE, HOJE);
    expect(r.ok && r.venda.dias_mercado).toBeNull();
  });
});

describe("números como as pessoas os escrevem", () => {
  it("lê «350.000 €», «350000» e 350000 da mesma maneira", () => {
    expect(numero("350.000 €")).toBe(350000);
    expect(numero("350000")).toBe(350000);
    expect(numero(350000)).toBe(350000);
    expect(numero("350 000")).toBe(350000);
  });

  it("a vírgula é decimal — 110,5 m² são 110,5", () => {
    expect(numero("110,5")).toBe(110.5);
  });

  it("devolve nulo em vez de adivinhar", () => {
    expect(numero("mais ou menos 300 mil")).toBeNull();
    expect(numero("")).toBeNull();
  });
});

describe("o mesmo resultado em qualquer dia", () => {
  it("a validação não depende do relógio da máquina", () => {
    const a = validarVenda(BASE, new Date("2026-08-22T00:00:00Z"));
    const b = validarVenda(BASE, new Date("2027-03-09T23:59:00Z"));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
