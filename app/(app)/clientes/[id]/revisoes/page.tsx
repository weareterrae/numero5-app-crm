import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { euros, dataCurta } from "@/lib/dominio/metricas";
import { resumoRevisoesPeca, type Revisao } from "@/lib/dominio/operacao";
import { guardarRevisao, alternarFaturadaRev, apagarRevisao } from "./acoes";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold";
const lab = "mb-1 block text-[11px] font-bold text-grey";

const TIPO_ROTULO: Record<string, string> = {
  correcao: "correção",
  alteracao: "alteração",
  retrabalho: "retrabalho",
};

type LinhaRevisao = Revisao & {
  id: string;
  peca: string;
  versao: number;
  data: string;
  pedido: string | null;
  origem: string | null;
  responsavel: string | null;
};

export default async function RevisoesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome_marca")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  const [revisoesRes, cfgRes] = await Promise.all([
    supabase
      .from("revisoes")
      .select("id, peca, versao, tipo, data, pedido, origem, horas, incluido, valor, faturada, responsavel")
      .eq("cliente_id", id)
      .order("data", { ascending: false })
      .then((r) => r, () => ({ data: [] })),
    supabase
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", ["revisoes_incluidas", "janela_ronda_horas"]),
  ]);

  const revisoes = (revisoesRes.data ?? []) as LinhaRevisao[];
  const cfg = Object.fromEntries((cfgRes.data ?? []).map((r) => [r.chave, r.valor]));
  const incluidasLim = cfg.revisoes_incluidas == null || cfg.revisoes_incluidas === "" ? null : Number(cfg.revisoes_incluidas);
  const janela = cfg.janela_ronda_horas ?? "48";

  // Agrupar por peça.
  const porPeca = new Map<string, LinhaRevisao[]>();
  for (const r of revisoes) {
    if (!porPeca.has(r.peca)) porPeca.set(r.peca, []);
    porPeca.get(r.peca)!.push(r);
  }

  // Totais para o cabeçalho.
  const totalCliente = resumoRevisoesPeca(revisoes, null);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-xs font-bold text-gold-dark">
          ← {cliente.nome_marca}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Revisões</h1>
        <p className="mt-1 text-sm text-grey">
          Correção não gasta ronda. Alteração gasta. Retrabalho cobra-se. Cada tipo no seu sítio.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-white p-4 text-sm">
        <p className="rotulo">regras</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-grey">
          <span>
            Rondas incluídas/peça:{" "}
            <b className="text-ink">{incluidasLim == null ? "[A DEFINIR]" : incluidasLim}</b>
          </span>
          <span>
            Janela para consolidar uma ronda: <b className="text-ink">{janela}h</b>
          </span>
        </div>
        <p className="mt-1.5 text-xs text-soft">
          Uma ronda é o conjunto de pedidos sobre a <b>mesma versão</b>. Pedidos dispersos dentro da
          janela consolidam-se numa só ronda.
        </p>
      </div>

      {totalCliente.porFaturar > 0 && (
        <div className="rounded-xl border-2 border-warn bg-warn/10 p-4 text-sm">
          ⚠️ Há <b>{totalCliente.porFaturar}</b> revisão(ões) extra/retrabalho por faturar
          {totalCliente.valorPorFaturar > 0 && (
            <> — <b>{euros(totalCliente.valorPorFaturar)}</b></>
          )}
          .
        </div>
      )}

      {/* Por peça */}
      {porPeca.size === 0 ? (
        <section className="rounded-xl border border-line bg-white p-5">
          <p className="text-sm text-soft">Ainda não registaste revisões.</p>
        </section>
      ) : (
        [...porPeca.entries()].map(([peca, lista]) => {
          const s = resumoRevisoesPeca(lista, incluidasLim);
          return (
            <section key={peca} className="rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-extrabold">{peca}</h2>
                <span className="text-xs text-grey">
                  {s.rondas} ronda(s)
                  {incluidasLim != null && ` / ${incluidasLim}`} · {s.correcoes} correção(ões) ·{" "}
                  {s.retrabalhos} retrabalho(s)
                </span>
              </div>
              {s.sobreLimite && (
                <p className="mt-1 rounded bg-bad/10 p-2 text-xs text-bad">
                  ⚠️ Esta peça passou das {incluidasLim} rondas incluídas. As seguintes deviam ser
                  extra.
                </p>
              )}
              <div className="mt-3 space-y-1.5">
                {lista.map((r) => (
                  <div key={r.id} className="rounded-lg border border-line p-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            r.tipo === "correcao"
                              ? "bg-good/15 text-good"
                              : r.tipo === "retrabalho"
                                ? "bg-gold/15 text-gold-dark"
                                : "bg-cream text-grey"
                          }`}
                        >
                          {TIPO_ROTULO[r.tipo ?? "alteracao"]}
                        </span>
                        <span className="text-soft">v{r.versao}</span>
                        <span className="text-soft">{dataCurta(r.data)}</span>
                        {r.horas != null && <span className="text-soft">{r.horas}h</span>}
                        {r.incluido === false && (
                          <span className="text-[11px] font-bold text-gold-dark">
                            extra{r.valor != null ? ` · ${euros(r.valor)}` : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {r.incluido === false && (
                          <form action={alternarFaturadaRev.bind(null, r.id, cliente.id)}>
                            <button
                              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                r.faturada
                                  ? "bg-good/15 text-good"
                                  : "border border-gold-dark text-gold-dark"
                              }`}
                            >
                              {r.faturada ? "faturada ✓" : "marcar faturada"}
                            </button>
                          </form>
                        )}
                        <form action={apagarRevisao.bind(null, r.id, cliente.id)}>
                          <button className="text-[11px] text-bad">apagar</button>
                        </form>
                      </div>
                    </div>
                    {r.pedido && <p className="mt-1 text-xs text-grey">{r.pedido}</p>}
                    {(r.origem || r.responsavel) && (
                      <p className="mt-0.5 text-[11px] text-soft">
                        {r.origem && <>via {r.origem}</>}
                        {r.origem && r.responsavel && " · "}
                        {r.responsavel && <>por {r.responsavel}</>}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}

      {/* Registar */}
      <section className="rounded-xl border-2 border-gold/40 bg-gold/5 p-5">
        <h2 className="font-display text-lg font-extrabold">Registar revisão</h2>
        <form action={guardarRevisao} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="cliente_id" value={cliente.id} />
          <div className="sm:col-span-2">
            <label className={lab}>Peça</label>
            <input name="peca" required placeholder="ex.: Carrossel «5 sinais»" className={inp} />
          </div>
          <div>
            <label className={lab}>Tipo</label>
            <select name="tipo" className={inp}>
              <option value="alteracao">Alteração (consome ronda)</option>
              <option value="correcao">Correção (erro nosso, não consome)</option>
              <option value="retrabalho">Retrabalho (extra, faturável)</option>
            </select>
          </div>
          <div>
            <label className={lab}>Versão</label>
            <input name="versao" type="number" min="1" defaultValue={1} className={`${inp} tabular-nums`} />
          </div>
          <div>
            <label className={lab}>Data</label>
            <input name="data" type="date" className={inp} />
          </div>
          <div>
            <label className={lab}>Origem</label>
            <input name="origem" placeholder="email, WhatsApp, reunião…" className={inp} />
          </div>
          <div>
            <label className={lab}>Horas</label>
            <input name="horas" type="number" step="0.25" min="0" className={`${inp} tabular-nums`} />
          </div>
          <div>
            <label className={lab}>Valor a cobrar (€, se extra)</label>
            <input name="valor" type="number" step="0.01" min="0" className={`${inp} tabular-nums`} />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="incluido" value="extra" className="size-4 accent-[#E8A13C]" />
            É extra (fora do incluído)
          </label>
          <div className="sm:col-span-2">
            <label className={lab}>Responsável</label>
            <input name="responsavel" className={inp} />
          </div>
          <div className="sm:col-span-2">
            <label className={lab}>Pedido</label>
            <textarea name="pedido" rows={2} className={inp} />
          </div>
          <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink sm:col-span-2">
            Guardar revisão
          </button>
        </form>
        <p className="mt-2 text-[11px] text-soft">
          Correção fica sempre incluída; retrabalho fica sempre extra. Para a alteração, marca «é
          extra» só quando passa do incluído.
        </p>
      </section>
    </div>
  );
}
