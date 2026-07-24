import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { euros } from "@/lib/dominio/metricas";
import { deslocarMes, mesISO, mesLegivel } from "@/lib/dominio/producao";
import { marcarCobranca } from "./acoes";

export const dynamic = "force-dynamic";

type Avenca = {
  cliente_id: string;
  valor_mensal: number;
  dia_cobranca: number | null;
  clientes: { nome_marca: string } | { nome_marca: string }[] | null;
};
type Cobranca = { cliente_id: string; estado: string };

export default async function FaturacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesQuery } = await searchParams;
  const mes = mesQuery ?? mesISO();
  const supabase = await criarClienteServidor();

  const [avRes, cobRes] = await Promise.all([
    supabase
      .from("avencas")
      .select("cliente_id, valor_mensal, dia_cobranca, clientes(nome_marca)")
      .eq("estado", "ativa")
      .order("valor_mensal", { ascending: false }),
    // Tolerante: se a migração 0019 ainda não correu, vem vazio em vez de partir.
    supabase.from("cobrancas").select("cliente_id, estado").eq("mes", mes).eq("tipo", "avenca"),
  ]);

  const avencas = (avRes.data ?? []) as unknown as Avenca[];
  const cobrancas = (cobRes.data ?? []) as Cobranca[];
  const cobradoDe = new Map(cobrancas.map((c) => [c.cliente_id, c.estado === "cobrado"]));
  const nomeDe = (c: Avenca["clientes"]) =>
    (Array.isArray(c) ? c[0]?.nome_marca : c?.nome_marca) ?? "Cliente";

  const aCobrar = avencas.reduce((s, a) => s + Number(a.valor_mensal || 0), 0);
  const cobrado = avencas.reduce(
    (s, a) => s + (cobradoDe.get(a.cliente_id) ? Number(a.valor_mensal || 0) : 0),
    0,
  );
  const porCobrar = aCobrar - cobrado;
  const nCobradas = avencas.filter((a) => cobradoDe.get(a.cliente_id)).length;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rotulo">do contratado ao recebido</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Faturação</h1>
          <p className="text-sm text-grey">{mesLegivel(mes)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/faturacao?mes=${deslocarMes(mes, -1)}`} className="rounded-full border border-line px-3 py-1.5 text-sm font-bold text-grey">←</Link>
          <Link href={`/faturacao?mes=${mesISO()}`} className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-grey">este mês</Link>
          <Link href={`/faturacao?mes=${deslocarMes(mes, 1)}`} className="rounded-full border border-line px-3 py-1.5 text-sm font-bold text-grey">→</Link>
        </div>
      </div>

      {avencas.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-8 text-center">
          <p className="font-display text-xl font-extrabold">Sem avenças ativas.</p>
          <p className="mt-2 text-sm text-grey">
            Quando uma proposta for aceite, a avença é criada e aparece aqui para cobrança.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-ink p-5 text-cream">
              <div className="font-display text-2xl font-extrabold text-gold tabular-nums">{euros(aCobrar)}</div>
              <div className="mt-1 text-[13px] text-soft">a cobrar este mês</div>
            </div>
            <div className="rounded-xl bg-ink p-5 text-cream">
              <div className="font-display text-2xl font-extrabold text-good tabular-nums">{euros(cobrado)}</div>
              <div className="mt-1 text-[13px] text-soft">já cobrado ({nCobradas}/{avencas.length})</div>
            </div>
            <div className={`rounded-xl p-5 ${porCobrar > 0 ? "bg-bad text-white" : "bg-ink text-cream"}`}>
              <div className={`font-display text-2xl font-extrabold tabular-nums ${porCobrar > 0 ? "text-white" : "text-gold"}`}>
                {euros(porCobrar)}
              </div>
              <div className={`mt-1 text-[13px] ${porCobrar > 0 ? "text-white/80" : "text-soft"}`}>por cobrar</div>
            </div>
          </div>

          {/* Lista */}
          <section className="overflow-hidden rounded-xl border border-line bg-white">
            {avencas.map((a) => {
              const jaCobrado = !!cobradoDe.get(a.cliente_id);
              return (
                <div
                  key={a.cliente_id}
                  className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0"
                >
                  <Link href={`/clientes/${a.cliente_id}`} className="min-w-0 flex-1 hover:text-gold-dark">
                    <p className="truncate text-sm font-bold">{nomeDe(a.clientes)}</p>
                    <p className="text-xs text-grey">
                      {euros(a.valor_mensal)}/mês{a.dia_cobranca ? ` · cobra dia ${a.dia_cobranca}` : ""}
                    </p>
                  </Link>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      jaCobrado ? "bg-good/15 text-good" : "bg-bad/10 text-bad"
                    }`}
                  >
                    {jaCobrado ? "cobrado ✓" : "por cobrar"}
                  </span>
                  <form action={marcarCobranca} className="shrink-0">
                    <input type="hidden" name="cliente_id" value={a.cliente_id} />
                    <input type="hidden" name="mes" value={mes} />
                    <input type="hidden" name="tipo" value="avenca" />
                    <input type="hidden" name="valor" value={a.valor_mensal} />
                    <input type="hidden" name="cobrado" value={jaCobrado ? "0" : "1"} />
                    <button
                      className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
                        jaCobrado ? "border border-line text-grey" : "bg-gold text-ink"
                      }`}
                    >
                      {jaCobrado ? "desmarcar" : "marcar cobrado"}
                    </button>
                  </form>
                </div>
              );
            })}
          </section>

          <p className="text-xs text-soft">
            Os <b>extras</b> avulsos (fora da avença) cobram-se pela folha de produção de cada cliente,
            onde marcas cada extra como faturado.
          </p>
        </>
      )}
    </div>
  );
}
