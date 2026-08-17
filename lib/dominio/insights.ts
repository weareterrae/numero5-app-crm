/**
 * Insights do mês passado — fecha o ciclo relatório → plano.
 *
 * Lê a fotografia dos posts que o relatório já guardou (coluna `posts` jsonb,
 * migração 0070) + as reações do cliente (`relatorio_post_reacoes`) e destila
 * o que resultou: temas que mais renderam, a publicação campeã, e o que o
 * cliente pediu para ver mais/menos. Cálculo puro, sem base de dados.
 *
 * Não inventa nada: se o relatório não tiver posts, devolve null e a app
 * simplesmente não mostra o painel.
 */

/** Um post tal como o gerador o guarda na coluna `posts` do relatório. */
export type PostRelatorio = {
  data?: string | null;
  tipo?: string | null;
  formato?: string | null;
  tema?: string | null;
  titulo?: string | null;
  reach?: number | null;
  inter?: number | null;
  guardados?: number | null;
  partilhas?: number | null;
  url?: string | null;
};

export type ReacaoRelatorio = {
  post_url: string;
  reacao: "mais" | "menos" | "favorito" | string;
};

export type TemaInsight = {
  tema: string;
  nPosts: number;
  mediaInter: number;
  mediaReach: number;
};

export type InsightsMes = {
  mes: string;
  nPosts: number;
  alcanceTotal: number;
  temas: TemaInsight[];
  melhorPost: { titulo: string; tema: string; reach: number; inter: number } | null;
  reacoes: { favorito: string[]; mais: string[]; menos: string[] };
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Destila os insights de um relatório. `posts` vem da coluna jsonb; `reacoes`
 * são as marcações do cliente. Devolve null se não houver posts com que trabalhar.
 */
export function destilarInsights(
  mes: string,
  posts: unknown,
  reacoes: ReacaoRelatorio[] = [],
): InsightsMes | null {
  const lista = (Array.isArray(posts) ? posts : []) as PostRelatorio[];
  if (lista.length === 0) return null;

  // Agrupa por tema (média de interações por publicação = o que "rende").
  const porTema = new Map<string, { n: number; inter: number; reach: number }>();
  let alcanceTotal = 0;
  let melhor: InsightsMes["melhorPost"] = null;

  for (const p of lista) {
    const tema = (p.tema || "Outros").trim() || "Outros";
    const inter = num(p.inter);
    const reach = num(p.reach);
    alcanceTotal += reach;

    const acc = porTema.get(tema) ?? { n: 0, inter: 0, reach: 0 };
    acc.n += 1;
    acc.inter += inter;
    acc.reach += reach;
    porTema.set(tema, acc);

    if (!melhor || reach > melhor.reach) {
      melhor = { titulo: (p.titulo || "Publicação sem título").trim(), tema, reach, inter };
    }
  }

  const temas: TemaInsight[] = [...porTema.entries()]
    .map(([tema, a]) => ({
      tema,
      nPosts: a.n,
      mediaInter: a.inter / a.n,
      mediaReach: a.reach / a.n,
    }))
    .sort((x, y) => y.mediaInter - x.mediaInter);

  // Reações do cliente → títulos (por url).
  const tituloDe = (url: string) =>
    lista.find((p) => p.url === url)?.titulo?.trim() || url;
  const reacoesOut = { favorito: [] as string[], mais: [] as string[], menos: [] as string[] };
  for (const r of reacoes) {
    const g = reacoesOut[r.reacao as "favorito" | "mais" | "menos"];
    if (g) g.push(tituloDe(r.post_url));
  }

  return {
    mes,
    nPosts: lista.length,
    alcanceTotal,
    temas,
    melhorPost: melhor,
    reacoes: reacoesOut,
  };
}

/**
 * Formata os insights em texto para entrar no brief que se cola no Claude Code.
 * Linhas curtas, PT-PT, só números reais. Devolve [] se não houver insights.
 */
export function linhasBriefInsights(ins: InsightsMes | null, mesPassadoLabel: string): string[] {
  if (!ins) return [];
  const dec1 = (n: number) => n.toFixed(1).replace(".", ",");
  const L: string[] = [];
  L.push(`O QUE RESULTOU EM ${mesPassadoLabel.toUpperCase()} (usa para orientar este mês)`);

  const top = ins.temas.slice(0, 3);
  if (top.length) {
    L.push("- Temas que mais renderam (média de interações por publicação):");
    top.forEach((t, i) =>
      L.push(`  ${i + 1}. ${t.tema} — ${dec1(t.mediaInter)} int./post (${t.nPosts} ${t.nPosts === 1 ? "post" : "posts"})`),
    );
  }
  const fraco = ins.temas[ins.temas.length - 1];
  if (ins.temas.length > 2 && fraco) {
    L.push(`- O que rendeu menos: ${fraco.tema} (${dec1(fraco.mediaInter)} int./post) — aliviar.`);
  }
  if (ins.melhorPost) {
    L.push(
      `- Publicação campeã: «${ins.melhorPost.titulo}» (${ins.melhorPost.tema}) — ${ins.melhorPost.reach.toLocaleString("pt-PT")} de alcance.`,
    );
  }
  const r = ins.reacoes;
  if (r.favorito.length) L.push(`- O cliente adorou: ${r.favorito.join("; ")}.`);
  if (r.mais.length) L.push(`- O cliente quer MAIS: ${r.mais.join("; ")}.`);
  if (r.menos.length) L.push(`- O cliente quer MENOS: ${r.menos.join("; ")}.`);

  L.push("Dobra os temas do topo, mantém a variedade, e traz o que o cliente pediu.");
  return L;
}
