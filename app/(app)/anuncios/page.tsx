import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { campanhasMeta, anunciosAtivosMeta, metaAdsConfigurado } from "@/lib/ads/meta";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("pt-PT");
const din = (v: number, m: string) =>
  `${v.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} ${m === "EUR" ? "€" : m}`;
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(2)}%`);

export default async function AnunciosOperador() {
  const supabase = await criarClienteServidor();

  if (!metaAdsConfigurado()) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="rotulo">todas as contas, num sítio</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Anúncios</h1>
        <div className="mt-4 rounded-xl border border-line bg-white p-6 text-sm text-grey">
          <p className="font-bold text-ink">Falta o token do Business Manager.</p>
          <p className="mt-2">
            Cria um system user no Business Manager do Nº 5 com <b>ads_read</b> às contas dos
            clientes e põe o token no Netlify como <b>META_ADS_TOKEN</b>. Depois liga a conta de
            cada marca na ficha do cliente (cartão «Na Sede»).
          </p>
        </div>
      </div>
    );
  }

  const { data: orgsRaw } = await supabase
    .from("orgs")
    .select("id, nome, slug, cliente_id, meta_ads_id")
    .not("meta_ads_id", "is", null)
    .order("nome")
    .then((r) => r, () => ({ data: null }));
  const orgs = (orgsRaw ?? []) as {
    id: string;
    nome: string;
    slug: string;
    cliente_id: string | null;
    meta_ads_id: string;
  }[];

  if (orgs.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="rotulo">todas as contas, num sítio</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Anúncios</h1>
        <p className="mt-4 rounded-xl border border-line bg-white p-6 text-sm text-grey">
          Nenhuma marca tem conta de anúncios ligada. Vai à ficha do cliente → cartão «Na Sede» →
          «Anúncios na Sede» e cola o ID da conta Meta.
        </p>
      </div>
    );
  }

  const dados = await Promise.all(
    orgs.map(async (o) => ({
      org: o,
      camp: await campanhasMeta(o.meta_ads_id),
      ads: await anunciosAtivosMeta(o.meta_ads_id),
    })),
  );

  // Totais gerais (só contas que responderam)
  let totInvest = 0,
    totLeads = 0,
    totAtivos = 0;
  for (const d of dados) {
    if (d.camp.ok) {
      totInvest += d.camp.campanhas.reduce((s, c) => s + c.investimento, 0);
      totLeads += d.camp.campanhas.reduce((s, c) => s + c.leads, 0);
    }
    if (d.ads.ok) totAtivos += d.ads.anuncios.length;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="rotulo">todas as contas, num sítio · últimos 30 dias</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Anúncios</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-ink p-5 text-cream">
          <div className="font-display text-3xl font-extrabold text-gold tabular-nums">{totAtivos}</div>
          <div className="mt-1 text-[13px] text-soft">anúncios ativos agora</div>
        </div>
        <div className="rounded-xl bg-ink p-5 text-cream">
          <div className="font-display text-3xl font-extrabold text-gold tabular-nums">{fmt(totLeads)}</div>
          <div className="mt-1 text-[13px] text-soft">contactos (30 d, todas as contas)</div>
        </div>
        <div className="rounded-xl bg-ink p-5 text-cream">
          <div className="font-display text-3xl font-extrabold text-gold tabular-nums">
            {totInvest.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} €*
          </div>
          <div className="mt-1 text-[13px] text-soft">investido (30 d) · *moedas somadas ao par</div>
        </div>
      </div>

      {dados.map(({ org, camp, ads }) => (
        <section key={org.id} className="rounded-xl border border-line bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-extrabold">{org.nome}</h2>
            <span className="flex items-center gap-3 text-xs font-bold">
              {org.cliente_id ? (
                <Link href={`/clientes/${org.cliente_id}`} className="text-grey hover:text-ink">
                  ficha →
                </Link>
              ) : null}
              <a href={`/sede/ver/${org.slug}`} className="text-gold-dark hover:underline">
                👀 ver como o cliente vê →
              </a>
            </span>
          </div>

          {!camp.ok ? (
            <p className="mt-3 text-sm text-soft">Não consegui ler esta conta: {camp.erro}</p>
          ) : (
            <>
              {/* Campanhas (resumo) */}
              <div className="mt-3 flex flex-wrap gap-2">
                {camp.campanhas.map((c) => (
                  <span
                    key={c.id}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                      c.estado === "ACTIVE" ? "bg-good/15 text-good" : "bg-cream text-soft"
                    }`}
                    title={`${fmt(c.alcance)} alcance · ${fmt(c.cliques)} cliques · ${c.leads} contactos`}
                  >
                    {c.nome} · {din(c.investimento, c.moeda)}
                    {c.custo_por_lead ? ` · ${din(c.custo_por_lead, c.moeda)}/contacto` : ""}
                  </span>
                ))}
                {camp.campanhas.length === 0 ? (
                  <span className="text-sm text-soft">Sem campanhas nesta conta.</span>
                ) : null}
              </div>

              {/* Anúncios ativos, ao detalhe */}
              {ads.ok && ads.anuncios.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[38rem] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-grey">
                        <th className="py-1.5 pr-3 font-bold">Anúncio</th>
                        <th className="py-1.5 pr-3 font-bold">Campanha</th>
                        <th className="py-1.5 pr-3 text-right font-bold">Impressões</th>
                        <th className="py-1.5 pr-3 text-right font-bold">Cliques</th>
                        <th className="py-1.5 pr-3 text-right font-bold">CTR</th>
                        <th className="py-1.5 pr-3 text-right font-bold">Gasto</th>
                        <th className="py-1.5 text-right font-bold">Contactos · CPL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ads.anuncios.map((a) => (
                        <tr key={a.id} className="border-b border-line/50">
                          <td className="max-w-[14rem] truncate py-2 pr-3 font-bold">{a.nome}</td>
                          <td className="max-w-[10rem] truncate py-2 pr-3 text-grey">{a.campanha}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{fmt(a.impressoes)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{fmt(a.cliques)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{pct(a.ctr)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {din(a.investimento, camp.moeda)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {a.leads > 0
                              ? `${a.leads} · ${a.custo_por_lead ? din(a.custo_por_lead, camp.moeda) : "—"}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : ads.ok ? (
                <p className="mt-3 text-sm text-soft">Sem anúncios ativos neste momento.</p>
              ) : (
                <p className="mt-3 text-sm text-soft">Anúncios: {ads.erro}</p>
              )}
            </>
          )}
        </section>
      ))}

      <p className="text-[11px] text-soft">
        Fonte: Meta Ads, últimos 30 dias, leitura direta da API (só leitura). Para mostrar ao
        cliente, usa «ver como o cliente vê» — a mesma verdade, com a marca dele.
      </p>
    </div>
  );
}
