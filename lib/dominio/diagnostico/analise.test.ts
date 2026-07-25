import { describe, it, expect } from "vitest";
import {
  oportunidades,
  adequacaoLead,
  informacaoEmFalta,
  podeGerarProposta,
  type EntradaAnalise,
} from "./analise";
import type { Brief } from "../intake";

const base: EntradaAnalise = { brief: {}, objetivos: [] };

describe("análise interna — oportunidades (Parte 24)", () => {
  it("processo fraco gera a oportunidade nº 1, ligada a um serviço", () => {
    const brief: Brief = {
      leads_resposta: "sem_processo",
      leads_registo: "nao_registo",
      leads_followup: "nao",
    };
    const ops = oportunidades({ ...base, brief });
    const funil = ops.find((o) => o.titulo.includes("depois do lead"));
    expect(funil).toBeTruthy();
    expect(funil?.servico).toBe("integracao_crm");
    expect(funil?.prioridade).toBe("ja");
  });

  it("sem site sugere site novo; com site fraco sugere melhorias", () => {
    expect(oportunidades({ ...base, brief: { site_estado: "nao" } }).some((o) => o.servico === "site_novo")).toBe(true);
    expect(oportunidades({ ...base, brief: { site_estado: "fraco" } }).some((o) => o.servico === "site_melhorias")).toBe(true);
  });

  it("não inventa oportunidades quando não há sinais", () => {
    // brief mínimo com público e presença, sem fraquezas → poucas ou nenhumas
    const ops = oportunidades({ ...base, brief: { publico: "b2c", presenca: "ja_invisto" } });
    expect(ops.every((o) => o.evidencia.length > 0)).toBe(true);
  });

  it("assistente só quando o cliente o pediu", () => {
    expect(oportunidades({ ...base, brief: { automacao: ["assistente"] } }).some((o) => o.servico === "assistente")).toBe(true);
    expect(oportunidades({ ...base, brief: {} }).some((o) => o.servico === "assistente")).toBe(false);
  });
});

describe("análise interna — adequação do lead (Parte 26)", () => {
  it("orçamento forte + objetivos + arrancar já → boa", () => {
    const a = adequacaoLead({
      brief: { intencao: "acelerar", prazo: "ja" },
      objetivos: ["leads"],
      orcamento: "1200_2500",
    });
    expect(a.nivel).toBe("boa");
    expect(a.fatores.length).toBeGreaterThan(0);
  });

  it("sem sinais fortes fica em risco, nunca rejeita", () => {
    const a = adequacaoLead({ brief: {}, objetivos: [] });
    expect(["risco", "fora"]).toContain(a.nivel);
    expect(a.recomendacao).toBeTruthy();
  });

  it("orçamento apertado é risco, não exclusão automática", () => {
    const a = adequacaoLead({ brief: { intencao: "essencial" }, objetivos: ["notoriedade"], orcamento: "ate600" });
    expect(a.riscos.length).toBeGreaterThan(0);
  });
});

describe("análise interna — informação em falta (Parte 27)", () => {
  it("sem objetivos, público e orçamento → crítico, bloqueia a proposta", () => {
    const f = informacaoEmFalta(base);
    expect(f.critica).toContain("Objetivos do negócio");
    expect(f.critica).toContain("Orçamento mensal");
    expect(podeGerarProposta(f)).toBe(false);
  });

  it("com o essencial preenchido, pode gerar", () => {
    const f = informacaoEmFalta({
      brief: { publico: "b2c" },
      objetivos: ["leads"],
      orcamento: "600_1200",
    });
    expect(f.critica).toHaveLength(0);
    expect(podeGerarProposta(f)).toBe(true);
  });

  it("dados do site detetados entram em «a confirmar»", () => {
    const f = informacaoEmFalta({
      brief: { publico: "b2c", site_detetado: { nome: "X" } },
      objetivos: ["leads"],
      orcamento: "600_1200",
    });
    expect(f.confirmar.some((c) => c.includes("site"))).toBe(true);
  });
});
