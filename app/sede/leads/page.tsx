import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServidor } from "@/lib/supabase/server";
import { KanbanLeads } from "@/components/crm/KanbanLeads";
import { BotaoCopiar } from "@/components/sede/BotaoCopiar";
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

  const [{ data: etapas }, { data: leads }, { data: cap }] = await Promise.all([
    supabase.from("crm_etapas").select("*").eq("org_id", ctx.org.id).order("ordem", { ascending: true }),
    supabase
      .from("crm_leads")
      .select("*")
      .eq("org_id", ctx.org.id)
      .eq("arquivado", false)
      .order("created_at", { ascending: false }),
    // Token de captação (0058) — tolerante: se a migração não correu, o cartão não aparece.
    supabase.from("orgs").select("captura_token").eq("id", ctx.org.id).maybeSingle(),
  ]);
  const capturaUrl = (cap as { captura_token?: string | null } | null)?.captura_token
    ? `https://app.numerocinco.pt/c/${(cap as { captura_token: string }).captura_token}`
    : null;

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

      {capturaUrl ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">📥 O teu link de captação</p>
            <p className="mt-0.5 text-xs text-grey">
              Partilha-o (bio, QR, site) — cada contacto cai aqui, direto nas tuas leads.
            </p>
            <p className="mt-1 truncate font-mono text-[11px] text-soft">{capturaUrl}</p>
          </div>
          <a
            href={capturaUrl}
            target="_blank"
            rel="noopener"
            className="shrink-0 rounded-full border border-line px-4 py-2 text-xs font-bold text-grey hover:bg-cream"
          >
            ver ↗
          </a>
          <BotaoCopiar texto={capturaUrl} />
        </div>
      ) : null}

      {listaEtapas.length === 0 ? (
        <p className="rounded-xl border border-line bg-white/60 p-6 text-sm text-soft">
          O teu funil ainda está a ser configurado. 🖐️
        </p>
      ) : (
        <KanbanLeads org={ctx.org.slug} orgId={ctx.org.id} etapas={listaEtapas} leads={listaLeads} leadBase="/sede/leads" />
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
