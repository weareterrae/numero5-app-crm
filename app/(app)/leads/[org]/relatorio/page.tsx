import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  formatarDuracao,
  percentagem,
  taxaGanho,
  tempoMedioRespostaMin,
  type Lead,
} from "@/lib/dominio/crm";

export default async function Relatorio({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const supabase = await criarClienteServidor();

  const { data: org } = await supabase.from("orgs").select("id, nome, slug").eq("slug", slug).maybeSingle();
  if (!org) notFound();

  const { data: leadsRaw } = await supabase
    .from("crm_leads")
    .select("origem, fonte_detalhe, resultado, primeira_resposta_at, created_at, arquivado")
    .eq("org_id", org.id)
    .eq("arquivado", false);
  const leads = (leadsRaw ?? []) as Lead[];

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
  const doMes = leads.filter((l) => l.created_at >= inicioMes);

  const tMedio = tempoMedioRespostaMin(leads);
  const conv = taxaGanho(leads);
  const ganhos = leads.filter((l) => l.resultado === "ganho").length;
  const rapidas = leads.filter(
    (l) => l.primeira_resposta_at && (Date.parse(l.primeira_resposta_at) - Date.parse(l.created_at)) / 60000 <= 10,
  ).length;
  const respondidas = leads.filter((l) => l.primeira_resposta_at).length;

  // Por origem
  const porOrigem = new Map<string, number>();
  for (const l of leads) {
    const k = (l.fonte_detalhe || l.origem || "—").toString();
    porOrigem.set(k, (porOrigem.get(k) ?? 0) + 1);
  }
  const origens = [...porOrigem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/leads/${slug}`} className="text-xs font-bold text-soft hover:text-ink">
          ← {org.nome}
        </Link>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Relatório</h1>
        <p className="text-sm text-grey">
          {agora.toLocaleDateString("pt-PT", { month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cartao rotulo="Leads este mês" valor={String(doMes.length)} />
        <Cartao rotulo="Total de leads" valor={String(leads.length)} />
        <Cartao rotulo="Tempo médio de resposta" valor={formatarDuracao(tMedio)} />
        <Cartao rotulo="Conversão" valor={percentagem(conv)} />
        <Cartao rotulo="Ganhas" valor={String(ganhos)} />
        <Cartao rotulo="Respondidas" valor={String(respondidas)} />
        <Cartao
          rotulo="Respondidas < 10 min"
          valor={respondidas ? `${Math.round((rapidas / respondidas) * 100)}%` : "—"}
        />
      </div>

      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-grey">De onde vieram</h2>
        {origens.length === 0 ? (
          <p className="text-sm text-soft">Ainda sem leads.</p>
        ) : (
          <ul className="space-y-2">
            {origens.map(([nome, n]) => {
              const pct = Math.round((n / leads.length) * 100);
              return (
                <li key={nome} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 truncate">{nome}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-cream">
                    <span className="block h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="numero w-14 shrink-0 text-right text-xs">
                    {n} · {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-soft">Uma resposta rápida é o que mais converte. Ligar em menos de 10 minutos faz toda a diferença.</p>
    </div>
  );
}

function Cartao({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-line bg-white/60 p-3">
      <p className="numero text-2xl">{valor}</p>
      <p className="text-[11px] font-bold uppercase tracking-wide text-soft">{rotulo}</p>
    </div>
  );
}
