// Domínio operacional do Nº 5 (Fase 2): reuniões, aprovações, revisões,
// capacidade. Cálculos puros e testáveis — sem acesso à base de dados.

// ── Reuniões ───────────────────────────────────────────────────────────────

export type Reuniao = {
  duracao_planeada_min?: number | null;
  duracao_real_min?: number | null;
  formato?: string | null;
  incluida?: boolean | null;
  faturar?: boolean | null;
  faturada?: boolean | null;
};

/** Minutos que a reunião consumiu: os reais, ou os planeados se ainda não há reais. */
export function minutosReuniao(r: Reuniao): number {
  const real = Number(r.duracao_real_min ?? NaN);
  if (Number.isFinite(real) && real > 0) return real;
  const plan = Number(r.duracao_planeada_min ?? 0);
  return Number.isFinite(plan) && plan > 0 ? plan : 0;
}

export type ResumoReunioes = {
  total: number;
  incluidas: number;
  extras: number;
  minutosReais: number;
  horasReais: number;
  extrasPorFaturar: number;
  /** Passou do número de reuniões incluídas no plano? */
  excedeIncluidas: boolean;
};

/**
 * Resume as reuniões de um período face ao limite incluído no plano.
 * `limiteIncluidas` a null = plano sem limite definido ([A DEFINIR]).
 */
export function resumoReunioes(reunioes: Reuniao[], limiteIncluidas: number | null): ResumoReunioes {
  let incluidas = 0;
  let extras = 0;
  let minutosReais = 0;
  let extrasPorFaturar = 0;

  for (const r of reunioes) {
    minutosReais += minutosReuniao(r);
    if (r.incluida === false) {
      extras += 1;
      if (r.faturar && !r.faturada) extrasPorFaturar += 1;
    } else {
      incluidas += 1;
    }
  }

  const total = reunioes.length;
  const excedeIncluidas = limiteIncluidas != null && limiteIncluidas >= 0 && total > limiteIncluidas;

  return {
    total,
    incluidas,
    extras,
    minutosReais,
    horasReais: minutosReais / 60,
    extrasPorFaturar,
    excedeIncluidas,
  };
}

/**
 * O tempo de reunião ultrapassa a percentagem-limite das horas contratadas?
 * `horasContratadas` ou `pctLimite` a null → sem alerta (sem base para calcular).
 */
export function reuniaoExcedePercentagem(
  minutosReais: number,
  horasContratadas: number | null,
  pctLimite: number | null,
): boolean {
  if (!horasContratadas || horasContratadas <= 0) return false;
  if (pctLimite == null || pctLimite <= 0) return false;
  const pct = minutosReais / 60 / horasContratadas;
  return pct > pctLimite / 100;
}

// ── Aprovações ───────────────────────────────────────────────────────────────

export type Aprovacao = {
  estado?: string | null; // pendente | aprovado | alteracoes | recusado | sem_resposta
  enviado_em?: string | null;
  prazo?: string | null; // data ISO (yyyy-mm-dd)
  resolvido_em?: string | null;
};

/** Nada é publicado sem aprovação expressa: estes estados ainda esperam o cliente. */
export const ESTADOS_PENDENTES = new Set(["pendente", "sem_resposta"]);

const DIA = 86_400_000;
const dias = (de: string, ate: string) =>
  Math.round((new Date(ate).getTime() - new Date(de).getTime()) / DIA);

/** Uma aprovação está bloqueada (atrasada) se continua pendente e passou do prazo. */
export function aprovacaoAtrasada(a: Aprovacao, hojeISO: string): boolean {
  return ESTADOS_PENDENTES.has(a.estado ?? "pendente") && !!a.prazo && a.prazo < hojeISO;
}

export type IndicadorAprovacao = {
  total: number;
  pendentes: number;
  bloqueados: number;
  tempoMedioDias: number | null;
  pctNoPrazo: number | null;
  diasAtrasoAcumulados: number;
};

/**
 * Indicador interno de aprovação do cliente: rapidez, cumprimento de prazos e
 * conteúdos bloqueados. `hojeISO` é injetado para ser determinístico.
 */
