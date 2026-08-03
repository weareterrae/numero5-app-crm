import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { criarClienteServico } from "@/lib/supabase/server";
import { Simbolo } from "@/components/marca/Simbolo";
import { mesLegivel } from "@/lib/dominio/producao";
import { idiomaDe } from "@/lib/dominio/intake";
import { AnunciosDoMes } from "@/components/ads/AnunciosDoMes";
import { lerResultados } from "@/lib/metricas/ler";
import { ResultadosMes } from "@/components/metricas/ResultadosMes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const TX = {
  pt: { eyebrow: "o teu mês em números", relatorio: "Relatório", aPreparar: "O relatório está a ser preparado." },
  en: { eyebrow: "your month in numbers", relatorio: "Report", aPreparar: "The report is being prepared." },
};

export default async function RelatorioMensalPublico({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = criarClienteServico();

  const { data: relatorio } = await supabase
    .from("relatorios")
    .select("*, clientes(nome_marca)")
    .eq("partilha_token", token)
    .eq("partilha_ativa", true)
    .maybeSingle();
  if (!relatorio) notFound();

  // Deixa saber que o cliente abriu (uma vez).
  if (!relatorio.visto_em) {
    await supabase
      .from("relatorios")
      .update({ visto_em: new Date().toISOString() })
      .eq("id", relatorio.id);
  }

  const cliente = (Array.isArray(relatorio.clientes) ? relatorio.clientes[0] : relatorio.clientes) as {
    nome_marca: string;
  } | null;

  const { data: idiomaRow } = await supabase
    .from("clientes")
    .select("idioma")
    .eq("id", relatorio.cliente_id)
    .maybeSingle();
  const idioma = idiomaDe(idiomaRow?.idioma);
  const t = TX[idioma];

  // Org (marca) ligada a este cliente → resultados de anúncios do mês (0061, tolerante).
  let contaAds: string | null = null;
  {
    const { data } = await supabase
      .from("orgs")
      .select("meta_ads_id")
      .eq("cliente_id", relatorio.cliente_id)
      .not("meta_ads_id", "is", null)
      .limit(1)
      .maybeSingle()
      .then((r) => r, () => ({ data: null }));
    contaAds = (data as { meta_ads_id?: string | null } | null)?.meta_ads_id ?? null;
  }

  const resultados = await lerResultados(supabase, relatorio.cliente_id);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="rounded-2xl bg-ink px-8 py-9 text-cream">
        <Simbolo fundo="escuro" className="mb-5 w-16" titulo="Nº 5" />
        <p className="rotulo !text-gold">{t.eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight tracking-tight">
          {relatorio.titulo || cliente?.nome_marca || t.relatorio}
        </h1>
        <p className="mt-2 text-[15px] text-soft">
          {cliente?.nome_marca ? `${cliente.nome_marca} · ` : ""}
          {mesLegivel(relatorio.mes, idioma)} 🖐️
        </p>
      </header>

      {relatorio.conteudo_html?.trim() ? (
        <div
          className="prose-plano mt-6 overflow-x-auto rounded-2xl border border-line bg-white p-6"
          dangerouslySetInnerHTML={{ __html: relatorio.conteudo_html }}
        />
      ) : (
        <p className="mt-6 text-center text-sm text-soft">{t.aPreparar}</p>
      )}

      {resultados ? (
        <div className="mt-6">
          <ResultadosMes d={resultados} />
        </div>
      ) : null}

      <AnunciosDoMes contaId={contaAds} mesISO={relatorio.mes} />

      <footer className="mt-6 text-center text-[11px] text-soft">
        Nº 5 · marca operada por Os Caetanos, Lda · NIF 504428918
      </footer>
    </main>
  );
}
