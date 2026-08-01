import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { haQuantoTempo, nomeLead, urgencia, type Org } from "@/lib/dominio/crm";

type LinhaLead = {
  id: string;
  org_id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  fonte_detalhe: string | null;
  primeira_resposta_at: string | null;
  resultado: "aberto" | "ganho" | "perdido";
  arquivado: boolean;
  created_at: string;
};

const CHIP = {
  ok: "bg-good/10 text-good",
  atencao: "bg-warn/15 text-warn",
  tarde: "bg-bad/10 text-bad",
} as const;

export default async function Leads() {
  const supabase = await criarClienteServidor();

  const [{ data: orgs }, { data: leads }] = await Promise.all([
    supabase.from("orgs").select("id, nome, slug, ativo").eq("ativo", true).order("nome"),
    supabase
      .from("crm_leads")
      .select("id, org_id, nome, telefone, email, fonte_detalhe, primeira_resposta_at, resultado, arquivado, created_at")
      .eq("arquivado", false),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = user
    ? await supabase.from("profiles").select("externo").eq("id", user.id).maybeSingle()
    : { data: null };
  const staff = !perfil?.externo;

  const lista = (orgs ?? []) as Org[];
  const todas = (leads ?? []) as LinhaLead[];
  const nomeOrg = new Map(lista.map((o) => [o.id, o.nome] as const));
  const slugOrg = new Map(lista.map((o) => [o.id, o.slug] as const));

  const porResponder = todas
    .filter((l) => !l.primeira_resposta_at && l.resultado === "aberto")
    .sort((a, b) => a.created_at.localeCompare(b.created_at)); // mais antigo primeiro = mais urgente
  const ganhos = todas.filter((l) => l.resultado === "ganho").length;

  function contagem(orgId: string) {
    const daOrg = todas.filter((l) => l.org_id === orgId);
    return {
      total: daOrg.length,
      porResponder: daOrg.filter((l) => !l.primeira_resposta_at && l.resultado === "aberto").length,
      ganhos: daOrg.filter((l) => l.resultado === "ganho").length,
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Leads dos clientes</h1>
          <p className="text-sm text-grey">Tudo o que entra, de todos os clientes, num sítio só.</p>
        </div>
        {staff && (
          <Link
            href="/leads/novo"
            className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream hover:brightness-110"
          >
            + Novo cliente
          </Link>
        )}
      </div>

      {/* KPIs globais */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi rotulo="Clientes" valor={lista.length} />
        <Kpi rotulo="Leads (abertas)" valor={todas.filter((l) => l.resultado === "aberto").length} />
        <Kpi rotulo="Por responder" valor={porResponder.length} destaque={porResponder.length > 0} />
        <Kpi rotulo="Ganhas" valor={ganhos} />
      </div>

      {/* Precisam de atenção agora — cross-cliente */}
      {porResponder.length > 0 && (
        <section className="rounded-xl border border-line bg-white/60 p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-grey">
            Precisam de resposta ({porResponder.length})
          </h2>
          <ul className="divide-y divide-line">
            {porResponder.slice(0, 20).map((l) => {
              const u = urgencia(l) ?? "ok";
              const slug = slugOrg.get(l.org_id);
              return (
                <li key={l.id} className="flex items-center gap-3 py-2">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${CHIP[u]}`}>
                    {haQuantoTempo(l.created_at)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{nomeLead(l)}</p>
                    <p className="truncate text-[11px] text-soft">
                      {nomeOrg.get(l.org_id) ?? "—"}
                      {l.fonte_detalhe ? ` · ${l.fonte_detalhe}` : ""}
                    </p>
                  </div>
                  {l.telefone && (
                    <a
                      href={`tel:${l.telefone.replace(/[^\d+]/g, "")}`}
                      className="shrink-0 rounded-full bg-gold px-3 py-1 text-[11px] font-bold text-ink hover:brightness-95"
                    >
                      Ligar
                    </a>
                  )}
                  {slug && (
                    <Link href={`/leads/${slug}`} className="shrink-0 text-[11px] font-bold text-soft hover:text-ink">
                      abrir →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Um cartão por cliente */}
      {lista.length === 0 ? (
        <p className="rounded-xl border border-line bg-white/60 p-6 text-sm text-soft">
          Ainda não há clientes com CRM ativo.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((o) => {
            const c = contagem(o.id);
            return (
              <li key={o.id}>
                <Link
                  href={`/leads/${o.slug}`}
                  className="block rounded-xl border border-line bg-white p-4 transition hover:border-gold hover:bg-gold/5"
                >
                  <p className="font-bold">{o.nome}</p>
                  <p className="mt-1 text-sm text-grey">
                    <span className="numero">{c.total}</span> leads
                    {c.ganhos > 0 && <span className="text-good"> · {c.ganhos} ganhas</span>}
                    {c.porResponder > 0 && (
                      <span className="font-bold text-bad"> · {c.porResponder} por responder</span>
                    )}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Kpi({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destaque ? "border-bad/40 bg-bad/5" : "border-line bg-white/60"}`}>
      <p className={`numero text-2xl ${destaque ? "text-bad" : ""}`}>{valor}</p>
      <p className="text-[11px] font-bold uppercase tracking-wide text-soft">{rotulo}</p>
    </div>
  );
}
