import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  adicionarEtapa,
  apagarEtapa,
  guardarAlertas,
  guardarEtapa,
} from "@/app/(app)/leads/[org]/definicoes/acoes";
import type { Etapa } from "@/lib/dominio/crm";

const TIPOS = [
  { v: "aberto", label: "Aberto (em jogo)" },
  { v: "ganho", label: "Ganho" },
  { v: "perdido", label: "Perdido" },
];

export default async function Definicoes({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const supabase = await criarClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("profiles").select("externo").eq("id", user.id).maybeSingle();
  if (perfil?.externo) redirect("/leads");

  // select("*") é tolerante: se a migração 0047 (alerta_*) ainda não correu,
  // as colunas simplesmente não vêm — a página carrega na mesma.
  const { data: org } = await supabase.from("orgs").select("*").eq("slug", slug).maybeSingle();
  if (!org) notFound();

  const [{ data: etapas }, { data: leads }] = await Promise.all([
    supabase.from("crm_etapas").select("*").eq("org_id", org.id).order("ordem"),
    supabase.from("crm_leads").select("etapa_id").eq("org_id", org.id),
  ]);
  const lista = (etapas ?? []) as Etapa[];
  const contaPorEtapa = new Map<string, number>();
  for (const l of (leads ?? []) as { etapa_id: string | null }[]) {
    if (l.etapa_id) contaPorEtapa.set(l.etapa_id, (contaPorEtapa.get(l.etapa_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/leads/${slug}`} className="text-xs font-bold text-soft hover:text-ink">
          ← {org.nome}
        </Link>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Definições</h1>
      </div>

      {/* Alertas */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-grey">
          Alerta de leads por responder
        </h2>
        <form action={guardarAlertas} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="org" value={slug} />
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-[11px] font-bold text-soft">Email de alerta</label>
            <input
              name="alerta_email"
              type="email"
              defaultValue={org.alerta_email ?? ""}
              placeholder="para quem enviar o aviso"
              className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm"
            />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-[11px] font-bold text-soft">A partir de (min)</label>
            <input
              name="alerta_minutos"
              type="number"
              min={5}
              defaultValue={org.alerta_minutos ?? 30}
              className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm"
            />
          </div>
          <button className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-cream" type="submit">
            Guardar
          </button>
        </form>
      </section>

      {/* Etapas do funil */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-grey">Etapas do funil</h2>
        <div className="space-y-2">
          {lista.map((e) => {
            const n = contaPorEtapa.get(e.id) ?? 0;
            return (
              <div key={e.id} className="rounded-lg border border-line p-2.5">
                <form action={guardarEtapa} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="org" value={slug} />
                  <input type="hidden" name="etapa" value={e.id} />
                  <input
                    name="ordem"
                    type="number"
                    defaultValue={e.ordem}
                    className="w-14 rounded border border-line bg-cream px-2 py-1.5 text-sm"
                    aria-label="Ordem"
                  />
                  <input
                    name="titulo"
                    defaultValue={e.titulo}
                    className="min-w-[140px] flex-1 rounded border border-line bg-cream px-2 py-1.5 text-sm font-bold"
                    aria-label="Título da etapa"
                  />
                  <select
                    name="tipo"
                    defaultValue={e.tipo}
                    className="rounded border border-line bg-cream px-2 py-1.5 text-sm"
                    aria-label="Tipo"
                  >
                    {TIPOS.map((tp) => (
                      <option key={tp.v} value={tp.v}>
                        {tp.label}
                      </option>
                    ))}
                  </select>
                  <button className="rounded bg-ink px-3 py-1.5 text-xs font-bold text-cream" type="submit">
                    Guardar
                  </button>
                </form>
                <div className="mt-1 flex items-center justify-between px-1">
                  <span className="text-[11px] text-soft">{n} lead(s) nesta etapa</span>
                  {n === 0 ? (
                    <form action={apagarEtapa}>
                      <input type="hidden" name="org" value={slug} />
                      <input type="hidden" name="etapa" value={e.id} />
                      <button className="text-[11px] font-bold text-bad hover:underline" type="submit">
                        apagar
                      </button>
                    </form>
                  ) : (
                    <span className="text-[11px] text-soft">move as leads para apagar</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Nova etapa */}
        <form action={adicionarEtapa} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <input type="hidden" name="org" value={slug} />
          <div className="min-w-[160px] flex-1">
            <label className="mb-1 block text-[11px] font-bold text-soft">Nova etapa</label>
            <input
              name="titulo"
              required
              placeholder="Ex.: Visita marcada"
              className="w-full rounded border border-line bg-cream px-2 py-1.5 text-sm"
            />
          </div>
          <select name="tipo" defaultValue="aberto" className="rounded border border-line bg-cream px-2 py-1.5 text-sm">
            {TIPOS.map((tp) => (
              <option key={tp.v} value={tp.v}>
                {tp.label}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-ink" type="submit">
            + Adicionar
          </button>
        </form>
      </section>
    </div>
  );
}
