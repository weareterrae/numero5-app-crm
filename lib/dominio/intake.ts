/** Faixas de orçamento que o cliente pode indicar (sempre opcional). */
export const FAIXAS_ORCAMENTO = [
  ["ate_500", "Até 500 €/mês"],
  ["500_1000", "500 – 1 000 €/mês"],
  ["1000_2000", "1 000 – 2 000 €/mês"],
  ["mais_2000", "Mais de 2 000 €/mês"],
  ["nao_sei", "Ainda não sei"],
] as const;

export type FaixaOrcamento = (typeof FAIXAS_ORCAMENTO)[number][0];

export function rotuloFaixa(chave: string | null | undefined): string | null {
  if (!chave) return null;
  return FAIXAS_ORCAMENTO.find(([k]) => k === chave)?.[1] ?? null;
}
