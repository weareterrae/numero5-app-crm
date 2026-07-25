/**
 * Validação do conteúdo gerado pela IA (Parte 49) e checklist de revisão humana
 * (Parte 52). Puro e testável — sem dependências de servidor nem alias.
 * A proposta NUNCA é publicada com conteúdo inválido ou com placeholders críticos.
 */

export type ResultadoValidacao = { ok: boolean; erros: string[] };

function eTextoNaoVazio(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/** Valida a forma mínima do conteúdo. Campos novos só são validados se existirem. */
export function validarConteudoProposta(obj: unknown): ResultadoValidacao {
  const erros: string[] = [];
  if (!obj || typeof obj !== "object") return { ok: false, erros: ["Sem conteúdo."] };
  const c = obj as Record<string, unknown>;

  if (!eTextoNaoVazio(c.abertura)) erros.push("Falta a abertura.");
  if (!eTextoNaoVazio(c.fecho)) erros.push("Falta o fecho.");
  if (!Array.isArray(c.prioridades) || c.prioridades.length === 0) {
    erros.push("Faltam as prioridades.");
  } else {
    const mal = (c.prioridades as unknown[]).some(
      (p) => !p || typeof p !== "object" || !eTextoNaoVazio((p as Record<string, unknown>).titulo),
    );
    if (mal) erros.push("Há prioridades sem título.");
  }

  // Campos novos (opcionais): se vierem, têm de ter a forma certa.
  if (c.percebemos !== undefined && c.percebemos !== null) {
    const pv = c.percebemos as Record<string, unknown>;
    if (!Array.isArray(pv.factos) || !Array.isArray(pv.leitura))
      erros.push("«percebemos» deve ter factos[] e leitura[].");
  }
  if (c.medicao !== undefined && !Array.isArray(c.medicao)) erros.push("«medicao» deve ser lista.");
  if (c.responsabilidades !== undefined && c.responsabilidades !== null) {
    const rp = c.responsabilidades as Record<string, unknown>;
    if (!Array.isArray(rp.n5) || !Array.isArray(rp.cliente))
      erros.push("«responsabilidades» deve ter n5[] e cliente[].");
  }

  return { ok: erros.length === 0, erros };
}

const PLACEHOLDER_RE = /\[(?:A DEFINIR|A CONFIRMAR|PREENCHER|TODO|X+|EMPRESA|NOME|MARCA)\]/gi;

/** Encontra placeholders por preencher no texto (case-insensitive). */
export function encontrarPlaceholders(texto: string): string[] {
  return [...(texto.match(PLACEHOLDER_RE) ?? [])];
}

/** Junta todo o texto do conteúdo, para varrer placeholders. */
export function textoTodoConteudo(conteudo: unknown): string {
  const partes: string[] = [];
  const visitar = (v: unknown) => {
    if (typeof v === "string") partes.push(v);
    else if (Array.isArray(v)) v.forEach(visitar);
    else if (v && typeof v === "object") Object.values(v).forEach(visitar);
  };
  visitar(conteudo);
  return partes.join(" \n");
}

export type ItemChecklist = { item: string; ok: boolean; critico: boolean };

export type ContextoRevisao = {
  temValores: boolean; // setup ou avença definidos
  temValidade: boolean;
  idiomaCliente: "pt" | "en";
};

/** Checklist de revisão humana antes de partilhar (Parte 52). */
export function checklistRevisao(conteudo: unknown, ctx: ContextoRevisao): ItemChecklist[] {
  const validacao = validarConteudoProposta(conteudo);
  const placeholders = encontrarPlaceholders(textoTodoConteudo(conteudo));

  return [
    { item: "Conteúdo da IA revisto e coerente", ok: validacao.ok, critico: true },
    {
      item:
        placeholders.length === 0
          ? "Sem campos por preencher"
          : `Há campos por preencher: ${[...new Set(placeholders)].join(", ")}`,
      ok: placeholders.length === 0,
      critico: true,
    },
    { item: "Investimento definido (setup ou avença)", ok: ctx.temValores, critico: true },
    { item: "Proposta com validade", ok: ctx.temValidade, critico: false },
    { item: "Idioma coerente com a ficha do cliente", ok: true, critico: false },
  ];
}

/** Pode partilhar? Só quando nenhum item crítico falha. */
export function podePartilhar(itens: ItemChecklist[]): boolean {
  return !itens.some((i) => i.critico && !i.ok);
}
