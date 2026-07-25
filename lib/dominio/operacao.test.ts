import { describe, it, expect } from "vitest";
import { semaforo, LIMIARES_DEFEITO } from "./orcamento";
import {
  minutosReuniao,
  resumoReunioes,
  reuniaoExcedePercentagem,
  aprovacaoAtrasada,
  indicadorAprovacao,
  consomeRonda,
  eFaturavel,
  resumoRevisoesPeca,
  contratoDatas,
  planoPagamentoFundacao,
  arranqueCompleto,
  resumoDivida,
  corEstadoFinanceiro,
  horasProdutivas,
  ocupacao,
  nivelCapacidade,
  distribuirFundacao,
  rentabilidade,
  sugestoesRentabilidade,
  type Reuniao,
  type Aprovacao,
  type Revisao,
  type Cobranca,
} from "./operacao";

describe("reuniões (Fase 2, bloco 2)", () => {
  it("os minutos reais preferem a duração real à planeada", () => {
    expect(minutosReuniao({ duracao_planeada_min: 30, duracao_real_min: 55 })).toBe(55);
    expect(minutosReuniao({ duracao_planeada_min: 30, duracao_real_min: null })).toBe(30);
    expect(minutosReuniao({ duracao_planeada_min: null, duracao_real_min: null })).toBe(0);
  });

  it("uma reunião incluída não conta como extra", () => {
    const r: Reuniao[] = [{ duracao_real_min: 40, incluida: true }];
    const s = resumoReunioes(r, 2);
    expect(s.incluidas).toBe(1);
    expect(s.extras).toBe(0);
    expect(s.excedeIncluidas).toBe(false);
  });

  it("uma reunião adicional conta como extra e por faturar", () => {
    const r: Reuniao[] = [
      { duracao_real_min: 40, incluida: true },
      { duracao_real_min: 60, incluida: false, faturar: true, faturada: false },
    ];
    const s = resumoReunioes(r, 1);
    expect(s.extras).toBe(1);
    expect(s.extrasPorFaturar).toBe(1);
    expect(s.excedeIncluidas).toBe(true); // 2 reuniões, limite 1
  });

  it("as horas reais somam-se para a rentabilidade", () => {
    const r: Reuniao[] = [
      { duracao_real_min: 90, incluida: true },
      { duracao_planeada_min: 30, incluida: true }, // sem real → usa planeada
    ];
    const s = resumoReunioes(r, 4);
    expect(s.minutosReais).toBe(120);
    expect(s.horasReais).toBe(2);
  });

  it("extra já faturado não conta para «por faturar»", () => {
    const r: Reuniao[] = [{ duracao_real_min: 60, incluida: false, faturar: true, faturada: true }];
    expect(resumoReunioes(r, 1).extrasPorFaturar).toBe(0);
  });

  it("sem limite definido, nunca excede", () => {
    const r: Reuniao[] = [{ incluida: true }, { incluida: true }, { incluida: true }];
    expect(resumoReunioes(r, null).excedeIncluidas).toBe(false);
  });

  it("alerta quando o tempo de reunião passa a percentagem das horas contratadas", () => {
    // 300 min = 5h; 20 h contratadas; limite 20% = 4h → 5h > 4h → alerta
    expect(reuniaoExcedePercentagem(300, 20, 20)).toBe(true);
    expect(reuniaoExcedePercentagem(180, 20, 20)).toBe(false); // 3h < 4h
    expect(reuniaoExcedePercentagem(300, null, 20)).toBe(false); // sem horas contratadas
    expect(reuniaoExcedePercentagem(300, 20, null)).toBe(false); // sem limite
  });
});

