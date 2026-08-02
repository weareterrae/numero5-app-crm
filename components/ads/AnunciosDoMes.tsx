import { resumoAnunciosMes } from "@/lib/ads/meta";
import { mesLegivel } from "@/lib/dominio/producao";

const fmt = (n: number) => n.toLocaleString("pt-PT");
const din = (v: number, m: string) =>
  `${v.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} ${m === "EUR" ? "€" : m}`;

/**
 * Bloco «Os teus anúncios em <mês>» para anexar ao relatório mensal.
 * Puxa os resultados da Meta para o mês exato do relatório (não «últimos 30
 * dias»). Não renderiza nada se não houver conta ligada ou entrega no mês.
 * `mesISO` = primeiro dia do mês (ex.: "2026-07-01").
 */
export async function AnunciosDoMes({ contaId, mesISO }: { contaId: string | null; mesISO: string }) {
  if (!contaId) return null;
  const d = new Date(mesISO);
  const since = mesISO.slice(0, 10);
  const until = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  const r = await resumoAnunciosMes(contaId, since, until);
  if (!r.ok || r.resumo.investimento <= 0) return null;

  const { moeda, investimento, alcance, cliques, leads, campanhas } = r.resumo;
  const comEntrega = campanhas.filter((c) => c.investimento > 0);

  return (
    <section className="mt-6 rounded-2xl border border-line bg-white p-6">
      <div className="rotulo">os anúncios em {mesLegivel(mesISO, "pt")}</div>
      <h2 className="mt-1 font-display text-xl font-extrabold">O que a publicidade fez este mês</h2>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-cream/60 p-3">
          <p className="numero text-xl">{fmt(alcance)}</p>
          <p className="text-[11px] text-grey">pessoas alcançadas</p>
        </div>
        <div className="rounded-xl bg-cream/60 p-3">
          <p className="numero text-xl">{fmt(cliques)}</p>
          <p className="text-[11px] text-grey">cliques</p>
        </div>
        <div className="rounded-xl bg-cream/60 p-3">
          <p className="numero text-xl">{leads > 0 ? fmt(leads) : "—"}</p>
          <p className="text-[11px] text-grey">contactos gerados</p>
        </div>
        <div className="rounded-xl bg-cream/60 p-3">
          <p className="numero text-xl">{din(investimento, moeda)}</p>
          <p className="text-[11px] text-grey">investimento</p>
        </div>
      </div>

      {comEntrega.length > 0 ? (
        <ul className="mt-4 divide-y divide-line/60">
          {comEntrega.map((c) => (
            <li key={c.nome} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-bold">{c.nome}</span>
              <span className="text-grey">{fmt(c.alcance)} alcance</span>
              <span className="text-grey">{fmt(c.cliques)} cliques</span>
              {c.leads > 0 ? (
                <span className="font-bold text-good">
                  {c.leads} contactos{c.cpl ? ` · ${din(c.cpl, moeda)}` : ""}
                </span>
              ) : null}
              <span className="numero w-20 text-right">{din(c.investimento, moeda)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-[11px] text-soft">
        Fonte: Meta Ads, {mesLegivel(mesISO, "pt")}. Vê cada anúncio ao detalhe no separador «Anúncios». 🖐️
      </p>
    </section>
  );
}
