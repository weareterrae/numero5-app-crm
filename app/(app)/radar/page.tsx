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

const CORES: Record<string, { dot: string; txt: string; label: string }> = {
  verde: { dot: "#2FA36B", txt: "em dia", label: "text-good" },
  amarelo: { dot: "#E8A13C", txt: "a ficar curto", label: "text-gold-dark" },
  vermelho: { dot: "#D6455D", txt: "precisa de ti", label: "text-bad" },
  cinzento: { dot: "#9aa0a6", txt: "sem dados", label: "text-soft" },
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

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="rotulo">o que estamos a comunicar</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Radar de comunicação</h1>
        <p className="mt-1 text-sm text-grey">
          O estado de cada marca — se o feed está em dia, a ficar curto ou às escuras. Dados do
          Metricool{ultimaTxt ? ` · última atualização a ${ultimaTxt}` : ""}. 🖐️
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(["vermelho", "amarelo", "verde"] as const).map((e) => (
          <div key={e} className="rounded-xl border border-line bg-white p-4">
            <p className="numero text-2xl" style={{ color: CORES[e].dot }}>
              {contagem[e]}
            </p>
            <p className="text-[11px] text-grey">{CORES[e].txt}</p>
          </div>
        ))}
      </div>

      <ul className="space-y-2">
        {cards.map(({ mrc, c, redes, seguidores, ganho, visitas }) => {
          const est = c?.estado ?? "cinzento";
          const cor = CORES[est];
          const falhas = Array.isArray(c?.falhas) ? c!.falhas!.length : 0;
          return (
            <li key={mrc.id}>
              <Link
                href={`/clientes/${mrc.id}`}
                className="flex items-center gap-4 rounded-xl border border-line bg-white px-4 py-3 transition hover:border-gold/50"
              >
                <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: cor.dot }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{mrc.nome_marca}</p>
                  <p className="truncate text-xs text-grey">
                    {falhas > 0
                      ? `⚠️ ${falhas} publicação${falhas > 1 ? "ões" : ""} falhou`
                      : c
                        ? `${cor.txt} · ${c.dias_cobertos ?? 0} dias cobertos · próximo ${diaMes(c.proximo_post)}`
                        : "à espera da 1.ª recolha"}
                  </p>
                  {redes.length > 0 ? (
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-soft">
                      {redes.map((r) => (
                        <span key={r.rede}>
                          <span className="font-bold text-grey">{r.sigla}</span> {fmt(r.m!.seguidores ?? 0)}
                          {r.m!.ganho ? (
                            <span className={r.m!.ganho > 0 ? "text-good" : "text-bad"}>
                              {" "}
                              {r.m!.ganho > 0 ? "+" : ""}
                              {r.m!.ganho}
                            </span>
                          ) : null}
                        </span>
                      ))}
                      {visitas != null ? (
                        <span>
                          <span className="font-bold text-grey">WEB</span> {fmt(visitas)} visitas
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                {redes.length > 0 ? (
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="numero text-sm">{fmt(seguidores)}</p>
                    <p className="text-[10px] text-soft">
                      seguidores{ganho ? ` (${ganho > 0 ? "+" : ""}${ganho})` : ""}
                    </p>
                  </div>
                ) : null}
                <span className={`shrink-0 text-xs font-bold ${cor.label}`}>ver →</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {cards.length === 0 ? (
        <p className="rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Ainda não há marcas ligadas ao Metricool. 🖐️
        </p>
      ) : null}
    </div>
  );
}
