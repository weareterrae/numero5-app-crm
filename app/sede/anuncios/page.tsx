import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServidor } from "@/lib/supabase/server";
import { campanhasMeta, anunciosRicosMeta, metaAdsConfigurado } from "@/lib/ads/meta";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("pt-PT");
const din = (v: number, m: string) =>
  `${v.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} ${m === "EUR" ? "€" : m}`;
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(2)}%`);

const FORMATO: Record<string, string> = { imagem: "🖼️ imagem", "vídeo": "🎬 vídeo", carrossel: "🔄 carrossel", "anúncio": "📢 anúncio" };

export default async function SedeAnuncios() {
  const ctx = await contextoSede();
  const supabase = await criarClienteServidor();

  let contaId: string | null = null;
  {
    const { data } = await supabase
      .from("orgs")
      .select("meta_ads_id")
      .eq("id", ctx.org.id)
      .maybeSingle()
      .then((r) => r, () => ({ data: null }));
    contaId = (data as { meta_ads_id?: string | null } | null)?.meta_ads_id ?? null;
  }

  const Vazio = () => (
    <div>
      <div className="rotulo">os teus anúncios</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Anúncios</h1>
      <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
        Ainda não há campanhas de anúncios ligadas à tua marca. Quando houver, vês aqui cada
        anúncio, quem está a alcançar e o que está a render. 🖐️
      </p>
    </div>
  );

  if (!contaId || !metaAdsConfigurado()) return <Vazio />;

  const [camp, ricos] = await Promise.all([campanhasMeta(contaId), anunciosRicosMeta(contaId)]);

  if (!camp.ok && (!ricos.ok || ricos.anuncios.length === 0)) {
    return (
      <div>
        <div className="rotulo">os teus anúncios</div>
        <h1 className="mt-1 font-display text-2xl font-extrabold">Anúncios</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Não conseguimos ler as campanhas neste momento — tenta daqui a pouco. 🖐️
        </p>
      </div>
    );
  }

  const totInvest = camp.ok ? camp.campanhas.reduce((s, c) => s + c.investimento, 0) : 0;
  const totLeads = camp.ok ? camp.campanhas.reduce((s, c) => s + c.leads, 0) : 0;
  const totAlcance = camp.ok ? camp.campanhas.reduce((s, c) => s + c.alcance, 0) : 0;
  const moeda = camp.ok ? camp.moeda : ricos.ok ? ricos.moeda : "EUR";
  const anuncios = ricos.ok ? ricos.anuncios : [];

  return (
    <div className="max-w-3xl">
      <div className="rotulo">os teus anúncios</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">O que os anúncios estão a fazer por ti</h1>
      <p className="mt-1 text-sm text-grey">
        Cada anúncio a correr, quem está a alcançar e o que está a render — números reais dos
        últimos 30 dias. A verba é tua e está sempre à vista. 🖐️
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-ink p-4 text-cream">
          <p className="numero text-2xl" style={{ color: "var(--color-gold)" }}>{fmt(totAlcance)}</p>
          <p className="text-[11px] text-cream/70">pessoas alcançadas</p>
        </div>
        <div className="rounded-xl bg-ink p-4 text-cream">
          <p className="numero text-2xl" style={{ color: "var(--color-gold)" }}>{totLeads > 0 ? fmt(totLeads) : "—"}</p>
          <p className="text-[11px] text-cream/70">contactos gerados</p>
        </div>
        <div className="rounded-xl bg-ink p-4 text-cream">
          <p className="numero text-2xl" style={{ color: "var(--color-gold)" }}>{din(totInvest, moeda)}</p>
          <p className="text-[11px] text-cream/70">investimento (30 d)</p>
        </div>
      </div>

      {anuncios.length > 0 ? (
        <section className="mt-7">
          <div className="rotulo mb-3">os anúncios a correr ({anuncios.length})</div>
          <div className="space-y-4">
            {anuncios.map((a) => (
              <article key={a.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                <div className="grid sm:grid-cols-[210px_1fr]">
                  {a.imagem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.imagem}
                      alt={a.titulo ?? "anúncio"}
                      className="h-52 w-full object-cover sm:h-full"
                    />
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
                    {a.titulo ? <h3 className="mt-1 font-display text-lg font-extrabold leading-snug">{a.titulo}</h3> : null}
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
                      <div>
                        <p className="numero text-base leading-none">{a.leads > 0 ? fmt(a.leads) : "—"}</p>
                        <p className="text-[10px] text-soft">
                          contactos{a.custo_por_lead ? ` · ${din(a.custo_por_lead, a.moeda)}` : ""}
                        </p>
                      </div>
                      <div>
                        <p className="numero text-base leading-none">{din(a.investimento, a.moeda)}</p>
                        <p className="text-[10px] text-soft">investido</p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : camp.ok && camp.campanhas.some((c) => c.estado === "ACTIVE") ? (
        <p className="mt-6 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Há campanhas a correr — os anúncios ao detalhe aparecem aqui assim que a Meta os
          devolver. 🖐️
        </p>
      ) : (
        <p className="mt-6 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Não há anúncios a correr neste momento. Quando arrancar a próxima campanha, aparece aqui. 🖐️
        </p>
      )}

      <p className="mt-6 text-[11px] text-soft">
        Fonte: Meta Ads (Instagram + Facebook), últimos 30 dias. Google, TikTok e outras redes
        aparecem aqui quando houver campanhas nelas.
      </p>
    </div>
  );
}
