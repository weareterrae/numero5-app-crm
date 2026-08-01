import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AccoesContacto } from "@/components/crm/AccoesContacto";
import { moverLead, adicionarNota } from "@/app/(app)/leads/[org]/acoes";
import {
  ATIVIDADE_ICON,
  haQuantoTempo,
  nomeLead,
  type Atividade,
  type Etapa,
  type Lead,
} from "@/lib/dominio/crm";

export default async function FichaLead({
  params,
}: {
  params: Promise<{ org: string; lead: string }>;
}) {
  const { org: slug, lead: leadId } = await params;
  const supabase = await criarClienteServidor();

  const { data: org } = await supabase
    .from("orgs")
    .select("id, nome, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) notFound();

  const { data: leadRow } = await supabase
    .from("crm_leads")
    .select("*")
    .eq("id", leadId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!leadRow) notFound();
  const lead = leadRow as Lead;

  const [{ data: etapas }, { data: atividades }] = await Promise.all([
    supabase.from("crm_etapas").select("*").eq("org_id", org.id).order("ordem"),
    supabase
      .from("crm_atividades")
      .select("*")
      .eq("lead_id", leadId)
      .order("data", { ascending: false }),
  ]);

  const listaEtapas = (etapas ?? []) as Etapa[];
  const historico = (atividades ?? []) as Atividade[];
  const campos = Object.entries(lead.campos ?? {}).filter(([, v]) => v != null && v !== "");

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/leads/${slug}`} className="text-xs font-bold text-soft hover:text-ink">
          ← {org.nome}
        </Link>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">{nomeLead(lead)}</h1>
        <p className="text-sm text-grey">
          {lead.primeira_resposta_at ? (
            <span className="text-good">respondida</span>
          ) : (
            <span className="font-bold text-bad">por responder · entrou {haQuantoTempo(lead.created_at)}</span>
          )}
          {lead.fonte_detalhe ? ` · ${lead.fonte_detalhe}` : ""}
        </p>
      </div>

      {/* Canais de contacto */}
      <AccoesContacto lead={lead} orgId={org.id} orgNome={org.nome} slug={slug} />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* Coluna esquerda: dados + etapa */}
        <div className="space-y-4">
          <section className="rounded-xl border border-line bg-white p-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-grey">Contacto</h2>
            <dl className="space-y-1 text-sm">
              <Linha rotulo="Telefone" valor={lead.telefone} />
              <Linha rotulo="Email" valor={lead.email} />
              <Linha rotulo="Origem" valor={lead.origem} />
            </dl>
            {campos.length > 0 && (
              <>
                <h2 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-grey">
                  Respostas
                </h2>
                <dl className="space-y-1 text-sm">
                  {campos.map(([k, v]) => (
                    <Linha key={k} rotulo={k.replace(/_/g, " ")} valor={String(v)} />
                  ))}
                </dl>
              </>
            )}
          </section>

          <section className="rounded-xl border border-line bg-white p-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-grey">Etapa</h2>
            <form action={moverLead} className="flex gap-2">
              <input type="hidden" name="lead" value={lead.id} />
              <input type="hidden" name="org" value={slug} />
              <select
                name="etapa"
                defaultValue={lead.etapa_id ?? ""}
                className="flex-1 rounded-lg border border-line bg-cream px-2.5 py-2 text-sm"
              >
                {listaEtapas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.titulo}
                  </option>
                ))}
              </select>
              <button className="rounded-lg bg-ink px-3 py-2 text-sm font-bold text-cream" type="submit">
                Mover
              </button>
            </form>
          </section>
        </div>

        {/* Coluna direita: timeline + nova nota */}
        <div className="space-y-4">
          <section className="rounded-xl border border-line bg-white p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-grey">Nova nota</h2>
            <form action={adicionarNota} className="space-y-2">
              <input type="hidden" name="lead" value={lead.id} />
              <input type="hidden" name="orgId" value={org.id} />
              <input type="hidden" name="org" value={slug} />
              <textarea
                name="descricao"
                required
                rows={2}
                placeholder="O que aconteceu? (ex.: falei com a mãe, marcámos visita)"
                className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-grey">Lembrar-me em</label>
                <input
                  type="date"
                  name="followup"
                  className="rounded-lg border border-line bg-cream px-2 py-1 text-sm"
                />
                <button
                  className="ml-auto rounded-lg bg-gold px-3 py-2 text-sm font-bold text-ink"
                  type="submit"
                >
                  Guardar
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-line bg-white/60 p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-grey">Histórico</h2>
            {historico.length === 0 ? (
              <p className="text-sm text-soft">Ainda sem atividade. Faz o primeiro contacto acima.</p>
            ) : (
              <ul className="space-y-3">
                {historico.map((a) => (
                  <li key={a.id} className="flex gap-2.5 text-sm">
                    <span aria-hidden>{ATIVIDADE_ICON[a.tipo] ?? "•"}</span>
                    <div className="min-w-0">
                      <p>{a.descricao}</p>
                      <p className="text-[11px] text-soft">
                        {haQuantoTempo(a.data)}
                        {a.followup_em && !a.concluido ? ` · lembrete ${a.followup_em}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-soft">{rotulo}</dt>
      <dd className="text-right font-medium capitalize">{valor}</dd>
    </div>
  );
}
