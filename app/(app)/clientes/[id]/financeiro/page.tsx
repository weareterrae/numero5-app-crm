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
  PAUSA_TIPOS,
  pausaAtiva,
  pausaExpirada,
  type Cobranca,
  type EstadoFinanceiro,
  type Pausa,
} from "@/lib/dominio/operacao";
import { dataCurta } from "@/lib/dominio/metricas";
import { guardarFinanceiro, guardarArranque, guardarPausa, terminarPausa } from "./acoes";
import {
  invoicexpressConfigurado,
  invoicexpressBase,
  extratoClienteIX,
  classificarDoc,
  diasAtraso,
} from "@/lib/faturacao/invoicexpress";

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
    .select("id, nome_marca, empresa_fiscal")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  const [{ data: jsonRow }, cobrancasRes] = await Promise.all([
    supabase.from("clientes").select("financeiro, arranque, pausa").eq("id", id).maybeSingle().then(
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
  const pausa = (jsonRow?.pausa ?? null) as Pausa | null;
  const cobrancas = (cobrancasRes.data ?? []) as Cobranca[];
  const hojeISO = new Date().toISOString().slice(0, 10);
  const emPausa = pausaAtiva(pausa, hojeISO);
  const pausaVencida = pausaExpirada(pausa, hojeISO);

  const inicioMes = new Date();
  inicioMes.setDate(1);
  const primeiroDiaMes = inicioMes.toISOString().slice(0, 10);
  const divida = resumoDivida(cobrancas, primeiroDiaMes);

  // Documentos fiscais InvoiceXpress (0059/0060) — consulta tolerante.
  type DocFiscal = {
    mes: string;
    fatura_ix_numero: string | null;
    fatura_ix_url: string | null;
    fatura_ix_pdf: string | null;
    fatura_ix_estado: string | null;
    recibo_ix_url: string | null;
    nc_ix_url: string | null;
  };
  const { data: docsRaw } = await supabase
    .from("cobrancas")
    .select("mes, fatura_ix_numero, fatura_ix_url, fatura_ix_pdf, fatura_ix_estado, recibo_ix_url, nc_ix_url")
    .eq("cliente_id", id)
    .not("fatura_ix_id", "is", null)
    .order("mes", { ascending: false })
    .then(
      (r) => r,
      () => ({ data: null }),
    );
  const docsFiscais = (docsRaw ?? []) as DocFiscal[];

  // Extrato de conta corrente no InvoiceXpress (por nome fiscal/marca).
  const nomeIX = (cliente.empresa_fiscal || cliente.nome_marca || "").trim();
  const ext = await extratoClienteIX(nomeIX);
  const extratoIX = ext.docs;
  const extratoErro = ext.ok ? null : (ext.erro ?? "?");
  const extPendente = ext.pendente;
  const extPago = ext.pago;
  const extNC = ext.nc;

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

      {/* Documentos fiscais (InvoiceXpress) */}
      {docsFiscais.length > 0 && (
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-3 font-display text-lg font-extrabold">Documentos fiscais</h2>
          <ul className="divide-y divide-line/60">
            {docsFiscais.map((d) => (
              <li key={d.mes} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-28 font-bold">
                  {new Date(d.mes).toLocaleDateString("pt-PT", { month: "long", year: "numeric" })}
                </span>
                <a
                  href={d.fatura_ix_pdf || d.fatura_ix_url || "#"}
                  target="_blank"
                  rel="noopener"
                  className="rounded-full border border-line px-3 py-1 text-xs font-bold text-grey hover:bg-cream"
                >
                  🧾 {d.fatura_ix_numero || (d.fatura_ix_estado === "final" ? "fatura" : "rascunho")} ↗
                </a>
                {d.recibo_ix_url ? (
                  <a href={d.recibo_ix_url} target="_blank" rel="noopener" className="rounded-full border border-line px-3 py-1 text-xs font-bold text-good hover:bg-cream">
                    recibo ↗
                  </a>
                ) : null}
                {d.nc_ix_url ? (
                  <a href={d.nc_ix_url} target="_blank" rel="noopener" className="rounded-full border border-line px-3 py-1 text-xs font-bold text-warn hover:bg-cream">
                    nota de crédito ↗
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-soft">
            A emissão faz-se na página Faturação. O cliente descarrega os PDF na Sede → Pagamentos.
          </p>
        </section>
      )}

      {/* Conta corrente no InvoiceXpress */}
      {invoicexpressConfigurado() && (
        <section className="rounded-xl border border-line bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold">Conta corrente · InvoiceXpress</h2>
            {invoicexpressBase() ? (
              <a
                href={`${invoicexpressBase()}/invoices`}
                target="_blank"
                rel="noopener"
                className="text-xs font-bold text-gold-dark hover:underline"
              >
                abrir no InvoiceXpress ↗
              </a>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-soft">
            Documentos emitidos a «{nomeIX}» na conta InvoiceXpress.
          </p>
          {extratoErro ? (
            <p className="mt-2 text-sm text-soft">Não consegui ler o InvoiceXpress agora ({extratoErro}).</p>
          ) : extratoIX.length === 0 ? (
            <p className="mt-2 text-sm text-soft">Sem documentos no InvoiceXpress com este nome.</p>
          ) : (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className={`rounded-xl border p-3 ${extPendente > 0 ? "border-bad/40 bg-bad/5" : "border-line"}`}>
                  <p className={`font-display text-xl font-extrabold tabular-nums ${extPendente > 0 ? "text-bad" : ""}`}>{euros(extPendente)}</p>
                  <p className="text-[11px] text-grey">por regularizar</p>
                </div>
                <div className="rounded-xl border border-line p-3">
                  <p className="font-display text-xl font-extrabold tabular-nums text-good">{euros(extPago)}</p>
                  <p className="text-[11px] text-grey">pago</p>
                </div>
                <div className="rounded-xl border border-line p-3">
                  <p className="font-display text-xl font-extrabold tabular-nums">{extratoIX.length}</p>
                  <p className="text-[11px] text-grey">documentos{extNC > 0 ? ` · NC ${euros(extNC)}` : ""}</p>
                </div>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[30rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-grey">
                      <th className="py-1.5 pr-3 font-bold">Data</th>
                      <th className="py-1.5 pr-3 font-bold">Documento</th>
                      <th className="py-1.5 pr-3 text-right font-bold">Valor</th>
                      <th className="py-1.5 pr-3 font-bold">Estado</th>
                      <th className="py-1.5 font-bold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {extratoIX.map((d) => {
                      const classe = classificarDoc(d);
                      const atraso = classe === "fatura_pendente" ? diasAtraso(d.vencimento) : 0;
                      const pill =
                        classe === "nc"
                          ? ["bg-warn/15 text-warn", "nota de crédito"]
                          : classe === "recibo"
                            ? ["bg-good/15 text-good", "recibo ✓"]
                            : classe === "fatura_paga"
                              ? ["bg-good/15 text-good", "paga ✓"]
                              : ["bg-bad/10 text-bad", atraso > 0 ? `vencida há ${atraso} d` : "por regularizar"];
                      return (
                        <tr key={`${d.tipo}-${d.id}`} className="border-b border-line/50">
                          <td className="py-2 pr-3 text-grey">{d.data ?? "—"}</td>
                          <td className="py-2 pr-3 font-bold">
                            {classe === "nc" ? "NC " : classe === "recibo" ? "RC " : ""}
                            {d.numero ?? d.id}
                          </td>
                          <td className={`py-2 pr-3 text-right tabular-nums ${classe === "nc" ? "text-warn" : ""}`}>
                            {classe === "nc" ? "−" : ""}
                            {euros(d.total)}
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${pill[0]}`}>{pill[1]}</span>
                          </td>
                          <td className="py-2 text-right">
                            {d.permalink ? (
                              <a href={d.permalink} target="_blank" rel="noopener" className="text-xs font-bold text-gold-dark hover:underline">
                                ver ↗
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

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

      {/* Pausa de contrato */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-extrabold">Pausa</h2>
          {emPausa && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                pausaVencida ? "bg-bad/15 text-bad" : "bg-warn/15 text-warn"
              }`}
            >
              {pausaVencida ? "pausa vencida — decidir" : "em pausa"}
            </span>
          )}
        </div>

        {emPausa ? (
          <div className="mt-2 text-sm">
            <p className="text-grey">
              {PAUSA_TIPOS.find(([k]) => k === pausa?.tipo)?.[1] ?? "Pausa"}
              {pausa?.fim && <> · até <b>{dataCurta(pausa.fim)}</b></>}
              {pausa?.fee_minimo != null && pausa.fee_minimo > 0 && (
                <> · fee mínimo <b>{euros(pausa.fee_minimo)}/mês</b></>
              )}
            </p>
            {pausa?.motivo && <p className="mt-1 text-xs text-soft">{pausa.motivo}</p>}
            {pausaVencida && (
              <p className="mt-2 text-xs font-bold text-bad">
                A pausa chegou ao fim — retoma a operação ou combina uma nova pausa.
              </p>
            )}
            <form action={terminarPausa.bind(null, cliente.id)} className="mt-3">
              <button className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream">
                Retomar (terminar pausa)
              </button>
            </form>
          </div>
        ) : (
          <>
            <p className="mb-3 mt-1 text-xs text-soft">
              Uma pausa tem sempre fim — nada de pausas indefinidas. Podes definir um fee mínimo para
              o período.
            </p>
            <form action={guardarPausa} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="cliente_id" value={cliente.id} />
              <div>
                <label className={lab}>Tipo</label>
                <select name="tipo" className={inp}>
                  {PAUSA_TIPOS.map(([k, r]) => (
                    <option key={k} value={k}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lab}>Fee mínimo (€/mês)</label>
                <input name="fee_minimo" type="number" step="0.01" min="0" className={`${inp} tabular-nums`} />
              </div>
              <div>
                <label className={lab}>Início</label>
                <input name="inicio" type="date" className={inp} />
              </div>
              <div>
                <label className={lab}>Até (obrigatório)</label>
                <input name="fim" type="date" required className={inp} />
              </div>
              <div className="sm:col-span-2">
                <label className={lab}>Motivo</label>
                <input name="motivo" placeholder="ex.: obras no espaço, sazonalidade…" className={inp} />
              </div>
              <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink sm:col-span-2">
                Iniciar pausa
              </button>
            </form>
          </>
        )}
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
