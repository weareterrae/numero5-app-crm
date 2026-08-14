import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterCliente } from "@/lib/db/clientes";
import { ESTADO_LABEL } from "@/lib/dominio/funil";

export const dynamic = "force-dynamic";

const dt = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const rotulo = (e: string | null | undefined) =>
  e ? (ESTADO_LABEL[e as keyof typeof ESTADO_LABEL] ?? e) : "início";

export default async function HistoricoCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cliente = await obterCliente(id);
  if (!cliente) notFound();
  const supabase = await criarClienteServidor();

  // Alterações de preço vivem na auditoria por registo (proposta), não por cliente:
  // primeiro descobrimos as propostas da ficha, depois a auditoria dessas propostas.
  const { data: props } = await supabase.from("propostas").select("id").eq("cliente_id", id);
  const propIds = (props ?? []).map((p) => p.id as string);

  const [transRes, audRes] = await Promise.all([
    supabase
      .from("estado_historico")
      .select("de_estado, para_estado, motivo, created_at")
      .eq("cliente_id", id)
      .order("created_at", { ascending: false }),
    propIds.length
      ? supabase
          .from("auditoria")
          .select("campo, valor_anterior, valor_novo, motivo, created_at")
          .eq("tabela", "propostas")
          .in("registo_id", propIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  type Evento = { quando: string; tipo: "estado" | "preco"; titulo: string; detalhe?: string };
  const eventos: Evento[] = [];
  for (const t of (transRes.data ?? []) as {
    de_estado: string | null;
    para_estado: string;
    motivo: string | null;
    created_at: string;
  }[]) {
    eventos.push({
      quando: t.created_at,
      tipo: "estado",
      titulo: `${rotulo(t.de_estado)} → ${rotulo(t.para_estado)}`,
      detalhe: t.motivo ?? undefined,
    });
  }
  for (const a of ((audRes as { data?: unknown[] }).data ?? []) as {
    campo: string | null;
    valor_anterior: string | null;
    valor_novo: string | null;
    motivo: string | null;
    created_at: string;
  }[]) {
    eventos.push({
      quando: a.created_at,
      tipo: "preco",
      titulo: `${a.campo ?? "alteração"}: ${a.valor_anterior ?? "—"} → ${a.valor_novo ?? "—"}`,
      detalhe: a.motivo ?? undefined,
    });
  }
  eventos.sort((a, b) => b.quando.localeCompare(a.quando));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href={`/clientes/${id}`} className="rotulo transition hover:text-ink">
          ← {cliente.nome_marca}
        </Link>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Histórico</h1>
        <p className="mt-1 text-sm text-grey">
          Transições do funil e alterações de preço — a memória imutável da ficha.
        </p>
      </div>

      {eventos.length === 0 ? (
        <p className="rounded-2xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Ainda não há histórico registado.
        </p>
      ) : (
        <ol className="relative space-y-4 border-l border-line pl-6">
          {eventos.map((e, i) => (
            <li key={i} className="relative">
              <span
                className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-cream ${
                  e.tipo === "preco" ? "bg-gold" : "bg-cobalt"
                }`}
              />
              <div className="rounded-xl border border-line bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold">{e.titulo}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      e.tipo === "preco" ? "bg-gold/10 text-gold-dark" : "bg-cobalt/10 text-cobalt"
                    }`}
                  >
                    {e.tipo === "preco" ? "preço" : "estado"}
                  </span>
                </div>
                {e.detalhe ? <p className="mt-0.5 text-xs text-grey">{e.detalhe}</p> : null}
                <p className="mt-1 font-mono text-[11px] text-soft">{dt(e.quando)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
