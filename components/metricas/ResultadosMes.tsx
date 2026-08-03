// Bloco «Resultados do mês» — a prova visual de que medimos e avaliamos.
// Server component puro: recebe os números (já agregados) e desenha.
// Usado na Sede do cliente e reaproveitável no relatório mensal.

export type RedeResumo = { nome: string; seguidores: number; ganho: number; alcance: number };

export type ResultadosMesDados = {
  periodo: string; // ex.: "4 jul – 3 ago"
  redes: RedeResumo[]; // uma entrada por rede ligada (Instagram, Facebook, …)
  seguidores: number; // total (soma das redes)
  ganho: number; // seguidores ganhos no período (total)
  base?: number | null; // seguidores no início (para "de X para Y")
  alcance: number; // total
  interacoes: number;
  comentarios: number;
  partilhas?: number | null;
  publicacoes: number;
  alcanceMedio: number;
  serie: number[]; // alcance dia a dia (para o sparkline)
  visitas?: number | null; // visitas ao site
  evolucao?: { alcancePct?: number | null; ganhoPct?: number | null } | null; // vs mês anterior
  topPost?: { imagem: string; alcance: number; interacoes: number; legenda?: string | null } | null;
  gbp?: { visualizacoes: number; pesquisas: number; direcoes: number; chamadas: number } | null;
  fonte?: string;
};

const ICON: Record<string, string> = {
  Instagram: "📷",
  Facebook: "👍",
  LinkedIn: "in",
  TikTok: "♪",
  YouTube: "▶",
  Google: "G",
};

const COBALT = "#2B44E7";
const GOLD = "#E8A13C";

