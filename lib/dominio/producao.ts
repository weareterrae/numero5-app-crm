/**
 * Planeado vs. produzido — e o que há para cobrar a mais.
 *
 * O planeado vem do âmbito da proposta aceite (a avença contratada).
 * O produzido vem do que se aponta na folha do mês.
 * A diferença entre os dois é onde se ganha ou perde dinheiro.
 */

import type { Producao } from "./orcamento";

export const TIPOS_ITEM = [
  ["post", "Post"],
  ["carrossel", "Carrossel"],
  ["reel", "Reel"],
  ["story", "História"],
  ["anuncio", "Anúncio"],
  ["site", "Trabalho no site"],
  ["reuniao", "Reunião / apoio"],
  ["outro", "Outro"],
] as const;

export type TipoItem = (typeof TIPOS_ITEM)[number][0];

export type ItemProducao = {
  id: string;
  mes: string;
  tipo: TipoItem;
  descricao: string | null;
  quantidade: number;
  minutos: number | null;
  extra: boolean;
  valor: number | null;
  faturado: boolean;
  data: string;
};

/** Os tipos que constam do plano da avença. */
const TIPOS_PLANEADOS: Record<string, keyof Producao> = {
  post: "posts",
  carrossel: "carrosseis",
  reel: "reels",
  story: "stories",
};

export type LinhaComparacao = {
  tipo: TipoItem;
  rotulo: string;
  planeado: number;
  produzido: number;
  /** Positivo = produzimos a mais do que o contratado. */
  desvio: number;
};

export type ResumoProducao = {
  comparacao: LinhaComparacao[];
  /** Peças feitas a mais do que o contratado, sem estarem marcadas como extra. */
  excedente: number;
  extras: ItemProducao[];
  valorExtras: number;
  valorExtrasPorFaturar: number;
  minutosTotais: number;
  horas: number;
  /** Quanto rende cada hora neste cliente, contando a avença. */
  euroHora: number | null;
  /** Alertas honestos sobre o mês. */
  avisos: string[];
};

export function resumir(
  itens: ItemProducao[],
  planeado: Producao,
  avencaMensal: number | null,
): ResumoProducao {
  const somaPorTipo = (tipo: TipoItem) =>
    itens.filter((i) => i.tipo === tipo).reduce((t, i) => t + (Number(i.quantidade) || 0), 0);

  const comparacao: LinhaComparacao[] = TIPOS_ITEM.filter(([t]) => TIPOS_PLANEADOS[t]).map(
    ([tipo, rotulo]) => {
      const p = Number(planeado[TIPOS_PLANEADOS[tipo]] ?? 0);
      const produzido = somaPorTipo(tipo as TipoItem);
      return { tipo: tipo as TipoItem, rotulo, planeado: p, produzido, desvio: produzido - p };
    },
  );

  const extras = itens.filter((i) => i.extra);
  const valorExtras = extras.reduce((t, i) => t + (Number(i.valor) || 0), 0);
  const valorExtrasPorFaturar = extras
    .filter((i) => !i.faturado)
    .reduce((t, i) => t + (Number(i.valor) || 0), 0);

  const minutosTotais = itens.reduce((t, i) => t + (Number(i.minutos) || 0), 0);
  const horas = minutosTotais / 60;

  const receita = (Number(avencaMensal) || 0) + valorExtras;
  const euroHora = horas > 0 && receita > 0 ? receita / horas : null;

  // Excedente: peças a mais do contratado que NÃO foram marcadas como extra.
  const excedente = comparacao.reduce((t, l) => {
    const naoExtra = itens
      .filter((i) => i.tipo === l.tipo && !i.extra)
      .reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
    return t + Math.max(0, naoExtra - l.planeado);
  }, 0);

  const avisos: string[] = [];
  if (excedente > 0)
    avisos.push(
      `Produziste ${excedente} peça(s) a mais do que o contratado sem as marcar como extra. Ou marcas para cobrar, ou estás a oferecer trabalho.`,
    );
  if (valorExtrasPorFaturar > 0)
    avisos.push(`Há extras por faturar. Não deixes passar o mês.`);
  const semTempo = itens.filter((i) => !i.minutos).length;
  if (semTempo > 0)
    avisos.push(
      `${semTempo} registo(s) sem tempo apontado — sem isso não sabes se este cliente compensa.`,
    );
  const emFalta = comparacao.filter((l) => l.desvio < 0);
  if (emFalta.length)
    avisos.push(
      `Ainda falta entregar: ${emFalta.map((l) => `${-l.desvio} ${l.rotulo.toLowerCase()}`).join(", ")}.`,
    );

  return {
    comparacao,
    excedente,
    extras,
    valorExtras,
    valorExtrasPorFaturar,
    minutosTotais,
    horas,
    euroHora,
    avisos,
  };
}

/** Primeiro dia do mês, no formato que a base de dados guarda. */
export function mesISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function mesLegivel(iso: string): string {
  const [ano, mes] = iso.split("-");
  const nomes = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${nomes[Number(mes) - 1] ?? mes} de ${ano}`;
}

/** Desloca um mês para trás ou para a frente. */
export function deslocarMes(iso: string, passos: number): string {
  const [ano, mes] = iso.split("-").map(Number);
  const d = new Date(ano, mes - 1 + passos, 1);
  return mesISO(d);
}
