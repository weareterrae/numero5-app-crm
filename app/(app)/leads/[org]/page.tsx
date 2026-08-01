import Link from "next/link";
import { notFound } from "next/navigation";
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

export default async function QuadroOrg({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const supabase = await criarClienteServidor();

  const { data: org } = await supabase
    .from("orgs")
    .select("id, nome, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) notFound();

  const [{ data: etapas }, { data: leads }, { data: tokens }] = await Promise.all([
    supabase.from("crm_etapas").select("*").eq("org_id", org.id).order("ordem", { ascending: true }),
    supabase
      .from("crm_leads")
      .select("*")
      .eq("org_id", org.id)
      .eq("arquivado", false)
      .order("created_at", { ascending: false }),
    supabase.from("org_tokens").select("token, nome").eq("org_id", org.id).limit(1), // RLS: só staff
  ]);

  const listaEtapas = (etapas ?? []) as Etapa[];
  const listaLeads = (leads ?? []) as Lead[];
  const porResponder = listaLeads.filter((l) => !l.primeira_resposta_at && l.resultado === "aberto").length;
  const tMedio = tempoMedioRespostaMin(listaLeads);
  const conv = taxaGanho(listaLeads);
  const token = tokens && tokens[0] ? (tokens[0].token as string) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/leads" className="text-xs font-bold text-soft hover:text-ink">
            ← Clientes
          </Link>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">{org.nome}</h1>
        </div>
      </div>

      {/* Métricas do cliente */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi rotulo="Leads" valor={String(listaLeads.length)} />
        <Kpi rotulo="Por responder" valor={String(porResponder)} destaque={porResponder > 0} />
        <Kpi rotulo="Tempo médio resposta" valor={formatarDuracao(tMedio)} />
        <Kpi rotulo="Conversão" valor={percentagem(conv)} />
      </div>

      {listaEtapas.length === 0 ? (
        <p className="rounded-xl border border-line bg-white/60 p-6 text-sm text-soft">
          Este cliente ainda não tem funil configurado.
        </p>
      ) : (
        <KanbanLeads org={org.slug} orgId={org.id} etapas={listaEtapas} leads={listaLeads} />
      )}

      {/* Token de integração — só a equipa do Nº 5 vê (RLS) */}
      {token && (
        <details className="rounded-xl border border-line bg-white/60 p-3 text-sm">
          <summary className="cursor-pointer font-bold text-grey">Token de entrada de leads (Make)</summary>
          <p className="mt-2 break-all font-mono text-[12px] text-ink">{token}</p>
          <p className="mt-1 text-[11px] text-soft">
            Cola no módulo HTTP do Make → POST para <code>/api/leads/ingest</code>.
          </p>
        </details>
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
