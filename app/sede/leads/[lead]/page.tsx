import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { contextoSede } from "@/lib/sede/contexto";
import { moverLeadSede, registarRespostaSede, adicionarNotaSede } from "./acoes";
import {
  ATIVIDADE_ICON,
  haQuantoTempo,
  nomeLead,
  type Atividade,
  type Etapa,
  type Lead,
} from "@/lib/dominio/crm";

export const dynamic = "force-dynamic";

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-soft">{rotulo}</dt>
      <dd className="text-right font-medium">{valor}</dd>
    </div>
  );
}

export default async function SedeFichaLead({ params }: { params: Promise<{ lead: string }> }) {
  const { lead: leadId } = await params;
  const ctx = await contextoSede();
  const supabase = await criarClienteServidor();

  const { data: leadRow } = await supabase
    .from("crm_leads")
    .select("*")
    .eq("id", leadId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!leadRow) notFound();
  const lead = leadRow as Lead;

  const [{ data: etapas }, { data: atividades }] = await Promise.all([
    supabase.from("crm_etapas").select("*").eq("org_id", ctx.org.id).order("ordem"),
    supabase.from("crm_atividades").select("*").eq("lead_id", leadId).order("data", { ascending: false }),
  ]);
  const listaEtapas = (etapas ?? []) as Etapa[];
  const historico = (atividades ?? []) as Atividade[];
  const campos = Object.entries(lead.campos ?? {}).filter(([, v]) => v != null && v !== "");

  const tel = lead.telefone?.replace(/[^\d+]/g, "") || "";
  const wa = lead.telefone?.replace(/[^\d]/g, "") || "";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/sede/leads" className="text-xs font-bold text-soft hover:text-ink">
          ← as tuas leads
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

      {/* Canais + marcar respondida */}
      <div className="flex flex-wrap items-center gap-2">
        {tel ? (
          <a href={`tel:${tel}`} className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-ink hover:brightness-105">
            📞 Ligar
          </a>
        ) : null}
        {wa ? (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener" className="rounded-full border border-line px-4 py-2 text-sm font-bold text-ink hover:bg-cream">
            💬 WhatsApp
          </a>
        ) : null}
        {lead.email ? (
          <a href={`mailto:${lead.email}`} className="rounded-full border border-line px-4 py-2 text-sm font-bold text-ink hover:bg-cream">
            ✉️ Email
          </a>
        ) : null}
        {!lead.primeira_resposta_at ? (
          <form action={registarRespostaSede} className="ml-auto">
            <input type="hidden" name="lead" value={lead.id} />
            <button type="submit" className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream hover:brightness-110">
              ✓ Marcar como respondida
            </button>
          </form>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
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
                <h2 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-grey">Respostas</h2>
                <dl className="space-y-1 text-sm">
                  {campos.map(([k, v]) => (
                    <Linha key={k} rotulo={k.replace(/_/g, " ")} valor={String(v)} />
                  ))}
                </dl>
              </>
            )}
          </section>

          {listaEtapas.length > 0 ? (
            <section className="rounded-xl border border-line bg-white p-4">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-grey">Etapa</h2>
              <form action={moverLeadSede} className="flex gap-2">
                <input type="hidden" name="lead" value={lead.id} />
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
          ) : null}
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-line bg-white p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-grey">Nova nota</h2>
            <form action={adicionarNotaSede} className="space-y-2">
              <input type="hidden" name="lead" value={lead.id} />
              <textarea
                name="descricao"
                required
                rows={2}
                placeholder="O que aconteceu? (ex.: falei, marcámos visita para 5.ª)"
                className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-grey">Lembrar-me em</label>
                <input type="date" name="followup" className="rounded-lg border border-line bg-cream px-2 py-1 text-sm" />
                <button className="ml-auto rounded-lg bg-gold px-3 py-2 text-sm font-bold text-ink" type="submit">
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