describe("aprovações (Fase 2, bloco 3)", () => {
  const HOJE = "2026-07-25";

  it("uma aprovação pendente com prazo passado está bloqueada", () => {
    expect(aprovacaoAtrasada({ estado: "pendente", prazo: "2026-07-20" }, HOJE)).toBe(true);
    expect(aprovacaoAtrasada({ estado: "pendente", prazo: "2026-07-30" }, HOJE)).toBe(false);
    expect(aprovacaoAtrasada({ estado: "aprovado", prazo: "2026-07-20" }, HOJE)).toBe(false);
  });

  it("não assume aprovação tácita — sem_resposta continua pendente", () => {
    expect(aprovacaoAtrasada({ estado: "sem_resposta", prazo: "2026-07-01" }, HOJE)).toBe(true);
  });

  it("o indicador calcula tempo médio, % no prazo e bloqueados", () => {
    const aps: Aprovacao[] = [
      // resolvida em 2 dias, dentro do prazo
      { estado: "aprovado", enviado_em: "2026-07-01", prazo: "2026-07-05", resolvido_em: "2026-07-03" },
      // resolvida em 6 dias, fora do prazo
      { estado: "alteracoes", enviado_em: "2026-07-01", prazo: "2026-07-04", resolvido_em: "2026-07-07" },
      // pendente e atrasada
      { estado: "pendente", enviado_em: "2026-07-10", prazo: "2026-07-15" },
    ];
    const ind = indicadorAprovacao(aps, HOJE);
    expect(ind.total).toBe(3);
    expect(ind.pendentes).toBe(1);
    expect(ind.bloqueados).toBe(1);
    expect(ind.tempoMedioDias).toBe(4); // (2 + 6) / 2
    expect(ind.pctNoPrazo).toBeCloseTo(0.5); // 1 de 2 dentro do prazo
    expect(ind.diasAtrasoAcumulados).toBe(10); // 25 - 15
  });

  it("sem resolvidas, tempo médio e % no prazo são null", () => {
    const ind = indicadorAprovacao([{ estado: "pendente", prazo: "2026-08-01" }], HOJE);
    expect(ind.tempoMedioDias).toBeNull();
    expect(ind.pctNoPrazo).toBeNull();
    expect(ind.bloqueados).toBe(0);
  });
});

describe("revisões e retrabalho (Fase 2, bloco 4)", () => {
  it("uma correção NÃO consome a ronda incluída", () => {
    expect(consomeRonda({ tipo: "correcao" })).toBe(false);
    expect(eFaturavel({ tipo: "correcao" })).toBe(false);
  });

  it("uma alteração consome a ronda", () => {
    expect(consomeRonda({ tipo: "alteracao" })).toBe(true);
    expect(eFaturavel({ tipo: "alteracao" })).toBe(false);
  });

  it("o retrabalho é faturável", () => {
    expect(consomeRonda({ tipo: "retrabalho" })).toBe(false);
    expect(eFaturavel({ tipo: "retrabalho" })).toBe(true);
  });

  it("resume rondas por peça e deteta o excesso", () => {
    const revs: Revisao[] = [
      { tipo: "correcao" }, // não conta
      { tipo: "alteracao" }, // ronda 1
      { tipo: "alteracao" }, // ronda 2
      { tipo: "alteracao" }, // ronda 3 → excede 2
      { tipo: "retrabalho", valor: 120, faturada: false },
    ];
    const s = resumoRevisoesPeca(revs, 2);
    expect(s.correcoes).toBe(1);
    expect(s.rondas).toBe(3);
    expect(s.retrabalhos).toBe(1);
    expect(s.sobreLimite).toBe(true);
    expect(s.valorPorFaturar).toBe(120);
    expect(s.porFaturar).toBe(1);
  });

  it("retrabalho já faturado não conta para por faturar", () => {
    const s = resumoRevisoesPeca([{ tipo: "retrabalho", valor: 90, faturada: true }], 2);
    expect(s.valorPorFaturar).toBe(0);
    expect(s.porFaturar).toBe(0);
  });

  it("sem limite definido, nunca excede", () => {
    const revs: Revisao[] = [{ tipo: "alteracao" }, { tipo: "alteracao" }, { tipo: "alteracao" }];
    expect(resumoRevisoesPeca(revs, null).sobreLimite).toBe(false);
  });
});

describe("duração, pagamentos e financeiro (Fase 2, blocos 5+6)", () => {
  it("um contrato de 3 meses calcula renovação e aviso", () => {
    const d = contratoDatas("2026-07-01", 3, 30);
    expect(d.renovacao).toBe("2026-10-01"); // +3 meses
    expect(d.aviso).toBe("2026-09-01"); // 30 dias antes
    expect(d.revisaoPreco).toBe("2027-07-01"); // +12 meses
  });

  it("sem início, não há datas de contrato", () => {
    expect(contratoDatas(null, 3, 30).renovacao).toBeNull();
  });

  it("a Fundação 50/50 divide o total em dois", () => {
    const plano = planoPagamentoFundacao("50_50", 2000);
    expect(plano).toHaveLength(2);
    expect(plano[0].valor).toBe(1000);
    expect(plano[1].valor).toBe(1000);
  });

  it("a Fundação 100% é uma só fase", () => {
    const plano = planoPagamentoFundacao("100", 2000);
    expect(plano).toHaveLength(1);
    expect(plano[0].valor).toBe(2000);
  });

  it("o arranque só está completo com todos os pré-requisitos", () => {
    expect(arranqueCompleto({ proposta_aceite: true, dados_fiscais: true })).toBe(false);
    expect(
      arranqueCompleto({
        proposta_aceite: true,
        dados_fiscais: true,
        pagamento_inicial: true,
        acessos: true,
        briefing: true,
      }),
    ).toBe(true);
  });

  it("a dívida conta as cobranças por cobrar de meses passados", () => {
    const cobrancas: Cobranca[] = [
      { mes: "2026-05-01", valor: 600, estado: "por_cobrar" }, // vencida
      { mes: "2026-06-01", valor: 600, estado: "por_cobrar" }, // vencida
      { mes: "2026-07-01", valor: 600, estado: "por_cobrar" }, // mês atual, ainda não vencida
      { mes: "2026-04-01", valor: 600, estado: "cobrado" }, // paga
    ];
    const r = resumoDivida(cobrancas, "2026-07-01");
    expect(r.valorVencido).toBe(1200);
    expect(r.numVencidas).toBe(2);
  });

  it("as cores dos estados financeiros refletem a gravidade", () => {
    expect(corEstadoFinanceiro("regular")).toBe("good");
    expect(corEstadoFinanceiro("producao_condicionada")).toBe("warn");
    expect(corEstadoFinanceiro("producao_suspensa")).toBe("bad");
    expect(corEstadoFinanceiro("pagamento_atraso")).toBe("bad");
  });
});