export function indicadorAprovacao(aprovacoes: Aprovacao[], hojeISO: string): IndicadorAprovacao {
  let pendentes = 0;
  let bloqueados = 0;
  let diasAtrasoAcumulados = 0;
  const temposResolucao: number[] = [];
  let comPrazoResolvidos = 0;
  let noPrazo = 0;

  for (const a of aprovacoes) {
    const estado = a.estado ?? "pendente";
    if (ESTADOS_PENDENTES.has(estado)) {
      pendentes += 1;
      if (aprovacaoAtrasada(a, hojeISO)) {
        bloqueados += 1;
        diasAtrasoAcumulados += Math.max(0, dias(a.prazo as string, hojeISO));
      }
    } else if (a.enviado_em && a.resolvido_em) {
      temposResolucao.push(Math.max(0, dias(a.enviado_em, a.resolvido_em)));
      if (a.prazo) {
        comPrazoResolvidos += 1;
        if (a.resolvido_em.slice(0, 10) <= a.prazo) noPrazo += 1;
      }
    }
  }

  return {
    total: aprovacoes.length,
    pendentes,
    bloqueados,
    tempoMedioDias:
      temposResolucao.length > 0
        ? temposResolucao.reduce((s, x) => s + x, 0) / temposResolucao.length
        : null,
    pctNoPrazo: comPrazoResolvidos > 0 ? noPrazo / comPrazoResolvidos : null,
    diasAtrasoAcumulados,
  };
}

/** Microcopy para o cliente quando um conteúdo espera aprovação há demasiado tempo. */
export const MICROCOPY_ATRASO_APROVACAO = {
  pt: "Este conteúdo continua à espera da tua aprovação. O atraso pode obrigar ao ajustamento da data de publicação.",
  en: "This content is still waiting for your approval. The delay may require adjusting the publication date.",
} as const;

// ── Revisões e retrabalho ────────────────────────────────────────────────────

export type TipoRevisao = "correcao" | "alteracao" | "retrabalho";

export type Revisao = {
  tipo?: string | null; // correcao | alteracao | retrabalho
  incluido?: boolean | null;
  horas?: number | null;
  valor?: number | null;
  faturada?: boolean | null;
};

/** Só a alteração (mudança do cliente dentro do briefing) consome a ronda incluída. */
export function consomeRonda(r: Revisao): boolean {
  return (r.tipo ?? "alteracao") === "alteracao";
}

/** O retrabalho (ou qualquer coisa marcada como extra) é trabalho faturável. */
export function eFaturavel(r: Revisao): boolean {
  return (r.tipo ?? "alteracao") === "retrabalho" || r.incluido === false;
}

export type ResumoRevisoes = {
  correcoes: number;
  rondas: number; // alterações que consomem ronda
  retrabalhos: number;
  horas: number;
  /** Sobre o limite de rondas incluídas nesta peça? */
  sobreLimite: boolean;
  /** Valor de extras/retrabalho ainda por faturar. */
  valorPorFaturar: number;
  porFaturar: number;
};

/**
 * Resume as revisões de UMA peça face ao limite de rondas incluídas.
 * `incluidasLim` a null = sem limite definido ([A DEFINIR]).
 */
export function resumoRevisoesPeca(revisoes: Revisao[], incluidasLim: number | null): ResumoRevisoes {
  let correcoes = 0;
  let rondas = 0;
  let retrabalhos = 0;
  let horas = 0;
  let valorPorFaturar = 0;
  let porFaturar = 0;

  for (const r of revisoes) {
    const tipo = r.tipo ?? "alteracao";
    horas += Number(r.horas) || 0;
    if (tipo === "correcao") correcoes += 1;
    else if (tipo === "alteracao") rondas += 1;
    else if (tipo === "retrabalho") retrabalhos += 1;

    if (eFaturavel(r) && !r.faturada) {
      porFaturar += 1;
      valorPorFaturar += Number(r.valor) || 0;
    }
  }

  return {
    correcoes,
    rondas,
    retrabalhos,
    horas,
    sobreLimite: incluidasLim != null && incluidasLim >= 0 && rondas > incluidasLim,
    valorPorFaturar,
    porFaturar,
  };
}

// ── Duração, renovação e pagamentos ──────────────────────────────────────────

export function adicionarMeses(iso: string, meses: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}
export function adicionarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const CONTRATO_DEFEITO = { duracaoMeses: 3, avisoDias: 30 };

export type ContratoDatas = {
  renovacao: string | null;
  aviso: string | null;
  revisaoPreco: string | null;
};

/** Datas do contrato a partir do início, duração mínima e aviso prévio. */
export function contratoDatas(
  inicio: string | null | undefined,
  duracaoMeses: number | null | undefined,
  avisoDias: number | null | undefined,
): ContratoDatas {
  if (!inicio) return { renovacao: null, aviso: null, revisaoPreco: null };
  const dur = duracaoMeses ?? CONTRATO_DEFEITO.duracaoMeses;
  const renovacao = adicionarMeses(inicio, dur);
  const aviso = adicionarDias(renovacao, -(avisoDias ?? CONTRATO_DEFEITO.avisoDias));
  const revisaoPreco = adicionarMeses(inicio, 12);
  return { renovacao, aviso, revisaoPreco };
}

/** Fases de pagamento da Fundação. Predefinição: 50% adjudicação + 50% entrega. */
export const PAGAMENTO_FUNDACAO: Record<string, { rotulo: string; pct: number }[]> = {
  "50_50": [
    { rotulo: "Na adjudicação", pct: 50 },
    { rotulo: "Antes da entrega / entrada em produção", pct: 50 },
  ],
  "100": [{ rotulo: "Na adjudicação", pct: 100 }],
};

