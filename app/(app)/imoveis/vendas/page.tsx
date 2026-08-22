/**
 * Vendas reais da Terrae.
 *
 * O ativo próprio: o SIR, o INE e os anúncios estão disponíveis para
 * qualquer concorrente; as escrituras da Terrae não. O motor ancora
 * nelas com até 50% do peso quando o produto é parecido.
 *
 * E cumprem uma obrigação: a cláusula 3 da ficha de subscrição do SIR
 * obriga a facultar mensalmente à IMOESTATÍSTICA os dados das operações
 * de venda. Sai daqui.
 */
import { createClient } from "@supabase/supabase-js";
import { FormularioVenda } from "@/components/crm/FormularioVenda";

export const dynamic = "force-dynamic";

type Linha = {
  id: string; referencia: string | null; tipo: string | null; tipologia: string | null;
  area: number | null; preco_transacao: number; data_transacao: string | null;
  dias_mercado: number | null;
  imo_geografias: { nome: string } | { nome: string }[] | null;
};

async function vendas(): Promise<Linha[]> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data } = await sb
    .from("imo_transacoes")
    .select("id, referencia, tipo, tipologia, area, preco_transacao, data_transacao, " +
            "dias_mercado, imo_geografias(nome)")
    .eq("fonte_id", "terrae")
    .order("data_transacao", { ascending: false })
    .limit(50);
  // Os tipos gerados não conhecem esta relação embebida e inferem um
  // erro onde não há: a consulta corre e devolve `imo_geografias` como
  // objeto. Verificado contra a base, não presumido.
  return (data ?? []) as unknown as Linha[];
}

const eur = (n: number) => n.toLocaleString("pt-PT") + " €";
const nomeZona = (g: Linha["imo_geografias"]) =>
  Array.isArray(g) ? g[0]?.nome ?? "—" : g?.nome ?? "—";

export default async function VendasPage() {
  const lista = await vendas();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="rotulo">o que mais ninguém tem</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Vendas reais</h1>
        <p className="mt-2 max-w-2xl text-sm text-grey">
          Cada venda que fecha e não fica aqui é um dado perdido para sempre. O motor
          ancora nelas — são a única coisa na base que diz o que alguém{" "}
          <b>pagou</b>, e não o que alguém pediu.
        </p>
      </div>

      <FormularioVenda />

      <div className="rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div>
            <p className="text-sm font-bold">Registadas</p>
            <p className="text-xs text-soft">
              {lista.length} · quando fechar uma venda, a cláusula 3 do contrato SIR
              obriga a comunicá-la à IMOESTATÍSTICA nesse mês. Sai daqui.
            </p>
          </div>
          <a
            href="/api/imo/vendas/exportar"
            className="rounded-full border-2 border-line px-4 py-2 text-sm font-bold text-grey transition hover:text-ink"
          >
            ⬇ CSV do mês passado
          </a>
        </div>

        {lista.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-soft">
            Ainda nenhuma. A primeira já muda as avaliações da zona dela.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-soft">
                  <th className="px-5 py-2 font-bold">Imóvel</th>
                  <th className="px-3 py-2 font-bold">Zona</th>
                  <th className="px-3 py-2 text-right font-bold">Área</th>
                  <th className="px-3 py-2 text-right font-bold">Escritura</th>
                  <th className="px-3 py-2 text-right font-bold">€/m²</th>
                  <th className="px-5 py-2 text-right font-bold">Data</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {lista.map((v) => (
                  <tr key={v.id} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-2.5">
                      {[v.tipo, v.tipologia].filter(Boolean).join(" ") || "—"}
                      {v.referencia && (
                        <span className="block text-xs text-soft">{v.referencia}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">{nomeZona(v.imo_geografias)}</td>
                    <td className="px-3 py-2.5 text-right">{v.area ? `${v.area} m²` : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-bold">{eur(v.preco_transacao)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {v.area ? Math.round(v.preco_transacao / v.area).toLocaleString("pt-PT") : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right text-soft">
                      {v.data_transacao ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
