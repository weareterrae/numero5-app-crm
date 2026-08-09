import type { Metadata } from "next";
import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerQuadroProducao, type LinhaQuadro, type MesQuadro, type Semaforo } from "@/lib/producao/quadro";
import { alternarPlanoMensal, alternarAgendado } from "./acoes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Produção · Nº 5" };

const PONTO: Record<Semaforo, string> = {
  vermelho: "bg-bad",
  ambar: "bg-warn",
  verde: "bg-good",
  neutro: "bg-soft",
};

function BadgePlano({ m }: { m: MesQuadro }) {
  const mapa: Record<string, { txt: string; cls: string }> = {
    aprovado: { txt: "Aprovado", cls: "bg-good/15 text-good" },
    enviado: { txt: "Enviado", cls: "bg-cobalt/10 text-cobalt" },
    rascunho: { txt: "Em produção", cls: "bg-warn/15 text-warn" },
    alteracoes: { txt: "Alterações", cls: "bg-warn/15 text-warn" },
    recusado: { txt: "Recusado", cls: "bg-bad/15 text-bad" },
  };
  const e = m.estado ? mapa[m.estado] : null;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
        e ? e.cls : "bg-line/60 text-soft"
      }`}
    >
      {e ? e.txt : "Por começar"}
    </span>
  );
}

function agendadoTexto(m: MesQuadro): string {
  if (m.agendados == null) return m.agendadoEm ? "marcado" : "—";
  if (m.agendados === 0) return "0 agendados";
  return m.pendentes && m.pendentes > 0
    ? `${m.agendados} agendados · ${m.pendentes} por sair`
    : `${m.agendados} agendados`;
}

function Linha({ linha }: { linha: LinhaQuadro }) {
  return (
    <div className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PONTO[linha.semaforo]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <Link href={`/clientes/${linha.clienteId}`} className="truncate text-sm font-bold hover:underline">
          {linha.nome}
        </Link>
        <p className="text-xs text-grey">{linha.accao}</p>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <BadgePlano m={linha.proximo} />
        <div className="mt-0.5">
          {linha.proximo.agendados != null ? (
            <p className="text-[11px] text-soft">{agendadoTexto(linha.proximo)}</p>
          ) : linha.proximo.planoId ? (
            <form action={alternarAgendado}>
              <input type="hidden" name="plano_id" value={linha.proximo.planoId} />
              <input type="hidden" name="marcar" value={linha.proximo.agendadoEm ? "0" : "1"} />
              <button
                type="submit"
                className={`text-[11px] font-bold ${
                  linha.proximo.agendadoEm ? "text-good" : "text-soft hover:text-ink"
                }`}
              >
                {linha.proximo.agendadoEm ? "✓ agendado" : "marcar agendado"}
              </button>
            </form>
          ) : (
            <p className="text-[11px] text-soft">—</p>
          )}
        </div>
      </div>
      <div className="hidden w-24 shrink-0 text-right md:block">
        <p className="text-[10px] uppercase tracking-wide text-soft">este mês</p>
        <BadgePlano m={linha.atual} />
      </div>
    </div>
  );
}

export default async function ProducaoPage() {
  const supabase = await criarClienteServidor();
  const quadro = await lerQuadroProducao(supabase);

  if (!quadro.pronto) {
    return (
      <div className="space-y-5">
        <div>
          <p className="rotulo">saber quando produzir</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Produção</h1>
        </div>
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-6">
          <p className="font-display text-lg font-extrabold">Falta correr a migração.</p>
          <p className="mt-1 text-sm text-grey">
            Corre <code className="rounded bg-cream px-1 font-mono">0066_producao_mensal.sql</code> no SQL
            Editor do Supabase para ativar o quadro. Nada parte enquanto não a correres — só fica à espera.
          </p>
        </div>
      </div>
    );
  }

  // Contas ativas para o gestor de "quais têm plano mensal".
  const { data: ativosRaw } = await supabase
    .from("clientes")
    .select("id, nome_marca, plano_mensal")
    .eq("estado", "cliente")
    .order("nome_marca");
  const ativos = (ativosRaw ?? []) as { id: string; nome_marca: string; plano_mensal: boolean }[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="rotulo">saber quando produzir</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Produção</h1>
        </div>
        <p className="text-sm text-grey">
          Faltam <b className="text-ink">{quadro.diasAteFim} dias</b> para o fim do mês
        </p>
      </div>

      {quadro.janela ? (
        <div className="rounded-xl bg-ink p-5 text-cream">
          <p className="font-display text-lg font-extrabold text-gold">
            Hora de produzir {quadro.proximoNome}. 🖐️
          </p>
          <p className="mt-1 text-sm text-soft">
            Faltam {quadro.diasAteFim} dias para o fim do mês — os planos do próximo mês deviam estar a
            ganhar forma. Vê a vermelho o que ainda não começou.
          </p>
        </div>
      ) : null}

      {quadro.linhas.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-8 text-center">
          <p className="font-display text-xl font-extrabold">Nenhuma conta com plano mensal.</p>
          <p className="mt-2 text-sm text-grey">
            Escolhe abaixo quais as contas que têm plano mensal — passam a aparecer aqui e no alerta.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line bg-cream/50 px-4 py-2">
            <p className="text-xs font-bold uppercase tracking-wide text-grey">
              Plano de {quadro.proximoNome} (o próximo)
            </p>
            <p className="hidden text-[11px] text-soft md:block">🔴 por começar · 🟠 a caminho · 🟢 pronto</p>
          </div>
          {quadro.linhas.map((l) => (
            <Linha key={l.clienteId} linha={l} />
          ))}
        </div>
      )}

      {/* Gerir quais contas têm plano mensal */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-display text-lg font-extrabold">Contas com plano mensal</h2>
        <p className="mt-0.5 text-xs text-grey">
          Liga as contas que produzes todos os meses. Só estas entram no quadro e no alerta de 20 dias.
        </p>
        <div className="mt-3 divide-y divide-line/60">
          {ativos.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate text-sm font-medium">{c.nome_marca}</span>
              <form action={alternarPlanoMensal}>
                <input type="hidden" name="cliente_id" value={c.id} />
                <input type="hidden" name="ativar" value={c.plano_mensal ? "0" : "1"} />
                <button
                  type="submit"
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    c.plano_mensal
                      ? "bg-ink text-cream hover:brightness-110"
                      : "border border-line text-grey hover:bg-cream hover:text-ink"
                  }`}
                >
                  {c.plano_mensal ? "✓ mensal" : "ativar"}
                </button>
              </form>
            </div>
          ))}
          {ativos.length === 0 ? (
            <p className="py-2 text-sm text-soft">Ainda não há clientes ativos.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
