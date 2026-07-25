import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { criarClienteServico } from "@/lib/supabase/server";
import { Simbolo } from "@/components/marca/Simbolo";
import { vereditoSite } from "@/lib/dominio/diagnostico/pontuacao";
import { OBJETIVOS } from "@/lib/dominio/diagnostico/recomendacoes";
import { idiomaDe } from "@/lib/dominio/intake";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const ICONE: Record<string, string> = { ok: "✅", warn: "⚠️", bad: "❌" };

const TX = {
  pt: {
    eyebrow: "Raio-X 360 · por Nº 5",
    relatorio: "Relatório",
    temHoje: "o que tens hoje",
    pontoPartida: "O ponto de partida",
    labels: [["site", "Site"], ["redes", "Redes sociais"], ["presenca", "Presença"], ["ferramentas", "Ferramentas"]] as [string, string][],
    siteE: "o site, por dentro",
    siteH: "O que encontrámos",
    redesE: "as redes",
    redesH: "Como está cada canal",
    quereE: "o que queres",
    quereH: "Onde queres chegar",
    ajudaE: "onde entramos",
    ajudaH: "Onde a Nº 5 pode ajudar",
    fecho: "Damos cá cinco? 🖐️",
    garantia:
      "A nossa garantia de honestidade: se não encontrarmos pelo menos 3 coisas concretas para melhorar, dizemos-te na hora — e não avançamos.",
    footer:
      "Raio-X preliminar, a partir da informação pública disponível. As avaliações das redes refletem a análise da equipa Nº 5. Não constitui garantia de resultados. · Nº 5, marca operada por Os Caetanos, Lda · NIF 504428918",
  },
  en: {
    eyebrow: "360 X-ray · by Nº 5",
    relatorio: "Report",
    temHoje: "what you have today",
    pontoPartida: "The starting point",
    labels: [["site", "Website"], ["redes", "Social media"], ["presenca", "Presence"], ["ferramentas", "Tools"]] as [string, string][],
    siteE: "the site, inside",
    siteH: "What we found",
    redesE: "the socials",
    redesH: "How each channel is doing",
    quereE: "what you want",
    quereH: "Where you want to get to",
    ajudaE: "where we come in",
    ajudaH: "Where Nº 5 can help",
    fecho: "High five? 🖐️",
    garantia:
      "Our honesty guarantee: if we can't find at least 3 concrete things to improve, we'll tell you on the spot — and we won't proceed.",
    footer:
      "Preliminary X-ray, based on publicly available information. Social assessments reflect the Nº 5 team's analysis. Not a guarantee of results. · Nº 5, a brand operated by Os Caetanos, Lda · NIF 504428918",
  },
};

