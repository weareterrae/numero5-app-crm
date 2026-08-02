import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { listarImpostosIX, invoicexpressConfigurado } from "@/lib/faturacao/invoicexpress";
import { emitirFaturaLivre } from "../acoes";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-gold";
const lab = "mb-1 block text-[11px] font-bold text-grey";

export default async function EmitirFatura({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const supabase = await criarClienteServidor();

  const [{ data: clientes }, impostos] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nome_marca, empresa_fiscal, nif")
      .in("estado", ["cliente", "proposta", "diagnostico", "lead", "reuniao"])
      .order("nome_marca"),
    listarImpostosIX(),
  ]);

  if (!invoicexpressConfigurado()) {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-2xl font-extrabold">Emitir documento</h1>
        <p className="mt-3 rounded-xl border border-line bg-white p-5 text-sm text-grey">
          O InvoiceXpress ainda não está configurado (variáveis no Netlify).
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <Link href="/faturacao" className="text-xs font-bold text-gold-dark">
          ← Faturação
        </Link>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Emitir fatura</h1>
        <p className="mt-1 text-sm text-grey">
          Fatura o que quiseres, a quem quiseres — sem sair da app. Emitir atribui o número legal
          (irreversível; corrige-se com nota de crédito).
        </p>
      </div>

      {erro ? (
        <p className="rounded-xl border-2 border-bad/40 bg-bad/5 px-4 py-3 text-sm font-bold text-bad">
          {erro === "dados"
            ? "Faltam dados: escolhe o cliente (ou escreve o nome) e preenche descrição e valor."
            : erro === "cliente"
              ? "Não encontrei essa ficha de cliente."
              : `O InvoiceXpress recusou: ${erro}`}
        </p>
      ) : null}

      <form action={emitirFaturaLivre} className="space-y-4 rounded-xl border border-line bg-white p-5">
        <div>
          <label className={lab}>Cliente (ficha)</label>
          <select name="cliente_id" className={inp} defaultValue="">
            <option value="">— outro (preencher à mão) —</option>
            {(clientes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.empresa_fiscal || c.nome_marca}
                {c.nif ? ` · NIF ${c.nif}` : " · sem NIF na ficha"}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-soft">
            Usa os dados fiscais da ficha (empresa, NIF, morada). Sem ficha, preenche em baixo.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={lab}>Nome (se sem ficha)</label>
            <input name="nome_manual" className={inp} placeholder="Nome fiscal do cliente" />
          </div>
          <div>
            <label className={lab}>NIF (se sem ficha)</label>
            <input name="nif_manual" className={inp} placeholder="123456789" />
          </div>
        </div>

        <div>
          <label className={lab}>Descrição do serviço *</label>
          <input name="descricao" required className={inp} placeholder="Ex.: Acompanhamento de marketing — agosto 2026" />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={lab}>Valor (sem IVA) *</label>
            <input name="valor" required inputMode="decimal" className={inp} placeholder="600" />
          </div>
          <div>
            <label className={lab}>IVA</label>
            <select name="iva" className={inp} defaultValue="IVA23">
              {(impostos.length ? impostos : [{ name: "IVA23", value: 23 }]).map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({t.value}%)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={lab}>Vencimento (dias)</label>
            <input name="vencimento_dias" inputMode="numeric" className={inp} defaultValue="15" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="rascunho" value="1" className="accent-gold" />
          Deixar em rascunho (rever no InvoiceXpress antes de emitir)
        </label>

        <button className="rounded-full bg-gold px-6 py-2.5 text-sm font-bold text-ink hover:brightness-105">
          🧾 Emitir fatura
        </button>
      </form>

      <p className="text-xs text-soft">
        O documento aparece logo no mapa «Por regularizar», na conta corrente do cliente e na Sede
        dele. O recibo cria-se com um clique quando receberes.
      </p>
    </div>
  );
}
