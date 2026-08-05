import { campanhasMeta, anunciosRicosMeta, metaAdsConfigurado } from "@/lib/ads/meta";
import { CartaoAnuncio } from "@/components/ads/CartaoAnuncio";

const fmt = (n: number) => n.toLocaleString("pt-PT");
const din = (v: number, m: string) =>
  `${v.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} ${m === "EUR" ? "€" : m}`;

/**
 * O que os anúncios estão a fazer pela marca. Vive dentro de /sede/resultados — o cliente
 * tem um único sítio com o orgânico e o pago. Devolve null quando não há conta ligada,
 * para a página não mostrar uma secção vazia.
 */
export async function BlocoAnuncios({ contaId }: { contaId: string | null }) {
  if (!contaId || !metaAdsConfigurado()) return null;

  const [camp, ricos] = await Promise.all([campanhasMeta(contaId), anunciosRicosMeta(contaId)]);
  if (!camp.ok && (!ricos.ok || ricos.anuncios.length === 0)) return null;

  const totInvest = camp.ok ? camp.campanhas.reduce((s, c) => s + c.investimento, 0) : 0;
  const totLeads = camp.ok ? camp.campanhas.reduce((s, c) => s + c.leads, 0) : 0;
  const totAlcance = camp.ok ? camp.campanhas.reduce((s, c) => s + c.alcance, 0) : 0;
  const moeda = camp.ok ? camp.moeda : ricos.ok ? ricos.moeda : "EUR";
  const anuncios = ricos.ok ? ricos.anuncios : [];

  return (
    <section className="mt-10 border-t border-line pt-8">
      <div className="rotulo">o que pagámos para chegar mais longe</div>
      <h2 className="mt-1 font-display text-2xl font-extrabold">Anúncios</h2>
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
        <div className="mt-7">
          <div className="rotulo mb-3">os anúncios a correr ({anuncios.length})</div>
          <div className="space-y-4">
            {anuncios.map((a) => (
              <CartaoAnuncio key={a.id} a={a} />
            ))}
          </div>
        </div>
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
    </section>
  );
}
