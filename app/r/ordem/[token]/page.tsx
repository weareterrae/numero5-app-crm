import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { criarClienteServico } from "@/lib/supabase/server";
import { Simbolo } from "@/components/marca/Simbolo";
import { euros, dataCurta } from "@/lib/dominio/metricas";
import { totalOrdem } from "@/lib/dominio/operacao";
import { idiomaDe } from "@/lib/dominio/intake";
import { DecisaoOrdem } from "@/components/propostas/DecisaoOrdem";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const TX = {
  pt: {
    eyebrow: "ordem de alteração",
    trabalho: "O trabalho",
    origem: "Pedido feito via",
    impacto: "Impacto",
    prazo: "Prazo",
    investimento: "Investimento",
    iva: "com IVA incluído",
    aceite: "Aceitaste esta ordem. Vamos a isto! 🖐️",
    recusada: "Recusaste esta ordem. Sem problema — falamos.",
    esclarecimento: "Recebemos a tua dúvida. Respondemos em breve.",
    produzida: "Este trabalho já foi produzido.",
    faturada: "Este trabalho já foi faturado.",
    rodape: "Só entra em produção depois de a aceitares.",
  },
  en: {
    eyebrow: "change order",
    trabalho: "The work",
    origem: "Requested via",
    impacto: "Impact",
    prazo: "Deadline",
    investimento: "Investment",
    iva: "VAT included",
    aceite: "You accepted this order. Let's go! 🖐️",
    recusada: "You declined this order. No problem — let's talk.",
    esclarecimento: "We got your question. We'll reply shortly.",
    produzida: "This work has been produced.",
    faturada: "This work has been invoiced.",
    rodape: "It only goes into production after you accept.",
  },
} as const;

export default async function OrdemPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = criarClienteServico();

  const { data: o } = await supabase
    .from("ordens_alteracao")
    .select("titulo, descricao, origem, impacto, prazo, preco, iva_pct, estado, cliente_id")
    .eq("token", token)
    .maybeSingle();
  if (!o) notFound();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("nome_marca, idioma")
    .eq("id", o.cliente_id)
    .maybeSingle();

  const idioma = idiomaDe(cliente?.idioma);
  const t = TX[idioma];
  const total = totalOrdem(o.preco, o.iva_pct);
  const decidir = o.estado === "enviada" || o.estado === "esclarecimento";

  const estadoMsg: Record<string, string> = {
    aceite: t.aceite,
    recusada: t.recusada,
    esclarecimento: t.esclarecimento,
    produzida: t.produzida,
    faturada: t.faturada,
  };

  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      <div className="mb-6 flex items-center gap-2">
        <Simbolo className="w-12" fundo="claro" titulo="Nº 5" />
        <span className="font-mono text-xs uppercase tracking-wide text-grey">{t.eyebrow}</span>
      </div>

      <div className="rounded-2xl border border-line bg-white p-6">
        <p className="rotulo">{cliente?.nome_marca}</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold">{o.titulo}</h1>
        {o.descricao && <p className="mt-2 text-sm text-grey">{o.descricao}</p>}

        <dl className="mt-4 space-y-1.5 text-sm">
          {o.origem && (
            <div className="flex justify-between gap-3">
              <dt className="text-grey">{t.origem}</dt>
              <dd>{o.origem}</dd>
            </div>
          )}
          {o.impacto && (
            <div className="flex justify-between gap-3">
              <dt className="text-grey">{t.impacto}</dt>
              <dd>{o.impacto}</dd>
            </div>
          )}
          {o.prazo && (
            <div className="flex justify-between gap-3">
              <dt className="text-grey">{t.prazo}</dt>
              <dd>{dataCurta(o.prazo)}</dd>
            </div>
          )}
        </dl>

        {o.preco != null && (
          <div className="mt-4 rounded-xl bg-ink p-4 text-cream">
            <p className="text-xs text-soft">{t.investimento}</p>
            <p className="font-display text-3xl font-extrabold text-gold">{euros(total)}</p>
            <p className="text-xs text-soft">{t.iva}</p>
          </div>
        )}

        {decidir ? (
          <DecisaoOrdem token={token} idioma={idioma} />
        ) : (
          <p className="mt-5 rounded-lg bg-cream p-3 text-sm font-bold">
            {estadoMsg[o.estado] ?? o.estado}
          </p>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-soft">{t.rodape}</p>
    </main>
  );
}
