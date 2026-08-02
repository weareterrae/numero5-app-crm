/**
 * O funil do Nº 5 — lógica pura, sem UI e sem base de dados.
 * Os nomes dos estados são os do negócio e não se traduzem.
 */

export const ESTADOS = [
  "lead",
  "contactado",
  "diagnostico",
  "proposta",
  "cliente",
  "perdido",
] as const;

export type Estado = (typeof ESTADOS)[number];

export const ESTADO_LABEL: Record<Estado, string> = {
  lead: "Lead",
  contactado: "Contactado",
  diagnostico: "Diagnóstico",
  proposta: "Proposta",
  cliente: "Cliente",
  perdido: "Perdido",
};

/** Estados que representam negócio ainda em jogo (contam para o pipeline). */
export const ESTADOS_ABERTOS: Estado[] = ["lead", "contactado", "diagnostico", "proposta"];

/** A ordem natural de avanço (o "perdido" sai por fora, de qualquer ponto). */
export const PERCURSO: Estado[] = ["lead", "contactado", "diagnostico", "proposta", "cliente"];

export function estaAberto(estado: Estado): boolean {
  return ESTADOS_ABERTOS.includes(estado);
}

/** Um lead pode ir para qualquer estado; só exigimos motivo ao dar como perdido. */
export function transicaoValida(de: Estado, para: Estado): boolean {
  if (de === para) return false;
  return ESTADOS.includes(para);
}

export function exigeMotivo(para: Estado): boolean {
  return para === "perdido";
}

/**
 * Taxa de conversão entre dois passos do percurso, a partir do histórico de
 * transições. Conta clientes distintos que ALGUMA VEZ chegaram a cada estado —
 * é o que evita contar mal quem já avançou para lá do passo seguinte.
 */
export function taxaConversao(
  transicoes: { cliente_id: string; para_estado: string }[],
  de: Estado,
  para: Estado,
): number | null {
  // Por COORTE: no numerador só conta quem passou pelo passo anterior.
  // (Clientes migrados/criados diretamente num estado avançado não entram —
  // senão a taxa passava de 100%, que era o que acontecia.)
  const em = (e: Estado) =>
    new Set(transicoes.filter((t) => t.para_estado === e).map((t) => t.cliente_id));
  const base = em(de);
  if (base.size === 0) return null;
  const converteram = [...em(para)].filter((id) => base.has(id)).length;
  return converteram / base.size;
}

export function formatarPercentagem(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}
