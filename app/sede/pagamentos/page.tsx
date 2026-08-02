import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServico } from "@/lib/supabase/server";
import { mesLegivel } from "@/lib/dominio/producao";
import { euros } from "@/lib/dominio/metricas";
import { extratoClienteIX, classificarDoc, diasAtraso } from "@/lib/faturacao/invoicexpress";

export const dynamic = "force-dynamic";

export default async function SedePagamentos() {
  const ctx = await contextoSede();

  if (!ctx.clienteId) {
    return (
      <div>
        <h1 className="font-display text-2xl font-extrabold">Pagamentos</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          A tua conta corrente aparece aqui assim que houver movimentos. 🖐️
        </p>
      </div>
    );
  }

  const svc = criarClienteServico();
  const { data: lista } = await svc
    .from("cobrancas")
    .select("id, mes, descricao, valor, estado, cobrado_em")
    .eq("cliente_id", ctx.clienteId)
    .order("mes", { ascending: false });
  const cobrancas = (lista ?? []) as {
    id: string;
    mes: string;
    descricao: string | null;
    valor: number;
    estado: string;
    cobrado_em: string | null;
  }[];

  // Extrato completo no InvoiceXpress (faturas, recibos, NC) — pelo nome fiscal.
  const { data: fichaFiscal } = await svc
    .from("clientes")
    .select("nome_marca, empresa_fiscal")
    .eq("id", ctx.clienteId)
    .maybeSingle();
  const nomeIX = (fichaFiscal?.empresa_fiscal || fichaFiscal?.nome_marca || "").trim();
  const ext = await extratoClienteIX(nomeIX);

  // Documentos fiscais (0060) — consulta à parte e tolerante.
  const docsDe = new Map<string, { numero: string | null; faturaPdf: string | null; reciboPdf: string | null }>();
  {
    const { data: docs } = await svc
      .from("cobrancas")
      .select("id, fatura_ix_numero, fatura_ix_pdf, recibo_ix_pdf")
      .eq("cliente_id", ctx.clienteId)
      .then((r) => r, () => ({ data: null }));
    for (const d of (docs ?? []) as { id: string; fatura_ix_numero: string | null; fatura_ix_pdf: string | null; recibo_ix_pdf: string | null }[])
      docsDe.set(d.id, { numero: d.fatura_ix_numero, faturaPdf: d.fatura_ix_pdf, reciboPdf: d.recibo_ix_pdf });
  }

  const porRegularizar = cobrancas
    .filter((c) => c.estado !== "cobrado")
    .reduce((s, c) => s + (Number(c.valor) || 0), 0);

  return (
    <div className="max-w-2xl">
      <div className="rotulo">a tua conta</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Pagamentos</h1>
      <p className="mt-1 text-sm text-grey">
        O histórico da tua conta com o Nº 5 — com as faturas e recibos prontos a descarregar. 🖐️
      </p>

      {cobrancas.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Ainda não há movimentos registados.
        </p>
      ) : (
        <>
          {porRegularizar > 0 ? (
            <div className="mt-6 rounded-xl border-2 border-warn/40 bg-warn/5 px-4 py-3 text-sm">
              <b className="text-warn">Por regularizar: {euros(porRegularizar)}</b>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border-2 border-good/40 bg-good/5 px-4 py-3 text-sm font-bold text-good">
              ✓ Está tudo em dia. Obrigado! 🖐️
            </div>
          )}

          <ul className="mt-4 space-y-2">
            {cobrancas.map((c) => {
              const pago = c.estado === "cobrado";
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl border border-line bg-white px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{c.descricao || "Serviços Nº 5"}</p>
                    <p className="text-xs text-grey">
                      {mesLegivel(c.mes, "pt")}
                      {docsDe.get(c.id)?.numero ? ` · ${docsDe.get(c.id)!.numero}` : ""}
                    </p>
                    {(docsDe.get(c.id)?.faturaPdf || docsDe.get(c.id)?.reciboPdf) ? (
                      <p className="mt-0.5 flex gap-3 text-[11px] font-bold">
                        {docsDe.get(c.id)?.faturaPdf ? (
                          <a href={docsDe.get(c.id)!.faturaPdf!} target="_blank" rel="noopener" className="text-gold-dark hover:underline">
                            ⬇ fatura (PDF)
                          </a>
                        ) : null}
                        {docsDe.get(c.id)?.reciboPdf ? (
                          <a href={docsDe.get(c.id)!.reciboPdf!} target="_blank" rel="noopener" className="text-gold-dark hover:underline">
                            ⬇ recibo (PDF)
                          </a>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <span className="numero w-24 text-right text-sm">{euros(c.valor)}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      pago ? "bg-good/15 text-good" : "bg-warn/15 text-warn"
                    }`}
                  >
                    {pago ? "pago ✓" : "por regularizar"}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Todos os documentos de faturação (InvoiceXpress) */}
      {ext.docs.length > 0 ? (
        <section className="mt-8">
          <div className="rotulo">os teus documentos</div>
          <h2 className="mt-1 font-display text-xl font-extrabold">Faturas e recibos</h2>
          <p className="mt-0.5 text-xs text-grey">
            Todos os documentos emitidos — abre cada um para veres e descarregares o PDF.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className={`rounded-xl border-2 p-4 ${ext.pendente > 0 ? "border-warn/40 bg-warn/5" : "border-good/40 bg-good/5"}`}>
              <p className={`numero text-2xl ${ext.pendente > 0 ? "text-warn" : "text-good"}`}>{euros(ext.pendente)}</p>
              <p className="text-[11px] font-bold text-grey">por regularizar</p>
            </div>
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="numero text-2xl text-good">{euros(ext.pago)}</p>
              <p className="text-[11px] font-bold text-grey">pago — obrigado! 🖐️</p>
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {ext.docs.map((d) => {
              const classe = classificarDoc(d);
              const atraso = classe === "fatura_pendente" ? diasAtraso(d.vencimento) : 0;
              const pill =
                classe === "nc"
                  ? ["bg-warn/15 text-warn", "nota de crédito"]
                  : classe === "recibo"
                    ? ["bg-good/15 text-good", "recibo ✓"]
                    : classe === "fatura_paga"
                      ? ["bg-good/15 text-good", "paga ✓"]
                      : ["bg-warn/15 text-warn", atraso > 0 ? `vencida há ${atraso} d` : "por regularizar"];
              return (
                <li key={`${d.tipo}-${d.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-white px-5 py-3">
                  <span className="text-lg">{classe === "recibo" ? "🧾" : classe === "nc" ? "↩️" : "📄"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {classe === "nc" ? "NC " : classe === "recibo" ? "Recibo " : "Fatura "}
                      {d.numero ?? d.id}
                    </p>
                    <p className="text-[11px] text-soft">{d.data ?? ""}</p>
                  </div>
                  <span className="numero text-sm">{classe === "nc" ? "−" : ""}{euros(d.total)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${pill[0]}`}>{pill[1]}</span>
                  {d.permalink ? (
                    <a href={d.permalink} target="_blank" rel="noopener" className="text-sm font-bold text-gold-dark hover:underline">
                      abrir ↗
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
