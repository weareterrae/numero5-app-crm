import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServidor } from "@/lib/supabase/server";
import { KanbanLeads } from "@/components/crm/KanbanLeads";
import {
  formatarDuracao,
  percentagem,
  taxaGanho,
  tempoMedioRespostaMin,
  type Etapa,
  type Lead,
} from "@/lib/dominio/crm";

export const dynamic = "force-dynamic";

export default async function SedeLeads() {
  const ctx = await contextoSede();
  const supabase = await criarClienteServidor(); // RLS isola pela org da sessão

  const [{ data: etapas }, { data: leads }] = await Promise.all([
    supabase.from("crm_etapas").select("*").eq("org_id", ctx.org.id).order("ordem", { ascending: true }),
    supabase
      .from("crm_leads")
      .select("*")
      .eq("org_id", ctx.org.id)
      .eq("arquivado", false)
      .order("created_at", { ascending: false }),
  ]);

  const listaEtapas = (etapas ?? []) as Etapa[];
  const listaLeads = (leads ?? []) as Lead[];
  const porResponder = listaLeads.filter((l) => !l.primeira_resposta_at && l.resultado === "aberto").length;
  const tMedio = tempoMedioRespostaMin(listaLeads);
  const conv = taxaGanho(listaLeads);

  return (
    <div className="space-y-5">
      <div>
        <div className="rotulo">as tuas leads</div>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight">Central de Leads</h1>
        <p className="mt-1 text-sm text-grey">
          Os teus contactos, num sítio só. Responde depressa — o cronómetro pinta a vermelho quem
          está à espera.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi rotulo="Leads" valor={String(listaLeads.length)} />
        <Kpi rotulo="Por responder" valor={String(porResponder)} destaque={porResponder > 0} />
        <Kpi rotulo="Tempo médio resposta" valor={formatarDuracao(tMedio)} />
        <Kpi rotulo="Conversão" valor={percentagem(conv)} />
      </div>

      {listaEtapas.length === 0 ? (
        <p className="rounded-xl border border-line bg-white/60 p-6 text-sm text-soft">
          O teu funil ainda está a ser configurado. 🖐️
        </p>
      ) : (
        <KanbanLeads org={ctx.org.slug} orgId={ctx.org.id} etapas={listaEtapas} leads={listaLeads} />
      )}
    </div>
  );
}

function Kpi({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destaque ? "border-bad/40 bg-bad/5" : "border-line bg-white/60"}`}>
      <p className={`numero text-2xl ${destaque ? "text-bad" : ""}`}>{valor}</p>
      <p className="text-[11px] font-bold uppercase tracking-wide text-soft">{rotulo}</p>
    </div>
  );
}
