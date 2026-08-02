import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { euros } from "@/lib/dominio/metricas";
import { deslocarMes, mesISO, mesLegivel } from "@/lib/dominio/producao";
import {
  marcarCobranca,
  emitirFaturaIX,
  enviarFaturaEmailIX,
  criarNotaCreditoIX,
  criarReciboLivre,
  criarNotaCreditoLivre,
  enviarFaturaEmailLivre,
} from "./acoes";
import {
  invoicexpressConfigurado,
  invoicexpressBase,
  listarDocumentosIX,
  diasAtraso,
} from "@/lib/faturacao/invoicexpress";

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
  searchParams: Promise<{ mes?: string; ix_ok?: string; ix_erro?: string }>;
}) {
  const { mes: mesQuery, ix_ok, ix_erro } = await searchParams;
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

  // Mapa de faturas por regularizar no InvoiceXpress (conta inteira).
  const ixBase = invoicexpressBase();
  const pendentesIX = invoicexpressConfigurado()
    ? await listarDocumentosIX({ estados: ["sent"], maxPaginas: 5 })
    : null;
  const pendentes =
    pendentesIX && pendentesIX.ok
      ? pendentesIX.docs
          .filter((d) => d.tipo !== "CreditNote")
          .sort((a, b) => diasAtraso(b.vencimento) - diasAtraso(a.vencimento))
      : [];
  const totalPendente = pendentes.reduce((s, d) => s + d.total, 0);
  const vencidas = pendentes.filter((d) => diasAtraso(d.vencimento) > 0);

  // Documentos InvoiceXpress ligados (0059/0060) — consulta à parte e tolerante.
  type DocIX = {
    cliente_id: string;
    fatura_ix_id: number | null;
    fatura_ix_url: string | null;
    fatura_ix_estado: string | null;
    fatura_ix_numero: string | null;
    fatura_ix_pdf: string | null;
    recibo_ix_url: string | null;
    nc_ix_url: string | null;
  };
  const temIX = invoicexpressConfigurado();
  const docsDe = new Map<string, DocIX>();
  if (temIX) {
    const { data: fx } = await supabase
      .from("cobrancas")
      .select("cliente_id, fatura_ix_id, fatura_ix_url, fatura_ix_estado, fatura_ix_numero, fatura_ix_pdf, recibo_ix_url, nc_ix_url")
      .eq("mes", mes)
      .eq("tipo", "avenca")
      .not("fatura_ix_id", "is", null)
      .then((r) => r, () => ({ data: null }));
    for (const f of (fx ?? []) as DocIX[]) docsDe.set(f.cliente_id, f);
  }
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
          {ixBase ? (
            <>
              <Link
                href="/faturacao/emitir"
                className="rounded-full bg-gold px-4 py-1.5 text-xs font-bold text-ink hover:brightness-105"
              >
                ➕ Emitir fatura
              </Link>
              <a
                href={`${ixBase}/invoices`}
                target="_blank"
                rel="noopener"
                className="rounded-full bg-ink px-4 py-1.5 text-xs font-bold text-cream hover:brightness-110"
              >
                🧾 Abrir InvoiceXpress ↗
              </a>
            </>
          ) : null}
          <Link href={`/faturacao?mes=${deslocarMes(mes, -1)}`} className="rounded-full border border-line px-3 py-1.5 text-sm font-bold text-grey">←</Link>
          <Link href={`/faturacao?mes=${mesISO()}`} className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-grey">este mês</Link>
          <Link href={`/faturacao?mes=${deslocarMes(mes, 1)}`} className="rounded-full border border-line px-3 py-1.5 text-sm font-bold text-grey">→</Link>
        </div>
      </div>

      {ix_ok ? (
        <p className="rounded-xl border-2 border-good/40 bg-good/5 px-4 py-3 text-sm font-bold text-good">
          ✓ {ix_ok}
        </p>
      ) : null}
      {ix_erro ? (
        <p className="rounded-xl border-2 border-bad/40 bg-bad/5 px-4 py-3 text-sm font-bold text-bad">
          ⚠️ {ix_erro}
        </p>
      ) : null}

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
                  {temIX ? (
                    (() => {
                      const doc = docsDe.get(a.cliente_id);
                      if (!doc)
                        return (
                          <form action={emitirFaturaIX} className="shrink-0">
                            <input type="hidden" name="cliente_id" value={a.cliente_id} />
                            <input type="hidden" name="mes" value={mes} />
                            <input type="hidden" name="tipo" value="avenca" />
                            <input type="hidden" name="valor" value={a.valor_mensal} />
                            <button className="rounded-full border border-gold px-3.5 py-1.5 text-xs font-bold text-gold-dark hover:bg-gold hover:text-ink">
                              🧾 Emitir fatura
                            </button>
                          </form>
                        );
                      return (
                        <span className="flex shrink-0 items-center gap-1.5">
                          <a
                            href={doc.fatura_ix_pdf || doc.fatura_ix_url || "#"}
                            target="_blank"
                            rel="noopener"
                            className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-grey hover:bg-cream"
                            title={doc.fatura_ix_estado === "final" ? "Fatura emitida" : "Rascunho no InvoiceXpress"}
                          >
                            🧾 {doc.fatura_ix_numero || (doc.fatura_ix_estado === "final" ? "fatura" : "rascunho")} ↗
                          </a>
                          {doc.recibo_ix_url ? (
                            <a
                              href={doc.recibo_ix_url}
                              target="_blank"
                              rel="noopener"
                              className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-good hover:bg-cream"
                            >
                              recibo ↗
                            </a>
                          ) : null}
                          {doc.nc_ix_url ? (
                            <a
                              href={doc.nc_ix_url}
                              target="_blank"
                              rel="noopener"
                              className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-warn hover:bg-cream"
                            >
                              NC ↗
                            </a>
                          ) : null}
                          {doc.fatura_ix_estado === "final" ? (
                            <>
                              <form action={enviarFaturaEmailIX}>
                                <input type="hidden" name="cliente_id" value={a.cliente_id} />
                                <input type="hidden" name="fatura_ix_id" value={doc.fatura_ix_id ?? ""} />
                                <button
                                  className="rounded-full border border-line px-2.5 py-1.5 text-xs font-bold text-grey hover:bg-cream"
                                  title="Enviar a fatura ao cliente por email (via InvoiceXpress)"
                                >
                                  📧
                                </button>
                              </form>
                              {!doc.nc_ix_url ? (
                                <form action={criarNotaCreditoIX}>
                                  <input type="hidden" name="cliente_id" value={a.cliente_id} />
                                  <input type="hidden" name="mes" value={mes} />
                                  <input type="hidden" name="tipo" value="avenca" />
                                  <button
                                    className="rounded-full border border-line px-2.5 py-1.5 text-xs font-bold text-soft hover:bg-cream"
                                    title="Criar nota de crédito (rascunho) para corrigir esta fatura"
                                  >
                                    ↩️
                                  </button>
                                </form>
                              ) : null}
                            </>
                          ) : null}
                        </span>
                      );
                    })()
                  ) : null}
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

      {/* Mapa de faturas por regularizar — conta InvoiceXpress inteira */}
      {pendentesIX ? (
        <section className="rounded-xl border border-line bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold">Por regularizar no InvoiceXpress</h2>
            {pendentes.length > 0 ? (
              <p className="text-sm">
                <span className="font-display text-xl font-extrabold text-bad tabular-nums">{euros(totalPendente)}</span>
                <span className="ml-2 text-xs text-grey">
                  em {pendentes.length} fatura{pendentes.length === 1 ? "" : "s"}
                  {vencidas.length > 0 ? ` · ${vencidas.length} vencida${vencidas.length === 1 ? "" : "s"}` : ""}
                </span>
              </p>
            ) : null}
          </div>
          {!pendentesIX.ok ? (
            <p className="mt-2 text-sm text-soft">Não consegui ler o InvoiceXpress agora ({pendentesIX.erro}). Tenta recarregar.</p>
          ) : pendentes.length === 0 ? (
            <p className="mt-2 text-sm font-bold text-good">✓ Não há faturas por regularizar. Tudo em dia. 🖐️</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-grey">
                    <th className="py-1.5 pr-3 font-bold">Documento</th>
                    <th className="py-1.5 pr-3 font-bold">Cliente</th>
                    <th className="py-1.5 pr-3 font-bold">Vencimento</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Valor</th>
                    <th className="py-1.5 font-bold"></th>
                  </tr>
                </thead>
                <tbody>
                  {pendentes.map((d) => {
                    const atraso = diasAtraso(d.vencimento);
                    return (
                      <tr key={d.id} className="border-b border-line/50">
                        <td className="py-2 pr-3 font-bold">{d.numero ?? d.id}</td>
                        <td className="max-w-[16rem] truncate py-2 pr-3">{d.cliente}</td>
                        <td className={`py-2 pr-3 ${atraso > 0 ? "font-bold text-bad" : "text-grey"}`}>
                          {d.vencimento ?? "—"}
                          {atraso > 0 ? ` · há ${atraso} d` : ""}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{euros(d.total)}</td>
                        <td className="py-2 text-right">
                          <span className="flex items-center justify-end gap-1.5">
                            {d.permalink ? (
                              <a href={d.permalink} target="_blank" rel="noopener" className="text-xs font-bold text-gold-dark hover:underline">
                                ver ↗
                              </a>
                            ) : null}
                            <form action={criarReciboLivre}>
                              <input type="hidden" name="fatura_id" value={d.id} />
                              <input type="hidden" name="valor" value={d.total} />
                              <button
                                className="rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-good hover:bg-cream"
                                title="Recebi — criar recibo do valor total"
                              >
                                💶 recibo
                              </button>
                            </form>
                            <form action={enviarFaturaEmailLivre}>
                              <input type="hidden" name="fatura_id" value={d.id} />
                              <input type="hidden" name="cliente_nome" value={d.cliente} />
                              <button
                                className="rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-grey hover:bg-cream"
                                title="Enviar a fatura por email ao contacto principal da ficha"
                              >
                                📧
                              </button>
                            </form>
                            <form action={criarNotaCreditoLivre}>
                              <input type="hidden" name="fatura_id" value={d.id} />
                              <input type="hidden" name="valor" value={d.total} />
                              <input type="hidden" name="cliente_nome" value={d.cliente} />
                              <input type="hidden" name="numero" value={d.numero ?? ""} />
                              <button
                                className="rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-soft hover:bg-cream"
                                title="Criar nota de crédito (rascunho) desta fatura"
                              >
                                ↩️ NC
                              </button>
                            </form>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