describe("capacidade da operação (Fase 2, bloco 7)", () => {
  it("as horas produtivas descontam a fatia não faturável", () => {
    expect(horasProdutivas(160, 30)).toBeCloseTo(112); // 160 × 0.7
    expect(horasProdutivas(160, 0)).toBe(160);
    expect(horasProdutivas(null, 30)).toBeNull();
  });

  it("a ocupação é planeadas sobre produtivas", () => {
    expect(ocupacao(56, 112)).toBeCloseTo(0.5);
    expect(ocupacao(56, null)).toBeNull();
    expect(ocupacao(56, 0)).toBeNull();
  });

  it("o nível reflete a ocupação", () => {
    expect(nivelCapacidade(0.5)).toBe("folgada");
    expect(nivelCapacidade(0.8)).toBe("saudavel");
    expect(nivelCapacidade(0.95)).toBe("cheia");
    expect(nivelCapacidade(1.2)).toBe("sobrecarga");
    expect(nivelCapacidade(null)).toBeNull();
  });

  it("a Fundação distribui as horas pelos meses de implementação", () => {
    const fatias = distribuirFundacao(1800, 3); // 30h em 3 meses
    expect(fatias).toHaveLength(3);
    expect(fatias.reduce((s, x) => s + x, 0)).toBeCloseTo(30);
  });
});

describe("rentabilidade real (Fase 2, bloco 8)", () => {
  it("calcula receita/hora e margem prevista vs real", () => {
    const r = rentabilidade({
      receitaMensal: 1000,
      custo: 300,
      horasPlaneadas: 10,
      horasReais: 12,
      trabalhoNaoFaturado: 100,
    });
    expect(r.receitaHoraPlaneada).toBe(100); // 1000/10
    expect(r.receitaHoraReal).toBeCloseTo(83.33, 1); // 1000/12
    expect(r.margemPrevista).toBeCloseTo(0.7); // (1000-300)/1000
    expect(r.margemReal).toBeCloseTo(0.6); // (1000-300-100)/1000
    expect(r.desvioHoras).toBe(2);
  });

  it("cliente VERDE: margem e €/h saudáveis", () => {
    const r = rentabilidade({ receitaMensal: 1000, custo: 300, horasPlaneadas: 10, horasReais: 10, trabalhoNaoFaturado: 0 });
    expect(semaforo(r.margemReal, r.receitaHoraReal, LIMIARES_DEFEITO).cor).toBe("verde");
  });

  it("cliente AMARELO: €/hora real abaixo do alvo", () => {
    // 1000 / 25h = 40 €/h (entre 30 e 45) → amarelo
    const r = rentabilidade({ receitaMensal: 1000, custo: 300, horasPlaneadas: 10, horasReais: 25, trabalhoNaoFaturado: 0 });
    expect(semaforo(r.margemReal, r.receitaHoraReal, LIMIARES_DEFEITO).cor).toBe("amarelo");
  });

  it("cliente VERMELHO: margem real deficitária", () => {
    // custo 700 + 200 não faturado sobre 1000 → margem real 10% → vermelho
    const r = rentabilidade({ receitaMensal: 1000, custo: 700, horasPlaneadas: 10, horasReais: 10, trabalhoNaoFaturado: 200 });
    expect(semaforo(r.margemReal, r.receitaHoraReal, LIMIARES_DEFEITO).cor).toBe("vermelho");
  });

  it("as sugestões acompanham a cor e o desvio de horas", () => {
    expect(sugestoesRentabilidade("verde", 0)).toHaveLength(0);
    expect(sugestoesRentabilidade("vermelho", 5).length).toBeGreaterThan(0);
    expect(sugestoesRentabilidade("amarelo", 5).some((s) => s.includes("reuniões"))).toBe(true);
  });
});
