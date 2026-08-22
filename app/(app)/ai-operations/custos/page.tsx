/**
 * Quanto custa a IA de cada marca, por mês.
 *
 * Os tokens estavam registados desde o primeiro dia; ninguém os
 * conseguia ler em dinheiro. Para saber quanto custava o Chef Kool era
 * preciso cruzar duas tabelas à mão — e isso quer dizer que ninguém o
 * fazia, e que uma marca podia estar a custar dez vezes as outras sem
 * que nada o dissesse.
 *
 * MOSTRA-SE EM DÓLARES porque é a moeda em que os fornecedores cobram.
 * Converter para euros a um câmbio inventado por nós daria um número
 * mais familiar e menos verdadeiro.
 */
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Marca = {
  mes: string; marca: string; assistentes: number;
  pedidos: number; tokens: number; usd: number;
};
type Linha = {
  mes: string; assistant_key: string; marca: string | null; fornecedor: string;
  pedidos: number; tokens_entrada: number; tokens_cache: number;
  tokens_saida: number; cache_pct: number | null; usd: number;
};

async function dados() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const [m, l] = await Promise.all([
    sb.from("ai_custo_marca_mensal").select("*").order("mes", { ascending: false }).order("usd", { ascending: false }),
    sb.from("ai_custo_mensal").select("*").order("mes", { ascending: false }).order("usd", { ascending: false }),
  ]);
  return { marcas: (m.data ?? []) as Marca[], linhas: (l.data ?? []) as Linha[], erro: m.error?.message ?? l.error?.message };
}

const usd = (v: number) => "$" + Number(v ?? 0).toFixed(Number(v) >= 1 ? 2 : 3);
const mil = (v: number) => Number(v ?? 0).toLocaleString("pt-PT");
const mesNome = (s: string) =>
  new Date(s + "T00:00:00Z").toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

export default async function CustosPage() {
  const { marcas, linhas, erro } = await dados();

  if (erro) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="rounded-xl border-2 border-bad bg-bad/5 p-5 text-sm">
          Não consegui ler os custos: {erro}
          <br />
          <span className="text-soft">Falta correr a migração 0098?</span>
        </p>
      </div>
    );
  }

  const meses = [...new Set(marcas.map((m) => m.mes))];

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
        const doMes = marcas.filter((m) => m.mes === mes);
        const total = doMes.reduce((s, m) => s + Number(m.usd), 0);
        return (
          <section key={mes} className="rounded-xl border border-line bg-white">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
              <h2 className="font-display text-lg font-extrabold capitalize">{mesNome(mes)}</h2>
              <p className="font-display text-xl font-extrabold tabular-nums">{usd(total)}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-soft">
                    <th className="px-5 py-2 font-bold">Marca</th>
                    <th className="px-3 py-2 text-right font-bold">Assist.</th>
                    <th className="px-3 py-2 text-right font-bold">Pedidos</th>
                    <th className="px-3 py-2 text-right font-bold">Tokens</th>
                    <th className="px-5 py-2 text-right font-bold">Custo</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {doMes.map((m) => (
                    <>
                      <tr key={m.marca} className="border-b border-line/60 bg-paper/40">
                        <td className="px-5 py-2.5 font-bold">{m.marca}</td>
                        <td className="px-3 py-2.5 text-right text-soft">{m.assistentes}</td>
                        <td className="px-3 py-2.5 text-right">{mil(m.pedidos)}</td>
                        <td className="px-3 py-2.5 text-right text-soft">{mil(Math.round(m.tokens / 1000))}k</td>
                        <td className="px-5 py-2.5 text-right font-bold">{usd(m.usd)}</td>
                      </tr>
                      {linhas
                        .filter((l) => l.mes === mes && (l.marca ?? "sem marca") === m.marca)
                        .map((l) => (
                          <tr key={`${m.marca}-${l.assistant_key}-${l.fornecedor}`} className="border-b border-line/40 text-xs">
                            <td className="py-1.5 pl-10 pr-3 text-grey">
                              {l.assistant_key}
                              <span className="ml-2 text-soft">{l.fornecedor}</span>
                            </td>
                            <td />
                            <td className="px-3 py-1.5 text-right text-grey">{mil(l.pedidos)}</td>
                            <td className="px-3 py-1.5 text-right text-soft">
                              {/* O cache é a maior alavanca de poupança que temos: um
                                  prompt grande e estável custa uma fração. Abaixo de
                                  50% num assistente de prompt grande é dinheiro a arder. */}
                              {l.cache_pct != null ? `${l.cache_pct}% cache` : "—"}
                            </td>
                            <td className="px-5 py-1.5 text-right text-grey">{usd(l.usd)}</td>
                          </tr>
                        ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
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
