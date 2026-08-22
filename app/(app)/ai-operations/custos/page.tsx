/**
 * Quanto custa a IA de cada marca, por mês, e por onde entrou.
 *
 * Os tokens estavam registados desde o primeiro dia; ninguém os
 * conseguia ler em dinheiro. Para saber quanto custava o Chef Kool era
 * preciso cruzar duas tabelas à mão — e isso quer dizer que ninguém o
 * fazia, e que uma marca podia custar dez vezes as outras sem nada o
 * dizer.
 *
 * TRÊS NÚMEROS, POR ESTA ORDEM
 *
 *   o total da marca      o que se paga
 *   site vs redes         onde se paga
 *   variação e €/conversa o que fazer com isso
 *
 * Um total isolado não leva a decisão nenhuma: $3 é muito ou pouco
 * conforme o mês passado e conforme quantas conversas houve. Por isso o
 * total nunca aparece sozinho.
 *
 * EM DÓLARES porque é a moeda em que os fornecedores cobram. Converter a
 * um câmbio inventado por nós daria um número mais familiar e menos
 * verdadeiro.
 */
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Resumo = {
  mes: string; marca: string;
  usd_site: number; usd_social: number; usd_total: number;
  pedidos_site: number; pedidos_social: number; pedidos: number;
  usd_por_pedido: number | null;
  usd_mes_anterior: number | null; variacao_pct: number | null;
};
type Detalhe = {
  mes: string; assistant_key: string; marca: string | null; fornecedor: string;
  pedidos: number; cache_pct: number | null; usd: number;
};

async function dados() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const [r, d] = await Promise.all([
    sb.from("ai_resumo_mensal_marca").select("*").order("mes", { ascending: false }).order("usd_total", { ascending: false }),
    sb.from("ai_custo_mensal").select("*").order("usd", { ascending: false }),
  ]);
  return {
    resumo: (r.data ?? []) as Resumo[],
    detalhe: (d.data ?? []) as Detalhe[],
    erro: r.error?.message ?? d.error?.message,
  };
}

const usd = (v: number | null) =>
  v == null ? "—" : "$" + Number(v).toFixed(Number(v) >= 1 ? 2 : 3);
const mil = (v: number) => Number(v ?? 0).toLocaleString("pt-PT");
const mesNome = (s: string) =>
  new Date(s + "T00:00:00Z").toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

/** A variação face ao mês anterior. Sem mês anterior, não se inventa. */
function Variacao({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-soft">1.º mês</span>;
  if (Math.abs(pct) < 5) return <span className="text-soft">estável</span>;
  const sobe = pct > 0;
  return (
    <span className={sobe ? "font-bold text-bad" : "font-bold text-good"}>
      {sobe ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export default async function CustosPage() {
  const { resumo, detalhe, erro } = await dados();

  if (erro) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="rounded-xl border-2 border-bad bg-bad/5 p-5 text-sm">
          Não consegui ler os custos: {erro}
          <br />
          <span className="text-soft">Falta correr as migrações 0098 e 0100?</span>
        </p>
      </div>
    );
  }

  const meses = [...new Set(resumo.map((r) => r.mes))];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="rotulo">o que a IA custa</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Custos por marca</h1>
        </div>
        <Link href="/ai-operations" className="text-sm font-bold text-grey underline hover:text-ink">
          ← AI Operations
        </Link>
      </div>

      {meses.length === 0 && (
        <p className="rounded-xl border border-line bg-white p-8 text-center text-sm text-soft">
          Ainda sem pedidos registados.
        </p>
      )}

      {meses.map((mes) => {
        const doMes = resumo.filter((r) => r.mes === mes);
        const total = doMes.reduce((s, r) => s + Number(r.usd_total), 0);
        const site = doMes.reduce((s, r) => s + Number(r.usd_site), 0);
        const social = doMes.reduce((s, r) => s + Number(r.usd_social), 0);

        return (
          <section key={mes} className="rounded-xl border border-line bg-white">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-3">
              <h2 className="font-display text-lg font-extrabold capitalize">{mesNome(mes)}</h2>
              <div className="flex items-baseline gap-4 text-sm tabular-nums">
                <span className="text-soft">site {usd(site)}</span>
                <span className="text-soft">redes {usd(social)}</span>
                <span className="font-display text-xl font-extrabold">{usd(total)}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-soft">
                    <th className="px-5 py-2 font-bold">Marca</th>
                    <th className="px-3 py-2 text-right font-bold">Site e app</th>
                    <th className="px-3 py-2 text-right font-bold">IG / FB</th>
                    <th className="px-3 py-2 text-right font-bold">Conversas</th>
                    <th className="px-3 py-2 text-right font-bold">Por conversa</th>
                    <th className="px-3 py-2 text-right font-bold">vs mês ant.</th>
                    <th className="px-5 py-2 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {doMes.map((r) => (
                    <tr key={r.marca} className="border-b border-line/60">
                      <td className="px-5 py-2.5 font-bold">{r.marca}</td>
                      <td className="px-3 py-2.5 text-right">
                        {usd(r.usd_site)}
                        <span className="ml-1 text-xs text-soft">{mil(r.pedidos_site)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {Number(r.usd_social) > 0 ? (
                          <>
                            {usd(r.usd_social)}
                            <span className="ml-1 text-xs text-soft">{mil(r.pedidos_social)}</span>
                          </>
                        ) : (
                          <span className="text-soft">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-soft">{mil(r.pedidos)}</td>
                      {/* O custo médio por conversa é o que se compara entre
                          marcas: um total alto com muitas conversas é uso;
                          um total alto com poucas é desperdício. */}
                      <td className="px-3 py-2.5 text-right text-grey">
                        {r.usd_por_pedido != null ? "$" + Number(r.usd_por_pedido).toFixed(4) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs">
                        <Variacao pct={r.variacao_pct} />
                      </td>
                      <td className="px-5 py-2.5 text-right font-bold">{usd(r.usd_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* O detalhe por assistente fica recolhido: quem abre esta página
                quer o número da marca. O detalhe é para quando esse número
                surpreende. */}
            <details className="border-t border-line">
              <summary className="cursor-pointer px-5 py-2.5 text-xs font-bold text-grey hover:text-ink">
                ver por assistente
              </summary>
              <table className="w-full text-xs">
                <tbody className="tabular-nums">
                  {detalhe.filter((d) => d.mes === mes).map((d) => (
                    <tr key={`${d.assistant_key}-${d.fornecedor}`} className="border-t border-line/40">
                      <td className="py-1.5 pl-8 pr-3 text-grey">{d.assistant_key}</td>
                      <td className="px-3 py-1.5 text-soft">{d.marca}</td>
                      <td className="px-3 py-1.5 text-soft">{d.fornecedor}</td>
                      <td className="px-3 py-1.5 text-right text-grey">{mil(d.pedidos)}</td>
                      {/* O cache é a maior alavanca de poupança: um prompt
                          grande e estável custa uma fração. Abaixo de 50%
                          num prompt grande é dinheiro a arder. */}
                      <td className="px-3 py-1.5 text-right text-soft">
                        {d.cache_pct != null ? `${d.cache_pct}% cache` : "—"}
                      </td>
                      <td className="px-5 py-1.5 text-right text-grey">{usd(d.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
        );
      })}

      <p className="max-w-2xl text-xs text-soft">
        Aos preços correntes de cada modelo — um pedido antigo é reavaliado ao preço de
        hoje, que é o que interessa para decidir. Só o que passa pelo gateway: se um site
        falar com um fornecedor por fora, não aparece aqui.
      </p>
    </div>
  );
}