export default async function RelatorioPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Página pública: lida no servidor com service_role, filtrada pelo token.
  const supabase = criarClienteServico();
  const { data: d } = await supabase
    .from("diagnosticos")
    .select("*, clientes(nome_marca, setor)")
    .eq("partilha_token", token)
    .eq("partilha_ativa", true)
    .maybeSingle();

  if (!d) notFound();

  const cliente = (Array.isArray(d.clientes) ? d.clientes[0] : d.clientes) as {
    nome_marca: string;
    setor: string | null;
  } | null;

  const { data: idiomaRow } = await supabase
    .from("clientes")
    .select("idioma")
    .eq("id", d.cliente_id)
    .maybeSingle();
  const idioma = idiomaDe(idiomaRow?.idioma);
  const t = TX[idioma];

  const resultados = (d.site_resultado ?? []) as {
    codigo: string;
    titulo?: string;
    estado: string;
    detalhe: string;
    dica?: string;
  }[];
  const redes = (d.redes_scorecard ?? []) as { nome: string; notas: (number | null)[] }[];
  const recs = (d.recomendacoes ?? []) as {
    titulo: string;
    descricao: string;
    prioridade: number;
    origem: string;
  }[];
  const objetivos = (d.objetivos ?? {}) as { selecionados?: string[]; texto_livre?: string };
  const atual = (d.estado_atual ?? {}) as Record<string, string>;

  const rotuloObjetivo = (c: string) =>
    OBJETIVOS.find(([k]) => k === c)?.[idioma === "en" ? 2 : 1] ?? c;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      {/* Cabeçalho */}
      <header className="rounded-2xl bg-ink px-8 py-9 text-cream">
        <Simbolo fundo="escuro" className="mb-5 w-16" titulo="Nº 5" />
        <p className="rotulo !text-gold">{t.eyebrow}</p>
        <h1 className="mt-1.5 font-display text-4xl font-extrabold tracking-tight">
          {cliente?.nome_marca ?? t.relatorio}
        </h1>
        {cliente?.setor && <p className="mt-1 font-mono text-xs text-soft">{cliente.setor}</p>}
        {d.site_score !== null && (
          <div className="mt-6 flex items-center gap-4">
            <span className="font-display text-6xl font-extrabold leading-none text-gold">
              {d.site_score}
              <span className="text-2xl text-soft">/10</span>
            </span>
            <span className="text-[15px]">{vereditoSite(Number(d.site_score))}</span>
          </div>
        )}
      </header>

      {/* O que tem hoje */}
      {Object.values(atual).some(Boolean) && (
        <section className="mt-8">
          <p className="rotulo">{t.temHoje}</p>
          <h2 className="mb-3 font-display text-2xl font-extrabold">{t.pontoPartida}</h2>
          <dl className="rounded-xl border border-line bg-white p-5">
            {t.labels.map(([k, label]) =>
              atual[k] ? (
                <div key={k} className="border-b border-line/60 py-2 last:border-0">
                  <dt className="text-xs font-bold text-grey">{label}</dt>
                  <dd className="text-sm">{atual[k]}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </section>
      )}

      {/* O site */}
      {resultados.length > 0 && (
        <section className="mt-8">
          <p className="rotulo">{t.siteE}</p>
          <h2 className="mb-3 font-display text-2xl font-extrabold">{t.siteH}</h2>
          <ul className="rounded-xl border border-line bg-white p-5">
            {resultados.map((r) => (
              <li key={r.codigo} className="flex gap-2.5 border-b border-line/60 py-2.5 last:border-0">
                <span>{ICONE[r.estado] ?? "•"}</span>
                <div className="text-sm">
                  <b>{r.titulo ?? r.codigo}</b> — {r.detalhe}
                  {r.dica && <p className="text-xs text-grey">→ {r.dica}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Redes */}
      {redes.length > 0 && (
        <section className="mt-8">
          <p className="rotulo">{t.redesE}</p>
          <h2 className="mb-3 font-display text-2xl font-extrabold">{t.redesH}</h2>
          <div className="rounded-xl border border-line bg-white p-5">
            {redes.map((r) => {
              const dadas = r.notas.filter((n): n is number => n !== null);
              const nota = dadas.length
                ? Math.round((dadas.reduce((a, b) => a + b, 0) / (dadas.length * 2)) * 10)
                : null;
              return (
                <div key={r.nome} className="flex items-center gap-3 border-b border-line/60 py-2.5 last:border-0">
                  <span className="w-36 text-sm font-bold">{r.nome}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                    <span
                      className="block h-full rounded-full bg-gold"
                      style={{ width: `${(nota ?? 0) * 10}%` }}
                    />
                  </span>
                  <span className="w-12 text-right font-mono text-sm">
                    {nota === null ? "—" : `${nota}/10`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Objetivos */}
      {(objetivos.selecionados?.length || objetivos.texto_livre) && (
        <section className="mt-8">
          <p className="rotulo">{t.quereE}</p>
          <h2 className="mb-3 font-display text-2xl font-extrabold">{t.quereH}</h2>
          <div className="rounded-xl border border-line bg-white p-5">
            <div className="flex flex-wrap gap-1.5">
              {objetivos.selecionados?.map((o) => (
                <span key={o} className="rounded-full bg-gold/20 px-3 py-1 text-xs font-bold text-gold-dark">
                  {rotuloObjetivo(o)}
                </span>
              ))}
            </div>
            {objetivos.texto_livre && <p className="mt-3 text-sm">{objetivos.texto_livre}</p>}
          </div>
        </section>
      )}

      {/* Onde ajudamos */}
      {recs.length > 0 && (
        <section className="mt-8">
          <p className="rotulo">{t.ajudaE}</p>
          <h2 className="mb-3 font-display text-2xl font-extrabold">{t.ajudaH}</h2>
          <div className="rounded-xl border-2 border-gold bg-gold/5 p-5">
            {recs.map((r, i) => (
              <div key={i} className="border-b border-gold/20 py-3 last:border-0">
                <b className="text-[15px]">{r.titulo}</b>
                <p className="text-sm text-grey">{r.descricao}</p>
                <p className="mt-1 text-[11px] text-soft">{r.origem}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8 rounded-2xl bg-ink px-8 py-9 text-center text-cream">
        <p className="font-display text-2xl font-extrabold">{t.fecho}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-soft">{t.garantia}</p>
        <p className="mt-5 inline-block rounded-full bg-gold px-6 py-3 font-bold text-ink">
          numerocinco.pt · giveme5@numerocinco.pt
        </p>
      </section>

      <footer className="mt-6 text-center text-[11px] text-soft">{t.footer}</footer>
    </main>
  );
}
