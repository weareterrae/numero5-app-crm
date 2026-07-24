import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { criarClienteServico } from "@/lib/supabase/server";
import { Simbolo } from "@/components/marca/Simbolo";
import { DecisaoProposta } from "@/components/propostas/DecisaoProposta";
import { euros } from "@/lib/dominio/metricas";
import { calcular, normalizarEscopo, type Preco } from "@/lib/dominio/orcamento";
import type { ConteudoProposta } from "@/lib/ia/prompts/proposta";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const METODO = [
  ["Ouvir", "Percebemos o negócio, o cliente e o que já tentaste. Sem isto, é tudo palpite."],
  ["Montar", "Estratégia, mensagem e as peças no sítio. A casa em ordem antes de fazer barulho."],
  ["Publicar", "Conteúdo com constância. A IA acelera; a decisão e o «publicar» são sempre de uma pessoa."],
  ["Medir", "Números reais, todos os meses. O que resulta, reforça-se. O que não, corta-se."],
];

export default async function PropostaPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = criarClienteServico();

  const { data: p } = await supabase
    .from("propostas")
    .select("*, clientes(nome_marca, setor), pacotes(nome, tagline)")
    .eq("partilha_token", token)
    .eq("partilha_ativa", true)
    .maybeSingle();
  if (!p) notFound();

  const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const cliente = um(p.clientes) as { nome_marca: string; setor: string | null } | null;
  const pacote = um(p.pacotes) as { nome: string; tagline: string | null } | null;
  const c = (p.conteudo ?? {}) as Partial<ConteudoProposta>;
  const ambito = (p.ambito ?? []) as string[];

  // Duplo investimento: o que o cliente pediu vs. a nossa recomendação.
  const { data: precos } = await supabase
    .from("precos_unitarios")
    .select("chave, rotulo, tipo, unidade, preco, minutos")
    .eq("ativo", true);
  // Casos a mostrar — a prova do que já fizemos, pela ordem escolhida.
  const chavesCasos = (p.casos ?? []) as string[];
  let casos: {
    chave: string;
    marca: string;
    o_que: string;
    resultado: string | null;
    imagem_url: string | null;
    link: string | null;
    link_redes: string | null;
  }[] = [];
  if (chavesCasos.length) {
    const { data } = await supabase
      .from("casos")
      .select("chave, marca, o_que, resultado, imagem_url, link, link_redes")
      .in("chave", chavesCasos);
    casos = (data ?? []).sort(
      (a, b) => chavesCasos.indexOf(a.chave) - chavesCasos.indexOf(b.chave),
    );
  }

  const pedido = normalizarEscopo(p.escopo_pedido ?? {});
  const orcPedido = calcular(pedido, (precos ?? []) as Preco[]);
  const temPedido = orcPedido.totalMensal > 0 || orcPedido.totalSetup > 0;
  const nossoMensal = Number(p.avenca_valor) || 0;
  const nossoSetup = Number(p.setup_valor) || 0;
  const poupancaMensal = temPedido ? orcPedido.totalMensal - nossoMensal : 0;
  // Linhas a mostrar na comparação: se QUALQUER dos lados tiver esse valor.
  const temMensal = orcPedido.totalMensal > 0 || nossoMensal > 0;
  const temSetup = orcPedido.totalSetup > 0 || nossoSetup > 0;
  // A comparação só aparece se o comercial a ligou. Por defeito: valor único.
  const comparar = !!p.mostrar_comparacao && temPedido;

  const paras = (t?: string) =>
    (t ?? "")
      .split(/\n\n+/)
      .map((x) => x.trim())
      .filter(Boolean);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 print:py-0">
      <header className="rounded-t-2xl bg-ink px-8 py-10 text-cream print:rounded-none">
        <Simbolo fundo="escuro" className="mb-6 w-16" titulo="Nº 5" />
        <p className="rotulo !text-gold">Proposta{pacote ? ` · ${pacote.nome}` : ""}</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight tracking-tight">
          {cliente?.nome_marca ?? "Proposta"}
        </h1>
        <p className="mt-3 text-[15px] text-soft">
          Uma proposta do Nº 5 — o departamento de marketing das marcas que não têm um. 🖐️
        </p>
      </header>

      <div className="rounded-b-2xl border border-t-0 border-line bg-white px-8 py-9 print:rounded-none print:border-0">
        {c.abertura && (
          <section className="mb-8">
            <p className="rotulo">onde estás hoje</p>
            {paras(c.abertura).map((t, i) => (
              <p key={i} className="mt-2 text-[16px] leading-relaxed">
                {t}
              </p>
            ))}
          </section>
        )}

        {c.objetivo && (
          <section className="mb-8">
            <p className="rotulo">onde queremos chegar</p>
            <p className="mt-2 text-[16px] leading-relaxed">{c.objetivo}</p>
          </section>
        )}

        {!!c.prioridades?.length && (
          <section className="mb-8">
            <p className="rotulo">o que vamos resolver — e porquê</p>
            {c.prioridades.map((x, i) => (
              <div key={i} className="flex gap-4 border-b border-line/60 py-3.5 last:border-0">
                <span className="font-display text-2xl font-extrabold text-gold-dark">{i + 1}</span>
                <div>
                  <b className="text-[16px]">{x.titulo}</b>
                  <p className="mt-0.5 text-[15px] text-grey">{x.texto}</p>
                </div>
              </div>
            ))}
          </section>
        )}

        {!!c.construir?.length && (
          <section className="mb-8">
            <p className="rotulo">o que vamos construir para ti</p>
            <h2 className="mt-1 mb-3 font-display text-2xl font-extrabold">
              Não é conversa. É o que vais ter.
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {c.construir.map((x, i) => (
                <div key={i} className="rounded-xl border border-line bg-white p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gold/20 font-display text-sm font-extrabold text-gold-dark">
                      {i + 1}
                    </span>
                    <b className="text-[15px]">{x.titulo}</b>
                  </div>
                  <p className="text-sm text-grey">{x.texto}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {c.assistente?.nome && (
          <section className="mb-8">
            <div className="rounded-2xl bg-ink px-7 py-8 text-cream">
              <p className="rotulo !text-gold">o teu assistente, só teu</p>
              <h2 className="mt-1 font-display text-3xl font-extrabold text-gold">
                Conhece o {c.assistente.nome}
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-soft">{c.assistente.descricao}</p>
              <p className="mt-3 text-xs text-soft">
                O nome é a nossa sugestão — o definitivo escolhemo-lo contigo. Feito à medida da tua
                marca, nunca repetido noutra. 🖐️
              </p>
            </div>
          </section>
        )}

        {ambito.length > 0 && (
          <section className="mb-8">
            <p className="rotulo">o que vamos fazer</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold">
              {pacote?.nome}
              {pacote?.tagline && (
                <span className="ml-2 text-base font-normal text-gold-dark">· {pacote.tagline}</span>
              )}
            </h2>
            <ul className="mt-2">
              {ambito.map((a, i) => (
                <li key={i} className="border-b border-line/60 py-2.5 pl-7 text-[15px] last:border-0 relative">
                  <span className="absolute left-0">🖐️</span>
                  {a}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-8">
          <p className="rotulo">como trabalhamos</p>
          <h2 className="mt-1 mb-2 font-display text-2xl font-extrabold">Método em 4 tempos</h2>
          {METODO.map(([t, d], i) => (
            <div key={t} className="flex gap-4 border-b border-line/60 py-3 last:border-0">
              <span className="font-display text-2xl font-extrabold text-cobalt">{i + 1}</span>
              <div>
                <b className="text-[15px]">{t}</b>
                <p className="text-sm text-grey">{d}</p>
              </div>
            </div>
          ))}
        </section>

        {!!c.roadmap?.length && (
          <section className="mb-8">
            <p className="rotulo">o caminho</p>
            <h2 className="mt-1 mb-3 font-display text-2xl font-extrabold">Os primeiros 90 dias</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {c.roadmap.map((x, i) => (
                <div key={i} className="rounded-xl border border-line bg-white p-4">
                  <p className="font-mono text-xs font-bold uppercase tracking-wide text-cobalt">
                    {x.fase}
                  </p>
                  <b className="mt-1 block text-[15px]">{x.titulo}</b>
                  <p className="mt-1 text-sm text-grey">{x.texto}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {c.porque_n5 && (
          <section className="mb-8">
            <p className="rotulo">porquê o Nº 5</p>
            <p className="mt-2 text-[15px] leading-relaxed">{c.porque_n5}</p>
          </section>
        )}

        {casos.length > 0 && (
          <section className="mb-8">
            <p className="rotulo">o que já fizemos</p>
            <h2 className="mt-1 mb-3 font-display text-2xl font-extrabold">Não são promessas. É trabalho.</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {casos.map((caso) => (
                <div
                  key={caso.chave}
                  className="flex flex-col overflow-hidden rounded-xl border border-line bg-white"
                >
                  {caso.imagem_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={caso.imagem_url}
                      alt={caso.marca}
                      className="h-40 w-full object-cover object-top"
                    />
                  )}
                  <div className="flex flex-1 flex-col p-4">
                    <p className="font-display text-lg font-extrabold">{caso.marca}</p>
                    <p className="mt-1 flex-1 text-sm text-grey">{caso.o_que}</p>
                    {caso.resultado && (
                      <p className="mt-2 inline-block self-start rounded-full bg-cobalt/10 px-3 py-1 text-xs font-bold text-cobalt">
                        {caso.resultado}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {caso.link && (
                        <a
                          href={caso.link}
                          target="_blank"
                          rel="noopener"
                          className="rounded-full border border-gold-dark px-3 py-1.5 text-xs font-bold text-gold-dark hover:bg-gold hover:text-ink"
                        >
                          Ver o site ↗
                        </a>
                      )}
                      {caso.link_redes && (
                        <a
                          href={caso.link_redes}
                          target="_blank"
                          rel="noopener"
                          className="rounded-full border border-gold-dark px-3 py-1.5 text-xs font-bold text-gold-dark hover:bg-gold hover:text-ink"
                        >
                          Ver as redes ↗
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(p.setup_valor || p.avenca_valor) && (
          <section className="mb-8">
            <p className="rotulo">investimento</p>

            {comparar ? (
              // Duas colunas: o que pediste vs. a nossa recomendação.
              <>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-white px-6 py-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-grey">O que pediste</p>
                    {temMensal && (
                      <p className="mt-2 font-display text-2xl font-extrabold text-grey">
                        {orcPedido.totalMensal > 0 ? euros(orcPedido.totalMensal) : "—"}
                        <span className="text-sm font-normal">/mês</span>
                      </p>
                    )}
                    {temSetup && (
                      <p className="text-sm text-soft">
                        {orcPedido.totalSetup > 0 ? `setup ${euros(orcPedido.totalSetup)}` : "sem setup pedido"}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl bg-ink px-6 py-5 text-cream ring-2 ring-gold">
                    <p className="text-xs font-bold uppercase tracking-wide text-gold">
                      A nossa recomendação
                    </p>
                    {temMensal && (
                      <p className="mt-2 font-display text-3xl font-extrabold text-gold">
                        {nossoMensal > 0 ? euros(nossoMensal) : "—"}
                        <span className="text-base font-normal">/mês</span>
                      </p>
                    )}
                    {temSetup && (
                      <p className="text-sm text-soft">
                        {Number(p.setup_valor) > 0 ? `setup ${euros(p.setup_valor)}` : "sem setup"}
                      </p>
                    )}
                  </div>
                </div>
                {poupancaMensal > 0 && (
                  <p className="mt-3 rounded-lg bg-gold/10 px-4 py-3 text-[15px]">
                    Recomendamos <b>menos {euros(poupancaMensal)}/mês</b> do que pediste — não porque
                    cortámos, mas porque <b>focado rende mais</b>. Melhor estar bem onde importa do que
                    espalhado por todo o lado. 🖐️
                  </p>
                )}
                <p className="mt-2 text-xs text-soft">
                  {p.avenca_nota || "o motor a trabalhar todos os meses"}
                  {p.setup_nota ? ` · ${p.setup_nota}` : ""}. O número exato fecha-se contigo depois de
                  alinharmos o âmbito — sem surpresas, sem letras pequeninas.
                </p>
              </>
            ) : (
              // Coluna única (quando não houve pedido do cliente).
              <div className="mt-2 rounded-xl bg-ink px-7 py-6 text-cream">
                {p.setup_valor ? (
                  <div className="flex items-baseline justify-between gap-4 border-b border-white/10 py-2.5">
                    <div>
                      <p className="text-[15px]">Arranque</p>
                      <p className="text-xs text-soft">{p.setup_nota || "montar a base, uma só vez"}</p>
                    </div>
                    <span className="font-display text-2xl font-extrabold text-gold">
                      {euros(p.setup_valor)}
                    </span>
                  </div>
                ) : null}
                {p.avenca_valor ? (
                  <div className="flex items-baseline justify-between gap-4 py-2.5">
                    <div>
                      <p className="text-[15px]">Acompanhamento mensal</p>
                      <p className="text-xs text-soft">
                        {p.avenca_nota || "o motor a trabalhar todos os meses"}
                      </p>
                    </div>
                    <span className="font-display text-2xl font-extrabold text-gold">
                      {euros(p.avenca_valor)}
                    </span>
                  </div>
                ) : null}
                <p className="mt-3 text-xs text-soft">
                  O número exato fecha-se contigo depois de alinharmos o âmbito — sem surpresas, sem
                  letras pequeninas.
                </p>
              </div>
            )}
            <p className="mt-2 text-xs font-bold text-grey">
              Aos valores apresentados acresce IVA à taxa legal em vigor.
            </p>
          </section>
        )}

        {Number(p.avenca_valor) > 0 && (
          <section className="mb-8">
            <p className="rotulo">o ritmo, mês a mês</p>
            <h2 className="mt-1 mb-3 font-display text-2xl font-extrabold">Como trabalhamos, todos os meses</h2>
            <ol className="space-y-2.5">
              {[
                ["Até dia 15", "Enviamos-te o plano de publicações do mês seguinte."],
                ["Tens 5 dias", "Para pedires os ajustes que quiseres ao plano."],
                ["Depois disso", "O plano fecha e entra em produção, para sair a tempo e horas."],
                [
                  "Durante o mês",
                  "Alterações pedidas com o plano já a decorrer são orçamentadas à parte.",
                ],
              ].map(([q, d], i) => (
                <li key={i} className="flex gap-4 rounded-xl border border-line bg-white p-3.5">
                  <span className="font-display text-xl font-extrabold text-cobalt">{i + 1}</span>
                  <div>
                    <b className="text-[15px]">{q}</b>
                    <p className="text-sm text-grey">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-soft">
              É este ritmo que garante constância e nos deixa a ambos com as contas certas — sem
              surpresas de parte a parte.
            </p>
          </section>
        )}

        <section className="mb-8 rounded-xl border border-dashed border-gold bg-gold/5 px-6 py-5 text-[15px]">
          <b className="text-gold-dark">A nossa garantia de honestidade:</b> se olharmos para o teu
          digital e não encontrarmos pelo menos 3 coisas concretas para melhorar, dizemos-te na hora —
          e não avançamos. Não vendemos marketing que não precisas.
        </section>

        <section className="py-6 text-center">
          {c.fecho && <p className="mx-auto mb-4 max-w-xl text-[17px]">{c.fecho}</p>}
          <p className="font-display text-3xl font-extrabold">Damos cá cinco? 🖐️</p>
          <p className="mt-4 inline-block rounded-full bg-gold px-7 py-3 font-bold text-ink">
            numerocinco.pt · giveme5@numerocinco.pt
          </p>
        </section>

        {/* Decisão do cliente */}
        <div className="mb-4">
          <DecisaoProposta token={token} estado={p.estado} />
        </div>

        <footer className="mt-4 text-center text-[11px] text-soft">
          Proposta válida por 30 dias · Nº 5, marca operada por Os Caetanos, Lda · NIF 504428918
        </footer>
      </div>
    </main>
  );
}
