import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Com = {
  cliente_id: string;
  estado: string;
  dias_cobertos: number | null;
  proximo_post: string | null;
  resumo: string | null;
  falhas: unknown[] | null;
  atualizado_em: string | null;
};
type Met = {
  cliente_id: string;
  rede: string;
  data: string;
  seguidores: number | null;
  ganho: number | null;
  alcance: number | null;
  visitas: number | null;
};

/** Redes sociais no Radar, por ordem de apresentação. A web é tratada à parte (visitas). */
const REDES: { rede: string; sigla: string }[] = [
  { rede: "instagram", sigla: "IG" },
  { rede: "facebook", sigla: "FB" },
  { rede: "linkedin", sigla: "IN" },
  { rede: "tiktok", sigla: "TT" },
  { rede: "youtube", sigla: "YT" },
];

const CORES: Record<string, { dot: string; txt: string; label: string; bg: string; borda: string }> = {
  verde: { dot: "#2FA36B", txt: "em dia", label: "text-good", bg: "bg-good/10", borda: "border-good/25" },
  amarelo: { dot: "#E8A13C", txt: "a ficar curto", label: "text-gold-dark", bg: "bg-gold/10", borda: "border-gold/30" },
  vermelho: { dot: "#D6455D", txt: "precisa de ti", label: "text-bad", bg: "bg-bad/10", borda: "border-bad/25" },
  cinzento: { dot: "#9aa0a6", txt: "sem dados", label: "text-soft", bg: "bg-line/30", borda: "border-line" },
};
const ORDEM: Record<string, number> = { vermelho: 0, amarelo: 1, verde: 2, cinzento: 3 };
const fmt = (n: number) => n.toLocaleString("pt-PT");
const diaMes = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
};

