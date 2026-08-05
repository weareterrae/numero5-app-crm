import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultadosMesDados, RedeResumo } from "@/components/metricas/ResultadosMes";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function diaMes(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/**
 * As URLs do cdninstagram trazem a validade em `oe=` (unix time em hexadecimal) e morrem
 * ao fim de poucos dias. Melhor esconder o bloco do que mostrar uma imagem partida ao
 * cliente — a recolha diária traz uma URL nova todos os dias.
 */
function imagemValida(url: string): boolean {
  const m = /[?&]oe=([0-9A-Fa-f]+)/.exec(url);
  if (!m) return true; // sem validade declarada: assume-se boa (ex.: imagem nossa)
  const expira = parseInt(m[1], 16);
  return Number.isFinite(expira) && expira * 1000 > Date.now();
}

const LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
};
const SOCIAIS = Object.keys(LABEL); // gbp e web tratados à parte

type Linha = {
  rede: string;
  data: string;
  seguidores: number | null;
  ganho: number | null;
  alcance: number | null;
  interacoes: number | null;
  visitas: number | null;
  publicacoes: number | null;
  periodo_ini: string | null;
  periodo_fim: string | null;
  extra: Record<string, unknown> | null;
};

/** Lê as fotografias de métricas do cliente (todas as redes) e devolve os dados prontos para o bloco. */
export async function lerResultados(
  svc: SupabaseClient,
  clienteId: string,
): Promise<ResultadosMesDados | null> {
  const { data } = await svc
    .from("marca_metricas")
    .select("rede, data, seguidores, ganho, alcance, interacoes, visitas, publicacoes, periodo_ini, periodo_fim, extra")
    .eq("cliente_id", clienteId)
    .order("data", { ascending: false })
    .limit(40)
    .then((r) => r, () => ({ data: [] as Linha[] }));

  const linhas = (data ?? []) as Linha[];
  // A fotografia mais recente de cada rede.
  const porRede = new Map<string, Linha>();
  for (const l of linhas) if (!porRede.has(l.rede)) porRede.set(l.rede, l);

  const sociais = SOCIAIS.map((r) => porRede.get(r)).filter(Boolean) as Linha[];
  if (sociais.length === 0) return null;
  const web = porRede.get("web");
  const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

  const redes: RedeResumo[] = sociais
    .map((l) => ({
      nome: LABEL[l.rede] || l.rede,
      seguidores: num(l.seguidores),
      ganho: num(l.ganho),
      alcance: num(l.alcance),
    }))
    .sort((a, b) => b.seguidores - a.seguidores);

  const seguidores = redes.reduce((s, r) => s + r.seguidores, 0);
  const ganho = redes.reduce((s, r) => s + r.ganho, 0);
  const alcance = redes.reduce((s, r) => s + r.alcance, 0);
  const interacoes = sociais.reduce((s, l) => s + num(l.interacoes), 0);
  const comentarios = sociais.reduce((s, l) => s + num((l.extra ?? {}).comentarios), 0);
  const partilhas = sociais.reduce((s, l) => s + num((l.extra ?? {}).partilhas), 0);
  const publicacoes = sociais.reduce((s, l) => s + num(l.publicacoes), 0);
  const alcanceMedio = sociais.reduce((s, l) => s + num((l.extra ?? {}).alcance_medio), 0) || alcance / 30;

  const ref = porRede.get("instagram") ?? sociais[0];
  const exRef = (ref.extra ?? {}) as Record<string, unknown>;
  const serie = Array.isArray(exRef.serie) ? (exRef.serie as number[]) : [];

  // Evolução vs mês anterior (guardado em extra.anterior da linha de Instagram).
  const ant = exRef.anterior as { alcance?: number } | undefined;
  const evolucao =
    ant && num(ant.alcance) > 0
      ? { alcancePct: Math.round(((num(ref.alcance) - num(ant.alcance)) / num(ant.alcance)) * 100), ganhoPct: null }
      : null;

  // Post do mês (extra.top_post) e Google Business (linha rede='gbp').
  const tp = exRef.top_post as { imagem?: string; alcance?: number; interacoes?: number; legenda?: string } | undefined;
  const topPost =
    tp && tp.imagem && imagemValida(tp.imagem)
      ? { imagem: tp.imagem, alcance: num(tp.alcance), interacoes: num(tp.interacoes), legenda: tp.legenda ?? null }
      : null;

  const gbpRow = porRede.get("gbp");
  const gex = (gbpRow?.extra ?? {}) as Record<string, unknown>;
  const gbp = gbpRow
    ? {
        visualizacoes: num(gex.visualizacoes),
        pesquisas: num(gex.pesquisas),
        direcoes: num(gex.direcoes),
        chamadas: num(gex.chamadas),
      }
    : null;

  return {
    evolucao,
    topPost,
    gbp,
    periodo:
      ref.periodo_ini && ref.periodo_fim
        ? `${diaMes(ref.periodo_ini)} – ${diaMes(ref.periodo_fim)}`
        : diaMes(ref.data),
    redes,
    seguidores,
    ganho,
    base: seguidores - ganho > 0 ? seguidores - ganho : null,
    alcance,
    interacoes,
    comentarios,
    partilhas,
    publicacoes,
    alcanceMedio,
    serie,
    visitas: web?.visitas ?? null,
    fonte: "Metricool",
  };
}
