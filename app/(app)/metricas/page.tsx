import { criarClienteServidor } from "@/lib/supabase/server";
import { euros } from "@/lib/dominio/metricas";
import { metricasFunil, abandonoPorEtapa } from "@/lib/dominio/metricas-funil";
import { agregarPorServico, calcular, normalizarEscopo, margem, euroHora, type Preco } from "@/lib/dominio/orcamento";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export default async function MetricasPage() {
  const supabase = await criarClienteServidor();

  const [clientesRes, propostasRes, aceitesRes, precosRes] = await Promise.all([
    supabase.from("clientes").select("intake_token, intake_submetido_em, intake_passo, intake_rascunho"),
    supabase.from("propostas").select("estado, setup_valor, avenca_valor, motivo_recusa"),
    supabase.from("propostas").select("escopo").eq("estado", "aceite"),
    supabase
      .from("precos_unitarios")
      .select("chave, rotulo, tipo, unidade, preco, minutos, custo_interno, tempo_planeado_min")
      .neq("estado", "inativo"),
  ]);

  const m = metricasFunil(clientesRes.data ?? [], propostasRes.data ?? []);

  // Rentabilidade por serviço — agrega as linhas de todas as propostas aceites.
  const precos = (precosRes.data ?? []) as Preco[];
  const linhas = ((aceitesRes.data ?? []) as { escopo: unknown }[]).flatMap((p) => {
    const o = calcular(normalizarEscopo(p.escopo), precos);
    return [...o.mensal, ...o.setup];
  });
  const porServico = agregarPorServico(linhas);
  const abandono = abandonoPorEtapa(clientesRes.data ?? []);

  return (
    <div className="space-y-6">
      <div>
        <p className="rotulo">do lead à assinatura</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Funil</h1>
        <p className="mt-1 text-sm text-grey">
          Números honestos, sem causalidade inventada. À medida que houver mais histórico, ficam mais
          ricos.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Kpi valor={String(m.diagnosticosEnviados)} rotulo="diagnósticos enviados" />
        <Kpi valor={String(m.diagnosticosSubmetidos)} rotulo="diagnósticos submetidos" />
        <Kpi valor={pct(m.taxaSubmissao)} rotulo="taxa de conclusão" />
        <Kpi valor={String(m.propostas)} rotulo="propostas geradas" />
        <Kpi valor={String(m.propostasAceites)} rotulo="propostas aceites" />
        <Kpi valor={pct(m.taxaAceitacao)} rotulo="taxa de aceitação" destaque />
        <Kpi valor={m.setupMedio == null ? "—" : euros(Math.round(m.setupMedio))} rotulo="setup médio (aceites)" />
        <Kpi valor={m.mrrMedio == null ? "—" : `${euros(Math.round(m.mrrMedio))}/mês`} rotulo="avença média (aceites)" />
        <Kpi valor={String(m.propostasEnviadas)} rotulo="à espera de decisão" />
      </section>

      {abandono.length > 0 && (
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-1 font-display text-lg font-extrabold">Diagnósticos por concluir</h2>
          <p className="mb-3 text-xs text-soft">Onde os clientes pararam — bom para saber que passo prende.</p>
          <ul className="space-y-1 text-sm">
            {abandono.map((a) => (
              <li key={a.passo} className="flex items-center justify-between">
                <span className="text-grey">Passo {a.passo + 1}</span>
                <b className="tabular-nums">{a.total}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {porServico.length > 0 && (
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-1 font-display text-lg font-extrabold">Rentabilidade por serviço</h2>
          <p className="mb-3 text-xs text-soft">
            Somado das propostas aceites. Interno · o que cada serviço rende de facto.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-grey">
                  <th className="py-2 pr-3 font-bold">Serviço</th>
                  <th className="py-2 px-2 text-right font-bold">Qtd</th>
                  <th className="py-2 px-2 text-right font-bold">Receita</th>
                  <th className="py-2 px-2 text-right font-bold">Preço médio</th>
                  <th className="py-2 px-2 text-right font-bold">Margem</th>
                  <th className="py-2 pl-2 text-right font-bold">€/h</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {porServico.map((s) => {
                  const mg = margem(s.receita, s.custo);
                  const eh = euroHora(s.receita, s.tempoMin);
                  return (
                    <tr key={s.chave} className="border-b border-line/50">
                      <td className="py-2 pr-3">{s.rotulo}</td>
                      <td className="py-2 px-2 text-right">{s.quantidade}</td>
                      <td className="py-2 px-2 text-right font-bold">{euros(s.receita)}</td>
                      <td className="py-2 px-2 text-right text-soft">
                        {s.quantidade > 0 ? euros(Math.round(s.receita / s.quantidade)) : "—"}
                      </td>
                      <td className="py-2 px-2 text-right">{mg == null ? "—" : `${Math.round(mg * 100)}%`}</td>
                      <td className="py-2 pl-2 text-right">{eh == null ? "—" : `${euros(Math.round(eh))}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {m.motivosRecusa.length > 0 && (
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-2 font-display text-lg font-extrabold">Motivos de recusa</h2>
          <ul className="space-y-1 text-sm text-grey">
            {m.motivosRecusa.map((mo, i) => (
              <li key={i}>· {mo}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Kpi({ valor, rotulo, destaque }: { valor: string; rotulo: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${destaque ? "border-gold bg-gold/5" : "border-line bg-white"}`}>
      <p className={`font-display text-2xl font-extrabold tabular-nums ${destaque ? "text-gold-dark" : ""}`}>
        {valor}
      </p>
      <p className="text-[11px] text-grey">{rotulo}</p>
    </div>
  );
}
