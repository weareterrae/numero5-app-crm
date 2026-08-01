import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { KanbanLeads } from "@/components/crm/KanbanLeads";
import type { Etapa, Lead } from "@/lib/dominio/crm";

export default async function QuadroOrg({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const supabase = await criarClienteServidor();

  const { data: org } = await supabase
    .from("orgs")
    .select("id, nome, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) notFound();

  const [{ data: etapas }, { data: leads }] = await Promise.all([
    supabase.from("crm_etapas").select("*").eq("org_id", org.id).order("ordem", { ascending: true }),
    supabase
      .from("crm_leads")
      .select("*")
      .eq("org_id", org.id)
      .eq("arquivado", false)
      .order("created_at", { ascending: false }),
  ]);

  const listaEtapas = (etapas ?? []) as Etapa[];
  const listaLeads = (leads ?? []) as Lead[];
  const porResponder = listaLeads.filter((l) => !l.primeira_resposta_at).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/leads" className="text-xs font-bold text-soft hover:text-ink">
            ← Clientes
          </Link>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">{org.nome}</h1>
          <p className="text-sm text-grey">
            <span className="numero">{listaLeads.length}</span> leads
            {porResponder > 0 && (
              <>
                {" · "}
                <span className="font-bold text-bad">{porResponder} por responder</span>
              </>
            )}
          </p>
        </div>
      </div>

      {listaEtapas.length === 0 ? (
        <p className="rounded-xl border border-line bg-white/60 p-6 text-sm text-soft">
          Este cliente ainda não tem funil configurado.
        </p>
      ) : (
        <KanbanLeads org={org.slug} orgId={org.id} etapas={listaEtapas} leads={listaLeads} />
      )}
    </div>
  );
}
