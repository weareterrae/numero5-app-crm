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
