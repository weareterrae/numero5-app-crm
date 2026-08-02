import { describe, it, expect } from "vitest";
import { mensagemSeguimento, situacaoSeguimento } from "./followups";
import { metricasFunil, abandonoPorEtapa } from "./metricas-funil";
import { taxaConversao } from "./funil";

describe("taxaConversao por coorte", () => {
  it("clientes migrados (entram direto num estado avançado) não inflacionam a taxa", () => {
    const transicoes = [
      // dois passaram por «contactado»; um deles chegou a «diagnostico»
      { cliente_id: "a", para_estado: "contactado" },
      { cliente_id: "b", para_estado: "contactado" },
      { cliente_id: "a", para_estado: "diagnostico" },
      // três migrados: entraram DIRETO em «diagnostico» sem passar por «contactado»
      { cliente_id: "m1", para_estado: "diagnostico" },
      { cliente_id: "m2", para_estado: "diagnostico" },
      { cliente_id: "m3", para_estado: "diagnostico" },
    ];
    // antes: 4/2 = 200%; agora: 1/2 = 50% (só o «a» conta — passou pelos dois)
    expect(taxaConversao(transicoes, "contactado" as never, "diagnostico" as never)).toBeCloseTo(0.5);
  });

  it("nunca ultrapassa 100%", () => {
    const transicoes = [
      { cliente_id: "a", para_estado: "proposta" },
      { cliente_id: "a", para_estado: "cliente" },
      { cliente_id: "x", para_estado: "cliente" },
      { cliente_id: "y", para_estado: "cliente" },
    ];
    expect(taxaConversao(transicoes, "proposta" as never, "cliente" as never)).toBe(1);
  });

  it("sem base devolve null", () => {
    expect(taxaConversao([], "contactado" as never, "diagnostico" as never)).toBeNull();
  });
});

describe("follow-ups preparados (Parte G)", () => {
  it("preenche nome e empresa em PT e EN", () => {
    const pt = mensagemSeguimento("proposta_enviada", { nome: "Rui", empresa: "Rikauto" }, "pt");
    expect(pt).toContain("Rui");
    expect(pt).toContain("Rikauto");
    const en = mensagemSeguimento("intake_incompleto", { nome: "Rui", empresa: "Rikauto" }, "en");
    expect(en).toContain("half done");
  });

  it("escolhe a situação certa pelo estado", () => {
    expect(
      situacaoSeguimento({ intakeSubmetido: false, temRascunho: true, propostaEnviada: false, propostaVista: false, propostaDecidida: false }),
    ).toBe("intake_incompleto");
    expect(
      situacaoSeguimento({ intakeSubmetido: true, temRascunho: false, propostaEnviada: false, propostaVista: false, propostaDecidida: false }),
    ).toBe("intake_submetido");
    expect(
      situacaoSeguimento({ intakeSubmetido: true, temRascunho: false, propostaEnviada: true, propostaVista: true, propostaDecidida: false }),
    ).toBe("proposta_sem_decisao");
    expect(
      situacaoSeguimento({ intakeSubmetido: true, temRascunho: false, propostaEnviada: true, propostaVista: false, propostaDecidida: true }),
    ).toBeNull();
  });
});

describe("métricas do funil (Parte H)", () => {
  it("calcula taxas, médias e motivos de recusa", () => {
    const clientes = [
      { intake_token: "a", intake_submetido_em: "2026-07-01" },
      { intake_token: "b", intake_submetido_em: null },
      { intake_token: null, intake_submetido_em: null },
    ];
    const propostas = [
      { estado: "aceite", setup_valor: 2000, avenca_valor: 800 },
      { estado: "aceite", setup_valor: 1000, avenca_valor: 600 },
      { estado: "recusada", motivo_recusa: "preço" },
      { estado: "enviada" },
      { estado: "rascunho" },
    ];
    const m = metricasFunil(clientes, propostas);
    expect(m.diagnosticosEnviados).toBe(2); // dois com token
    expect(m.diagnosticosSubmetidos).toBe(1);
    expect(m.taxaSubmissao).toBeCloseTo(0.5);
    expect(m.propostasAceites).toBe(2);
    // decididas = enviada + aceite×2 + recusada = 4 → 2/4
    expect(m.taxaAceitacao).toBeCloseTo(0.5);
    expect(m.setupMedio).toBe(1500);
    expect(m.mrrMedio).toBe(700);
    expect(m.motivosRecusa).toEqual(["preço"]);
  });

  it("sem dados, as taxas são null (nada de causalidade inventada)", () => {
    const m = metricasFunil([], []);
    expect(m.taxaSubmissao).toBeNull();
    expect(m.taxaAceitacao).toBeNull();
    expect(m.setupMedio).toBeNull();
  });
});

describe("abandono por etapa (Parte 31)", () => {
  it("agrupa os nao-submetidos com rascunho pelo passo", () => {
    const r = abandonoPorEtapa([
      { intake_submetido_em: "2026-07-01", intake_passo: 5, intake_rascunho: { x: 1 } }, // concluido
      { intake_submetido_em: null, intake_passo: 3, intake_rascunho: { x: 1 } }, // abandono passo 3
      { intake_submetido_em: null, intake_passo: 3, intake_rascunho: { x: 1 } }, // abandono passo 3
      { intake_submetido_em: null, intake_passo: 7, intake_rascunho: { x: 1 } }, // abandono passo 7
      { intake_submetido_em: null, intake_passo: 0, intake_rascunho: null }, // nunca comecou
    ]);
    expect(r).toEqual([
      { passo: 3, total: 2 },
      { passo: 7, total: 1 },
    ]);
  });
});
