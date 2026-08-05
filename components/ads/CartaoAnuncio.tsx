import type { AnuncioRico } from "@/lib/ads/meta";

const fmt = (n: number) => n.toLocaleString("pt-PT");
const din = (v: number, m: string) =>
  `${v.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} ${m === "EUR" ? "€" : m}`;
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(2)}%`);
const FORMATO: Record<string, string> = {
  imagem: "🖼️ imagem",
  "vídeo": "🎬 vídeo",
  carrossel: "🔄 carrossel",
  "anúncio": "📢 anúncio",
};

/** Cartão de um anúncio: criativo + copy + público + resultados. Usado na Sede
 *  (cliente) e no cockpit de anúncios (operador) — uma verdade, dois lados. */
export function CartaoAnuncio({ a }: { a: AnuncioRico }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="grid sm:grid-cols-[210px_1fr]">
        {a.imagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.imagem} alt={a.titulo ?? "anúncio"} className="h-52 w-full object-cover sm:h-full" />
        ) : (
          <div className="grid h-52 place-items-center bg-cream text-3xl sm:h-full">📢</div>
        )}
        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="rotulo !text-[10px]">{a.campanha}</p>
            <span className="rounded-full bg-cream px-2.5 py-0.5 text-[10px] font-bold text-grey">
              {FORMATO[a.formato] ?? a.formato}
            </span>
          </div>
          {a.titulo ? (
            <h3 className="mt-1 font-display text-lg font-extrabold leading-snug">{a.titulo}</h3>
          ) : null}
          {a.corpo ? <p className="mt-1 line-clamp-3 text-sm text-grey">{a.corpo}</p> : null}
          {a.cta ? (
            <span className="mt-2 inline-block rounded-full border border-gold/50 bg-gold/10 px-3 py-0.5 text-[11px] font-bold text-gold-dark">
              {a.cta}
            </span>
          ) : null}

          <div className="mt-3 rounded-lg bg-cream/70 px-3 py-2 text-xs">
            <span className="font-bold text-ink">👥 Quem vê: </span>
            <span className="text-grey">{a.publico}</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <div>
              <p className="numero text-base leading-none">{fmt(a.alcance)}</p>
              <p className="text-[10px] text-soft">alcance</p>
            </div>
            <div>
              <p className="numero text-base leading-none">{fmt(a.cliques)}</p>
              <p className="text-[10px] text-soft">cliques{a.ctr != null ? ` · ${pct(a.ctr)}` : ""}</p>
            </div>
            {/* Anúncio de tráfego/interação não gera contactos — mostramos o custo por clique,
                que é o que faz sentido cobrar-lhe, em vez de um traço. */}
            {a.leads > 0 ? (
              <div>
                <p className="numero text-base leading-none">{fmt(a.leads)}</p>
                <p className="text-[10px] text-soft">
                  contactos{a.custo_por_lead ? ` · ${din(a.custo_por_lead, a.moeda)}` : ""}
                </p>
              </div>
            ) : (
              <div>
                <p className="numero text-base leading-none">
                  {a.cliques > 0 ? din(a.investimento / a.cliques, a.moeda) : "—"}
                </p>
                <p className="text-[10px] text-soft">por clique</p>
              </div>
            )}
            <div>
              <p className="numero text-base leading-none">{din(a.investimento, a.moeda)}</p>
              <p className="text-[10px] text-soft">investido</p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
