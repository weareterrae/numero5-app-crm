import { describe, it, expect } from "vitest";
import {
  validarConteudoProposta,
  encontrarPlaceholders,
  textoTodoConteudo,
  checklistRevisao,
  podePartilhar,
} from "./validar-proposta";

const valido = {
  abertura: "A tua marca está num bom ponto de partida.",
  objetivo: "Vamos organizar o marketing.",
  prioridades: [{ titulo: "Funil", texto: "Organizar o funil." }],
  fecho: "Dá cá cinco 🖐️",
};

describe("validação do conteúdo (Parte 49)", () => {
  it("aceita conteúdo bem formado", () => {
    expect(validarConteudoProposta(valido).ok).toBe(true);
  });

  it("rejeita sem abertura, fecho ou prioridades", () => {
    expect(validarConteudoProposta({ ...valido, abertura: "" }).ok).toBe(false);
    expect(validarConteudoProposta({ ...valido, prioridades: [] }).ok).toBe(false);
    expect(validarConteudoProposta({ ...valido, prioridades: [{ texto: "sem titulo" }] }).ok).toBe(false);
    expect(validarConteudoProposta(null).ok).toBe(false);
  });

  it("valida a forma dos campos novos quando existem", () => {
    expect(validarConteudoProposta({ ...valido, percebemos: { factos: [], leitura: [] } }).ok).toBe(true);
    expect(validarConteudoProposta({ ...valido, percebemos: { factos: "x" } }).ok).toBe(false);
    expect(validarConteudoProposta({ ...valido, responsabilidades: { n5: [], cliente: [] } }).ok).toBe(true);
    expect(validarConteudoProposta({ ...valido, responsabilidades: { n5: [] } }).ok).toBe(false);
  });
});

describe("placeholders e checklist (Parte 52)", () => {
  it("encontra placeholders críticos", () => {
    expect(encontrarPlaceholders("Olá [A DEFINIR] e [A CONFIRMAR]")).toHaveLength(2);
    expect(encontrarPlaceholders("tudo bem")).toHaveLength(0);
  });

  it("varre todo o conteúdo (aninhado)", () => {
    const t = textoTodoConteudo({ a: "x", b: ["y", { c: "[PREENCHER]" }] });
    expect(encontrarPlaceholders(t)).toHaveLength(1);
  });

  it("a checklist bloqueia quando há placeholders ou faltam valores", () => {
    const comPlaceholder = { ...valido, fecho: "Falamos em [A CONFIRMAR]." };
    const itens = checklistRevisao(comPlaceholder, { temValores: false, temValidade: false, idiomaCliente: "pt" });
    expect(podePartilhar(itens)).toBe(false);
    expect(itens.find((i) => i.item.includes("por preencher"))?.ok).toBe(false);
    expect(itens.find((i) => i.item.includes("Investimento"))?.ok).toBe(false);
  });

  it("com tudo em ordem, pode partilhar", () => {
    const itens = checklistRevisao(valido, { temValores: true, temValidade: true, idiomaCliente: "pt" });
    expect(podePartilhar(itens)).toBe(true);
  });
});
