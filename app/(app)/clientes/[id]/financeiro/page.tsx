import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { euros } from "@/lib/dominio/metricas";
import {
  resumoDivida,
  arranqueCompleto,
  corEstadoFinanceiro,
  ESTADO_FINANCEIRO_ROTULO,
  REQUISITOS_ARRANQUE,
  type Cobranca,
  type EstadoFinanceiro,
} from "@/lib/dominio/operacao";
import { guardarFinanceiro, guardarArranque } from "./acoes";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold";
const lab = "mb-1 block text-[11px] font-bold text-grey";

const REQ_ROTULO: Record<string, string> = {
  proposta_aceite: "Proposta aceite",
  dados_fiscais: "Dados fiscais",
  pagamento_inicial: "Pagamento inicial",
  acessos: "Acessos essenciais",
  briefing: "Briefing mínimo",
};

export default async function FinanceiroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome_marca")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  const [{ data: jsonRow }, cobrancasRes] = await Promise.all([
    supabase.from("clientes").select("financeiro, arranque").eq("id", id).maybeSingle().then(
      (r) => r,
      () => ({ data: null }),
    ),
    supabase.from("cobrancas").select("mes, valor, estado").eq("cliente_id", id).then(
      (r) => r,
      () => ({ data: [] }),
    ),
  ]);

  const fin = (jsonRow?.financeiro ?? {}) as Record<string, string | null>;
  const arr = (jsonRow?.arranque ?? {}) as Record<string, unknown>;
  const cobrancas = (cobrancasRes.data ?? []) as Cobranca[];

  const inicioMes = new Date();
  inicioMes.setDate(1);
  const primeiroDiaMes = inicioMes.toISOString().slice(0, 10);
  const divida = resumoDivida(cobrancas, primeiroDiaMes);

  const estado = (fin.estado ?? "regular") as EstadoFinanceiro;
  const cor = corEstadoFinanceiro(estado);
  const corCls =
    cor === "bad" ? "border-bad bg-bad/10 text-bad" : cor === "warn" ? "border-warn bg-warn/10 text-warn" : "border-good bg-good/10 text-good";
  const completo = arranqueCompleto(arr);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-xs font-bold text-gold-dark">
          ← {cliente.nome_marca}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Financeiro</h1>
        <p className="mt-1 text-sm text-grey">
          O dinheiro em dívida vem das cobranças. Nada suspende sozinho — a decisão é tua.
        </p>
      </div>

      {/* Dívida derivada + estado */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`rounded-xl border-2 p-4 ${corCls}`}>
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">estado</p>
          <p className="font-display text-lg font-extrabold">{ESTADO_FINANCEIRO_ROTULO[estado]}</p>
        </div>
        <div className={`rounded-xl border p-4 ${divida.valorVencido > 0 ? "border-bad bg-bad/5" : "border-line bg-white"}`}>
          <p className="font-display text-2xl font-extrabold tabular-nums">{euros(divida.valorVencido)}</p>
          <p className="text-[11px] text-grey">valor vencido</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="font-display text-2xl font-extrabold tabular-nums">{divida.numVencidas}</p>
          <p className="text-[11px] text-grey">faturas vencidas</p>
        </div>
      </div>

      {/* Gestão do estado */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-3 font-display text-lg font-extrabold">Gestão de cobrança</h2>
        <form action={guardarFinanceiro} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="cliente_id" value={cliente.id} />
          <div>
            <label className={lab}>Estado</label>
            <select name="estado" defaultValue={estado} className={inp}>
              {(Object.keys(ESTADO_FINANCEIRO_ROTULO) as EstadoFinanceiro[]).map((k) => (
                <option key={k} value={k}>
                  {ESTADO_FINANCEIRO_ROTULO[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={lab}>Responsável</label>
            <input name="responsavel" defaultValue={fin.responsavel ?? ""} className={inp} />
          </div>
          <div>
            <label className={lab}>Último contacto</label>
            <input type="date" name="ultimo_contacto" defaultValue={fin.ultimo_contacto ?? ""} className={inp} />
          </div>
          <div>
            <label className={lab}>Próxima ação</label>
            <input name="proxima_acao" defaultValue={fin.proxima_acao ?? ""} className={inp} />
          </div>
          <div className="sm:col-span-2">
            <label className={lab}>Exceção autorizada (motivo)</label>
            <input name="excecao" defaultValue={fin.excecao ?? ""} placeholder="ex.: acordo de pagamento a 60 dias" className={inp} />
          </div>
          <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-cream sm:col-span-2">
            Guardar estado
          </button>
        </form>
      </section>

      {/* Arranque da Fundação */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-extrabold">Arranque da Fundação</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              completo ? "bg-good/15 text-good" : "bg-warn/15 text-warn"
            }`}
          >
            {completo ? "pronto a arrancar" : "bloqueado"}
          </span>
        </div>
        <p className="mb-3 text-xs text-soft">
          Nenhuma Fundação arranca sem estes pré-requisitos. Podes desbloquear à mão — mas com motivo,
          e fica no histórico.
        </p>
        <form action={guardarArranque} className="space-y-2">
          <input type="hidden" name="cliente_id" value={cliente.id} />
          {REQUISITOS_ARRANQUE.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={k} defaultChecked={!!arr[k]} className="size-4 accent-[#E8A13C]" />
              {REQ_ROTULO[k]}
            </label>
          ))}
          <div className="pt-1">
            <label className={lab}>Motivo do desbloqueio manual (se arrancar sem tudo cumprido)</label>
            <input
              name="desbloqueio_motivo"
              defaultValue={(arr.desbloqueio_motivo as string) ?? ""}
              placeholder="obrigatório para desbloquear à mão"
              className={inp}
            />
          </div>
          <button className="mt-1 rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink">
            Guardar arranque
          </button>
        </form>
      </section>
    </div>
  );
}
