/**
 * Métricas do negócio — cálculo puro, sem base de dados.
 * Recebe os dados já lidos e devolve os números do cockpit.
 */

import { ESTADOS, ESTADOS_ABERTOS, type Estado } from "./funil";

export type ClienteMetrica = {
  id: string;
  estado: Estado;
  valor_estimado: number | null;
};

export type AvencaMetrica = {
  valor_mensal: number;
  estado: "ativa" | "suspensa" | "terminada";
};

/** Quantos clientes em cada estado do funil. */
export function contarPorEstado(clientes: ClienteMetrica[]): Record<Estado, number> {
  const base = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<Estado, number>;
  for (const c of clientes) {
    if (c.estado in base) base[c.estado]++;
  }
  return base;
}

/** Valor total ainda em jogo (soma dos negócios não fechados nem perdidos). */
export function valorPipeline(clientes: ClienteMetrica[]): number {
  return clientes
    .filter((c) => ESTADOS_ABERTOS.includes(c.estado))
    .reduce((total, c) => total + (Number(c.valor_estimado) || 0), 0);
}

/** Receita recorrente mensal — só as avenças ativas. */
export function receitaRecorrente(avencas: AvencaMetrica[]): number {
  return avencas
    .filter((a) => a.estado === "ativa")
    .reduce((total, a) => total + (Number(a.valor_mensal) || 0), 0);
}

export function clientesAtivos(clientes: ClienteMetrica[]): number {
  return clientes.filter((c) => c.estado === "cliente").length;
}

/** Formata em euros, à portuguesa. */
export function euros(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(valor));
}

export function dataCurta(valor: string | null | undefined): string {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}