export default async function RadarPage() {
  const supabase = await criarClienteServidor();
  const [clientesRes, comRes, metRes] = await Promise.all([
    supabase.from("clientes").select("id, nome_marca").not("metricool_blog_id", "is", null),
    supabase
      .from("marca_comunicacao")
      .select("cliente_id, estado, dias_cobertos, proximo_post, resumo, falhas, atualizado_em")
      .then((r) => r, () => ({ data: null })),
    supabase
      .from("marca_metricas")
      .select("cliente_id, rede, data, seguidores, ganho, alcance, visitas")
      .order("data", { ascending: false })
      .then((r) => r, () => ({ data: null })),
  ]);

  const marcas = (clientesRes.data ?? []) as { id: string; nome_marca: string }[];
  const com = new Map(((comRes?.data ?? []) as Com[]).map((c) => [c.cliente_id, c]));
  // A fotografia mais recente de cada rede, por marca (as linhas vêm da mais nova para a mais antiga).
  const met = new Map<string, Map<string, Met>>();
  for (const m of (metRes?.data ?? []) as Met[]) {
    let porRede = met.get(m.cliente_id);
    if (!porRede) met.set(m.cliente_id, (porRede = new Map()));
    if (!porRede.has(m.rede)) porRede.set(m.rede, m);
  }

  const cards = marcas
    .map((mrc) => {
      const porRede = met.get(mrc.id);
      const redes = REDES.map((r) => ({ ...r, m: porRede?.get(r.rede) })).filter((r) => r.m);
      const seguidores = redes.reduce((s, r) => s + (r.m!.seguidores ?? 0), 0);
      const ganho = redes.reduce((s, r) => s + (r.m!.ganho ?? 0), 0);
      const visitas = porRede?.get("web")?.visitas ?? null;
      return { mrc, c: com.get(mrc.id), redes, seguidores, ganho, visitas };
    })
    .sort((a, b) => (ORDEM[a.c?.estado ?? "cinzento"] ?? 3) - (ORDEM[b.c?.estado ?? "cinzento"] ?? 3));

  const contagem = { vermelho: 0, amarelo: 0, verde: 0, cinzento: 0 } as Record<string, number>;
  for (const { c } of cards) contagem[c?.estado ?? "cinzento"]++;

  // Última atualização real dos dados (honesto: mostra se está fresco ou parado).
  const ultima = [...com.values()]
    .map((c) => c.atualizado_em)
    .filter(Boolean)
    .sort()
    .pop();
  const ultimaTxt = ultima
    ? new Date(ultima).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })
    : null;

  const total = Math.max(cards.length, 1);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="rotulo">o que estamos a comunicar</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Radar de comunicação</h1>
        <p className="mt-1 text-sm text-grey">
          O estado de cada marca — feed em dia, a ficar curto ou às escuras.{" "}
          <span className="text-soft">Dados do Metricool{ultimaTxt ? ` · atualizado a ${ultimaTxt}` : ""}.</span>
        </p>
      </div>

      {/* Resumo: contagens + barra proporcional do estado da carteira. */}
      <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <div className="flex items-end gap-6">
          {(["vermelho", "amarelo", "verde"] as const).map((e) => (
            <div key={e} className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="numero text-3xl leading-none" style={{ color: CORES[e].dot }}>
                  {contagem[e]}
                </span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CORES[e].dot }} />
              </div>
              <p className="mt-1 text-xs text-grey">{CORES[e].txt}</p>
            </div>
          ))}
          <div className="ml-auto text-right">
            <span className="numero text-3xl leading-none text-ink">{cards.length}</span>
            <p className="mt-1 text-xs text-grey">marcas</p>
          </div>
        </div>
        <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-line/40">
          {(["verde", "amarelo", "vermelho", "cinzento"] as const).map((e) =>
            contagem[e] ? (
              <div key={e} style={{ background: CORES[e].dot, width: `${(contagem[e] / total) * 100}%` }} />
            ) : null,
          )}
        </div>
      </div>

      <ul className="space-y-2.5">
        {cards.map(({ mrc, c, redes, seguidores, ganho, visitas }) => {
          const est = c?.estado ?? "cinzento";
          const cor = CORES[est];
          const falhas = Array.isArray(c?.falhas) ? c!.falhas!.length : 0;
          return (
            <li key={mrc.id}>
              <Link
                href={`/clientes/${mrc.id}`}
                className={`group flex items-center gap-4 rounded-2xl border ${cor.borda} bg-white px-4 py-3.5 transition hover:shadow-sm`}
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                  style={{ background: `${cor.dot}1f` }}
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: cor.dot }} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold">{mrc.nome_marca}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${cor.bg} ${cor.label}`}>
                      {cor.txt}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-grey">
                    {falhas > 0
                      ? `⚠️ ${falhas} publicação${falhas > 1 ? "ões" : ""} falhou`
                      : c
                        ? `${c.dias_cobertos ?? 0} dias cobertos · próximo ${diaMes(c.proximo_post)}`
                        : "à espera da 1.ª recolha"}
                  </p>
                  {redes.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {redes.map((r) => (
                        <span
                          key={r.rede}
                          className="inline-flex items-center gap-1 rounded-md bg-cream px-1.5 py-0.5 text-[10px]"
                        >
                          <span className="font-bold text-grey">{r.sigla}</span>
                          <span className="text-ink">{fmt(r.m!.seguidores ?? 0)}</span>
                          {r.m!.ganho ? (
                            <span className={r.m!.ganho > 0 ? "text-good" : "text-bad"}>
                              {r.m!.ganho > 0 ? "+" : ""}
                              {r.m!.ganho}
                            </span>
                          ) : null}
                        </span>
                      ))}
                      {visitas != null ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-cream px-1.5 py-0.5 text-[10px]">
                          <span className="font-bold text-grey">WEB</span>
                          <span className="text-ink">{fmt(visitas)}</span>
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {redes.length > 0 ? (
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="numero text-base leading-none">{fmt(seguidores)}</p>
                    <p className="mt-1 text-[10px] text-soft">
                      seguidores{ganho ? ` (${ganho > 0 ? "+" : ""}${ganho})` : ""}
                    </p>
                  </div>
                ) : null}
                <span className="shrink-0 text-soft transition group-hover:translate-x-0.5 group-hover:text-ink">→</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Ainda não há marcas ligadas ao Metricool. 🖐️
        </p>
      ) : null}
    </div>
  );
}