function milhar(n: number) {
  return Math.round(n).toLocaleString("pt-PT");
}
function curto(n: number) {
  if (n >= 10000) return `${Math.round(n / 1000)} mil`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",")} mil`;
  return milhar(n);
}

function Sparkline({ serie }: { serie: number[] }) {
  const W = 560,
    H = 88,
    pad = 6;
  if (!serie || serie.length < 2) return null;
  const max = Math.max(...serie);
  const min = Math.min(...serie);
  const span = max - min || 1;
  const pts = serie.map((v, i) => {
    const x = pad + (i * (W - 2 * pad)) / (serie.length - 1);
    const y = H - pad - ((v - min) / span) * (H - 2 * pad);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L ${W - pad} ${H} L ${pad} ${H} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" className="mt-3 block">
      <defs>
        <linearGradient id="rmsg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={COBALT} stopOpacity="0.22" />
          <stop offset="1" stopColor={COBALT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#rmsg)" />
      <path d={line} fill="none" stroke={COBALT} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="4.5" fill={GOLD} />
    </svg>
  );
}

function Estatistica({ n, l, sub }: { n: string; l: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="font-display text-3xl font-extrabold tracking-tight" style={{ color: COBALT }}>
        {n}
      </p>
      <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-wide text-grey">{l}</p>
      {sub ? <p className="mt-0.5 text-xs text-soft">{sub}</p> : null}
    </div>
  );
}

export function ResultadosMes({ d }: { d: ResultadosMesDados }) {
  const pct = d.base && d.base > 0 ? Math.round((d.ganho / d.base) * 100) : null;
  return (
    <div className="rounded-3xl border border-line bg-cream p-6 sm:p-8">
      <div className="rotulo" style={{ color: "var(--color-gold-dark, #B4761A)" }}>
        Medimos · Avaliamos · Prestamos contas
      </div>
      <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Resultados do mês
      </h2>
      <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-grey">
        Não basta publicar — acompanhamos cada peça e medimos o que ela devolve. Este é o retrato
        honesto do último mês, com dados diretos do Metricool.
      </p>
      <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-grey">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: COBALT }} />
        {(d.redes.length ? d.redes.map((r) => r.nome).join(" + ") : "Instagram") + " · " + d.periodo}
      </span>

      <div className="mt-6 grid gap-4 sm:grid-cols-[1.1fr_1fr]">
        <div className="rounded-2xl border border-line bg-white p-6">
          <p className="font-display text-6xl font-extrabold leading-none tracking-tight" style={{ color: COBALT }}>
            {curto(d.alcance)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs font-bold uppercase tracking-wide text-soft">Alcance no período</p>
            {d.evolucao?.alcancePct != null ? (
              <span
                className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
                style={{
                  color: d.evolucao.alcancePct >= 0 ? "#2FA36B" : "#D6455D",
                  background: d.evolucao.alcancePct >= 0 ? "rgba(47,163,107,.1)" : "rgba(214,69,93,.1)",
                }}
              >
                {d.evolucao.alcancePct >= 0 ? "▲ +" : "▼ "}
                {d.evolucao.alcancePct}% vs mês anterior
              </span>
            ) : null}
          </div>
          <Sparkline serie={d.serie} />
          <p className="mt-1 font-mono text-[11px] text-soft">alcance dia a dia</p>
        </div>
        <div className="flex flex-col justify-center rounded-2xl bg-ink p-6 text-cream">
          <p className="font-display text-5xl font-extrabold leading-none">
            {(d.ganho >= 0 ? "+" : "") + milhar(d.ganho)}
            {pct !== null ? (
              <span className="ml-2 align-baseline text-2xl font-extrabold" style={{ color: GOLD }}>
                {(pct >= 0 ? "+" : "") + pct}%
              </span>
            ) : null}
          </p>
          <p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-wide text-cream/70">
            Seguidores ganhos
          </p>
          {d.base ? (
            <p className="mt-0.5 text-xs text-cream/50">
              de {milhar(d.base)} para {milhar(d.seguidores)} — crescimento orgânico
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-cream/50">total atual: {milhar(d.seguidores)}</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Estatistica n={milhar(d.interacoes)} l="Interações" sub="gostos, comentários, partilhas" />
        <Estatistica n={milhar(d.comentarios)} l="Comentários" sub="conversas geradas" />
        {d.visitas != null ? (
          <Estatistica n={curto(d.visitas)} l="Visitas ao site" sub="no período" />
        ) : (
          <Estatistica n={milhar(d.publicacoes)} l="Publicações" sub="feed, stories e reels" />
        )}
        <Estatistica n={curto(d.alcanceMedio)} l="Alcance médio" sub="por dia" />
      </div>

      {d.redes.length > 1 ? (
        <div className="mt-4">
          <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-soft">Por rede</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {d.redes.map((r) => (
              <div key={r.nome} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream font-mono text-sm font-bold text-ink">
                  {ICON[r.nome] || r.nome.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{r.nome}</p>
                  <p className="font-mono text-[11px] text-grey">
                    {milhar(r.seguidores)} seguidores
                    {r.ganho ? ` (${r.ganho >= 0 ? "+" : ""}${milhar(r.ganho)})` : ""}
                    {r.alcance > 0 ? ` · ${curto(r.alcance)} de alcance` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {d.topPost ? (
        <div className="mt-4">
          <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-soft">🏆 O post do mês</p>
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={d.topPost.imagem}
              alt="Melhor publicação do mês"
              className="h-24 w-24 shrink-0 rounded-xl border border-line object-cover"
            />
            <div className="min-w-0 flex-1">
              {d.topPost.legenda ? (
                <p className="line-clamp-2 text-sm font-semibold text-ink">{d.topPost.legenda}</p>
              ) : (
                <p className="text-sm font-semibold text-ink">A publicação que mais gente alcançou.</p>
              )}
              <p className="mt-2 font-mono text-[12px] text-grey">
                <b style={{ color: COBALT }}>{curto(d.topPost.alcance)}</b> de alcance ·{" "}
                <b style={{ color: COBALT }}>{milhar(d.topPost.interacoes)}</b> interações
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {d.gbp ? (
        <div className="mt-4">
          <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-soft">
            📍 Google Business — quem te procurou
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Estatistica n={milhar(d.gbp.visualizacoes)} l="Perfil visto" />
            <Estatistica n={milhar(d.gbp.direcoes)} l="Pediram direções" />
            <Estatistica n={milhar(d.gbp.chamadas)} l="Ligaram" />
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between border-t border-line pt-4 font-mono text-[11px] text-soft">
        <span>Fonte: {d.fonte || "Metricool"} · dados reais</span>
        <span>Números antes de adjetivos</span>
      </div>
    </div>
  );
}