export function planoPagamentoFundacao(
  modo: string | null | undefined,
  total: number,
): { rotulo: string; valor: number; pct: number }[] {
  const partes = PAGAMENTO_FUNDACAO[modo ?? "50_50"] ?? PAGAMENTO_FUNDACAO["50_50"];
  return partes.map((p) => ({ rotulo: p.rotulo, pct: p.pct, valor: Math.round((total * p.pct) / 100) }));
}

// Pré-requisitos para arrancar uma Fundação (nenhum arranca sem estes).
export const REQUISITOS_ARRANQUE = [
  "proposta_aceite",
  "dados_fiscais",
  "pagamento_inicial",
  "acessos",
  "briefing",
] as const;

export function arranqueCompleto(arranque: Record<string, unknown> | null | undefined): boolean {
  const a = arranque ?? {};
  return REQUISITOS_ARRANQUE.every((k) => !!a[k]);
}

// ── Estado financeiro do cliente ─────────────────────────────────────────────

export type Cobranca = { mes: string; valor?: number | null; estado?: string | null };

export type ResumoDivida = { valorVencido: number; numVencidas: number };

/** Dívida derivada das cobranças por cobrar de meses já passados. */
export function resumoDivida(cobrancas: Cobranca[], primeiroDiaMesAtual: string): ResumoDivida {
  let valorVencido = 0;
  let numVencidas = 0;
  for (const c of cobrancas) {
    if ((c.estado ?? "por_cobrar") === "por_cobrar" && c.mes < primeiroDiaMesAtual) {
      valorVencido += Number(c.valor) || 0;
      numVencidas += 1;
    }
  }
  return { valorVencido, numVencidas };
}

export type EstadoFinanceiro =
  | "regular"
  | "pagamento_proximo"
  | "pagamento_atraso"
  | "aviso"
  | "producao_condicionada"
  | "producao_suspensa"
  | "acordo_especial";

export const ESTADO_FINANCEIRO_ROTULO: Record<EstadoFinanceiro, string> = {
  regular: "Regular",
  pagamento_proximo: "Pagamento próximo",
  pagamento_atraso: "Pagamento em atraso",
  aviso: "Aviso",
  producao_condicionada: "Produção condicionada",
  producao_suspensa: "Produção suspensa",
  acordo_especial: "Acordo especial",
};

/** Estados que exigem atenção no cockpit (não suspendem nada automaticamente). */
export const ESTADOS_FINANCEIROS_ALERTA = new Set<string>([
  "pagamento_atraso",
  "aviso",
  "producao_condicionada",
  "producao_suspensa",
]);

export function corEstadoFinanceiro(estado: string | null | undefined): "good" | "warn" | "bad" {
  if (estado === "producao_suspensa" || estado === "pagamento_atraso") return "bad";
  if (ESTADOS_FINANCEIROS_ALERTA.has(estado ?? "")) return "warn";
  return "good";
}

// ── Capacidade da operação ───────────────────────────────────────────────────

/** Horas produtivas (faturáveis) = totais menos a fatia reservada. */
export function horasProdutivas(
  horasTotais: number | null,
  pctNaoFaturavel: number | null,
): number | null {
  if (horasTotais == null || horasTotais <= 0) return null;
  const pct = pctNaoFaturavel == null ? 0 : Math.min(100, Math.max(0, pctNaoFaturavel));
  return horasTotais * (1 - pct / 100);
}

/** Fração de ocupação (planeadas / produtivas). Null se não há base. */
export function ocupacao(planeadas: number, produtivas: number | null): number | null {
  if (produtivas == null || produtivas <= 0) return null;
  return planeadas / produtivas;
}

export type NivelCapacidade = "folgada" | "saudavel" | "cheia" | "sobrecarga";

/** Nível de ocupação: <70% folgada, <90% saudável, <=100% cheia, >100% sobrecarga. */
export function nivelCapacidade(ocupacaoFrac: number | null): NivelCapacidade | null {
  if (ocupacaoFrac == null) return null;
  if (ocupacaoFrac > 1) return "sobrecarga";
  if (ocupacaoFrac >= 0.9) return "cheia";
  if (ocupacaoFrac >= 0.7) return "saudavel";
  return "folgada";
}

/**
 * Distribui as horas de setup de uma Fundação pelos meses de implementação.
 * Distribuição uniforme (a última fatia absorve o resto), em horas.
 */
