import { criarClienteServidor } from "@/lib/supabase/server";
import { euros } from "@/lib/dominio/metricas";
import { metricasFunil } from "@/lib/dominio/metricas-funil";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export default async function MetricasPage() {
  const supabase = await criarClienteServidor();

  const [clientesRes, propostasRes] = await Promise.all([
    supabase.from("clientes").select("intake_token, intake_submetido_em"),
    supabase.from("propostas").select("estado, setup_valor, avenca_valor, motivo_recusa"),
  ]);

  const m = metricasFunil(clientesRes.data ?? [], propostasRes.data ?? []);

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
