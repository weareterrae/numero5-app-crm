import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { criarClienteServico } from "@/lib/supabase/server";
import { Simbolo } from "@/components/marca/Simbolo";
import { mesLegivel } from "@/lib/dominio/producao";
import { DecisaoPlano } from "@/components/planos/DecisaoPlano";
import { idiomaDe } from "@/lib/dominio/intake";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const TX = {
  pt: { eyebrow: "plano de publicações", plano: "Plano", aPreparar: "O plano está a ser preparado." },
  en: { eyebrow: "publishing plan", plano: "Plan", aPreparar: "The plan is being prepared." },
};

export default async function PlanoPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = criarClienteServico();

  const { data: plano } = await supabase
    .from("planos")
    .select("*, clientes(nome_marca)")
    .eq("partilha_token", token)
    .eq("partilha_ativa", true)
    .maybeSingle();
  if (!plano) notFound();

  const cliente = (Array.isArray(plano.clientes) ? plano.clientes[0] : plano.clientes) as {
    nome_marca: string;
  } | null;

  const { data: idiomaRow } = await supabase
    .from("clientes")
    .select("idioma")
    .eq("id", plano.cliente_id)
    .maybeSingle();
  const idioma = idiomaDe(idiomaRow?.idioma);
  const t = TX[idioma];

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="rounded-2xl bg-ink px-8 py-9 text-cream">
        <Simbolo fundo="escuro" className="mb-5 w-16" titulo="Nº 5" />
        <p className="rotulo !text-gold">{t.eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight tracking-tight">
          {plano.titulo || cliente?.nome_marca || t.plano}
        </h1>
        <p className="mt-2 text-[15px] text-soft">
          {cliente?.nome_marca ? `${cliente.nome_marca} · ` : ""}
          {mesLegivel(plano.mes, idioma)} 🖐️
        </p>
      </header>

      {plano.conteudo_html?.trim() ? (
        <div
          className="prose-plano mt-6 overflow-x-auto rounded-2xl border border-line bg-white p-6"
          dangerouslySetInnerHTML={{ __html: plano.conteudo_html }}
        />
      ) : (
        <p className="mt-6 text-center text-sm text-soft">{t.aPreparar}</p>
      )}

      <div className="mt-6">
        <DecisaoPlano token={token} estado={plano.estado} idioma={idioma} />
      </div>

      <footer className="mt-6 text-center text-[11px] text-soft">
        Nº 5 · marca operada por Os Caetanos, Lda · NIF 504428918
      </footer>
    </main>
  );
}