export function distribuirFundacao(minutosSetup: number, meses: number): number[] {
  const m = Math.max(1, Math.round(meses));
  const horas = (Number(minutosSetup) || 0) / 60;
  if (horas <= 0) return Array(m).fill(0);
  const base = Math.floor((horas / m) * 10) / 10; // 1 casa decimal
  const fatias = Array(m).fill(base);
  fatias[m - 1] = Math.round((horas - base * (m - 1)) * 10) / 10;
  return fatias;
}

// ── Rentabilidade real ───────────────────────────────────────────────────────

export type EntradaRentabilidade = {
  receitaMensal: number;
  /** Custo interno + externo (do catálogo), já somado. */
  custo: number;
  horasPlaneadas: number;
  horasReais: number;
  /** Valor de trabalho executado e ainda não faturado (erode a margem real). */
  trabalhoNaoFaturado: number;
};

export type Rentabilidade = {
  receitaHoraPlaneada: number | null;
  receitaHoraReal: number | null;
  margemPrevista: number | null;
  margemReal: number | null;
  desvioHoras: number; // reais − planeadas
};

/**
 * Rentabilidade prevista vs. real de um cliente. A margem real desconta o
 * trabalho executado que ficou por faturar; a receita/hora usa as horas reais.
 */
export function rentabilidade(e: EntradaRentabilidade): Rentabilidade {
  const receita = Number(e.receitaMensal) || 0;
  const custo = Number(e.custo) || 0;
  const naoFaturado = Math.max(0, Number(e.trabalhoNaoFaturado) || 0);

  return {
    receitaHoraPlaneada: e.horasPlaneadas > 0 ? receita / e.horasPlaneadas : null,
    receitaHoraReal: e.horasReais > 0 ? receita / e.horasReais : null,
    margemPrevista: receita > 0 ? (receita - custo) / receita : null,
    margemReal: receita > 0 ? (receita - custo - naoFaturado) / receita : null,
    desvioHoras: (Number(e.horasReais) || 0) - (Number(e.horasPlaneadas) || 0),
  };
}

// ── Versões de proposta ──────────────────────────────────────────────────────

export type SnapshotVersao = {
  avenca_valor?: number | null;
  setup_valor?: number | null;
  ambito?: string[] | null;
};

export type DiferencaVersao = {
  deltaAvenca: number | null;
  deltaSetup: number | null;
  avencaAnterior: number | null;
  avencaNova: number | null;
  setupAnterior: number | null;
  setupNovo: number | null;
  ambitoAdicionado: string[];
  ambitoRemovido: string[];
};

/** Diferenças entre duas versões — preço e âmbito. `anterior` a null = primeira. */
export function diferencasVersao(
  anterior: SnapshotVersao | null,
  nova: SnapshotVersao,
): DiferencaVersao {
  const aAvenca = anterior?.avenca_valor ?? null;
  const nAvenca = nova.avenca_valor ?? null;
  const aSetup = anterior?.setup_valor ?? null;
  const nSetup = nova.setup_valor ?? null;
  const aAmbito = new Set(anterior?.ambito ?? []);
  const nAmbito = new Set(nova.ambito ?? []);

  return {
    avencaAnterior: aAvenca,
    avencaNova: nAvenca,
    deltaAvenca: aAvenca != null && nAvenca != null ? nAvenca - aAvenca : null,
    setupAnterior: aSetup,
    setupNovo: nSetup,
    deltaSetup: aSetup != null && nSetup != null ? nSetup - aSetup : null,
    ambitoAdicionado: [...nAmbito].filter((x) => !aAmbito.has(x)),
    ambitoRemovido: [...aAmbito].filter((x) => !nAmbito.has(x)),
  };
}

// ── Ordens de alteração ──────────────────────────────────────────────────────

/** Total de uma ordem de alteração com IVA. */
export function totalOrdem(preco: number | null | undefined, ivaPct: number | null | undefined): number {
  const base = Number(preco) || 0;
  const iva = ivaPct == null ? 0 : Number(ivaPct) || 0;
  return Math.round(base * (1 + iva / 100) * 100) / 100;
}

/** Uma ordem só entra em produção depois de aceite. */
export function ordemEntraProducao(estado: string | null | undefined): boolean {
  return estado === "aceite" || estado === "produzida" || estado === "faturada";
}

/** Sugestões internas quando a rentabilidade aperta (nunca aplicadas sozinhas). */
export function sugestoesRentabilidade(cor: string, desvioHoras: number): string[] {
  const s: string[] = [];
  if (cor === "vermelho") {
    s.push("Rever o preço na renovação.");
    s.push("Cobrar as revisões e o retrabalho fora do incluído.");
    s.push("Rever o âmbito ou reduzir a produção.");
  } else if (cor === "amarelo") {
    s.push("Vigiar as horas — o consumo está acima do previsto.");
    s.push("Aumentar o fee de coordenação na próxima revisão.");
  }
  if (desvioHoras > 0) s.push("Limitar reuniões e consolidar rondas de alterações.");
  return s;
}
