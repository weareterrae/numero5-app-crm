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
  const totCliques = camp.ok ? camp.campanhas.reduce((s, c) => s + c.cliques, 0) : 0;
  // Pessoas ÚNICAS. Somar campanhas contava a mesma pessoa uma vez por campanha (1,31x na Terrae).
  const totAlcance = (camp.ok ? camp.alcanceReal : null) ?? 0;
  const moeda = camp.ok ? camp.moeda : ricos.ok ? ricos.moeda : "EUR";
  const anuncios = ricos.ok ? ricos.anuncios : [];
  const aCorrer = anuncios.filter((a) => a.ativo).length;

  // 69 cartões é uma página que ninguém lê. Mostram-se os que estão a correr mais os já
  // terminados até cobrir 90% do investimento; o resto vai para um <details>, nunca escondido.
  const limiar = anuncios.reduce((s, a) => s + a.investimento, 0) * 0.9;
  let acumulado = 0;
  let corte = 0;
  for (const a of anuncios) {
    corte++;
    acumulado += a.investimento;
    if (!a.ativo && acumulado >= limiar) break;
  }
  const destacados = anuncios.slice(0, Math.max(corte, aCorrer));
  const restantes = anuncios.slice(destacados.length);
  const investRestantes = restantes.reduce((s, a) => s + a.investimento, 0);

  // Marcas com campanhas de tráfego/interação não geram contactos — mostrar «—» faz parecer
  // que os anúncios não fizeram nada. Nesse caso destacamos os cliques, que é o que se pediu
  // à campanha.
  const destaque = totLeads > 0
    ? { valor: fmt(totLeads), rotulo: "contactos gerados" }
    : { valor: fmt(totCliques), rotulo: "cliques para o teu site" };

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
          <p className="numero text-2xl" style={{ color: "var(--color-gold)" }}>{destaque.valor}</p>
          <p className="text-[11px] text-cream/70">{destaque.rotulo}</p>
        </div>
        <div className="rounded-xl bg-ink p-4 text-cream">
          <p className="numero text-2xl" style={{ color: "var(--color-gold)" }}>{din(totInvest, moeda)}</p>
          <p className="text-[11px] text-cream/70">investimento (30 d)</p>
        </div>
      </div>

      {anuncios.length > 0 ? (
        <div className="mt-7">
          <div className="rotulo mb-3">
            os teus anúncios ({anuncios.length})
            {aCorrer > 0 ? ` · ${aCorrer} ainda a correr` : ""}
          </div>
          <div className="space-y-4">
            {destacados.map((a) => (
              <CartaoAnuncio key={a.id} a={a} />
            ))}
          </div>

          {restantes.length > 0 ? (
            <details className="mt-4 rounded-xl border border-line bg-cream/60">
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-grey">
                Ver os outros {restantes.length} anúncios já terminados ·{" "}
                {din(investRestantes, moeda)}
              </summary>
              <div className="space-y-4 border-t border-line p-4">
                {restantes.map((a) => (
                  <CartaoAnuncio key={a.id} a={a} />
                ))}
              </div>
            </details>
          ) : null}
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

      {ricos.ok && ricos.truncado ? (
        <p className="mt-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-xs text-gold-dark">
          A tua conta tem tantos anúncios que esta lista ficou pelo limite que conseguimos ler de
          uma vez — há mais anúncios do que os mostrados. Os totais lá em cima continuam certos. 🖐️
        </p>
      ) : null}

      <p className="mt-6 text-[11px] text-soft">
        Fonte: Meta Ads (Instagram + Facebook), últimos 30 dias. «Pessoas alcançadas» são pessoas
        diferentes — quem viu vários anúncios conta uma vez. Google, TikTok e outras redes aparecem
        aqui quando houver campanhas nelas.
      </p>
    </section>
  );
}
