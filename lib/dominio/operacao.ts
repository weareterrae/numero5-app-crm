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
