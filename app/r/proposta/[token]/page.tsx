import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { criarClienteServico } from "@/lib/supabase/server";
import { Simbolo } from "@/components/marca/Simbolo";
import { DecisaoProposta } from "@/components/propostas/DecisaoProposta";
import { EfeitosProposta } from "@/components/propostas/EfeitosProposta";
import { euros } from "@/lib/dominio/metricas";
import { calcular, normalizarEscopo, type Preco } from "@/lib/dominio/orcamento";
import { contratoDatas, planoPagamentoFundacao } from "@/lib/dominio/operacao";
import { idiomaDe } from "@/lib/dominio/intake";
import type { ConteudoProposta } from "@/lib/ia/prompts/proposta";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const PP_CSS = `
.pp-bar{position:fixed;top:0;left:0;height:3px;width:0;z-index:60;background:linear-gradient(90deg,#E8A13C,#B4761A);transition:width .12s linear}
.pp-grao{position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.5;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.04'/%3E%3C/svg%3E")}
.pp-simbolo path{stroke-dasharray:240;stroke-dashoffset:240;animation:ppTraco 1.15s ease forwards}
.pp-simbolo path:last-child{animation-delay:.8s;animation-duration:1s}
@keyframes ppTraco{to{stroke-dashoffset:0}}
.pp-cap::first-letter{float:left;font-family:var(--font-display);font-weight:800;font-size:3.4rem;line-height:.72;padding:6px 12px 0 0;color:#B4761A}
.pp-indice{margin-top:20px;display:flex;flex-wrap:wrap;gap:8px}
.pp-indice span{font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#c9cdd2;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:5px 11px}
.pp-cue{margin-top:22px;display:inline-flex;align-items:center;gap:9px;color:#8b9097;font-size:11.5px;font-family:var(--font-mono);letter-spacing:.12em;text-transform:uppercase}
.pp-cue .seta{font-size:15px;animation:ppDesce 1.7s ease-in-out infinite}
@keyframes ppDesce{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}
.pp-dots{display:inline-flex;gap:5px;align-items:center}
.pp-dots i{width:7px;height:7px;border-radius:50%;background:#E8A13C;animation:ppPisca 1.2s infinite}
.pp-dots i:nth-child(2){animation-delay:.18s}.pp-dots i:nth-child(3){animation-delay:.36s}
@keyframes ppPisca{0%,60%,100%{opacity:.3}30%{opacity:1}}
.pp-tagr{position:absolute;top:-11px;right:16px;background:#E8A13C;color:#15181D;font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:4px 10px;border-radius:999px}
.pp-on .pp-corpo>section{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
.pp-on .pp-corpo>section.pp-in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.pp-simbolo path,.pp-cue .seta,.pp-dots i{animation:none;stroke-dashoffset:0}.pp-on .pp-corpo>section{opacity:1!important;transform:none!important;transition:none}}
`;

const TX = {
  pt: {
    proposta: "Proposta",
    tagline: "Uma proposta do Nº 5 — o departamento de marketing das marcas que não têm um. 🖐️",
    indice: ["Onde estás", "O que construímos", "O teu assistente", "90 dias", "Investimento"],
    cue: "role para ver a proposta",
    ondeEstas: "onde estás hoje",
    ondeChegar: "onde queremos chegar",
    resolver: "o que vamos resolver — e porquê",
    construir: "o que vamos construir para ti",
    construirH: "Não é conversa. É o que vais ter.",
    assistenteE: "o teu assistente, só teu",
    conhece: (n: string) => `Conhece ${n}`,
    responder: "sempre a responder — no site e no WhatsApp",
    assistenteNota:
      "O nome é a nossa sugestão — o definitivo escolhemo-lo contigo. Feito à medida da tua marca, nunca repetido noutra. 🖐️",
    fazer: "o que vamos fazer",
    caminho: "o caminho",
    caminhoH: "Os primeiros 90 dias",
    trabalhamos: "como trabalhamos",
    metodoH: "Método em 4 tempos",
    metodo: [
      ["Ouvir", "Percebemos o negócio, o cliente e o que já tentaste. Sem isto, é tudo palpite."],
      ["Montar", "Estratégia, mensagem e as peças no sítio. A casa em ordem antes de fazer barulho."],
      ["Publicar", "Conteúdo com constância. A IA acelera; a decisão e o «publicar» são sempre de uma pessoa."],
      ["Medir", "Números reais, todos os meses. O que resulta, reforça-se. O que não, corta-se."],
    ],
    porque: "porquê o Nº 5",
    jaFizemos: "o que já fizemos",
    jaFizemosH: "Não são promessas. É trabalho.",
    verSite: "Ver o site ↗",
    verRedes: "Ver as redes ↗",
    investimento: "investimento",
    pediste: "O que pediste",
    recomendacao: "A nossa recomendação",
    recomendado: "recomendado",
    mes: "/mês",
    semSetupPedido: "sem setup pedido",
    semSetup: "sem setup",
    poupanca: (v: string) =>
      `Recomendamos menos ${v}/mês do que pediste — não porque cortámos, mas porque focado rende mais. Melhor estar bem onde importa do que espalhado por todo o lado. 🖐️`,
    arranque: "Arranque",
    arranqueNota: "montar a base, uma só vez",
    acompanhamento: "Acompanhamento mensal",
    motorNota: "o motor a trabalhar todos os meses",
    fechaContigo:
      "O número exato fecha-se contigo depois de alinharmos o âmbito — sem surpresas, sem letras pequeninas.",
    iva: "Aos valores apresentados acresce IVA à taxa legal em vigor.",
    descNormal: "Valor normal",
    descCondicao: "Condição de lançamento",
    descInicial: "Investimento inicial",
    descDepois: "Depois",
    meses: "meses",
    condTitulo: "Condições",
    condValida: "Proposta válida até",
    condInclui: "Inclui",
    condExclui: "Não inclui",
    condArranque: "Arranque",
    condRevisoes: "Revisões",
    condPagamento: "Pagamento",
    condDuracao: "Duração mínima",
    condRenova: "Renova a",
    condFundacaoTitulo: "Pagamento do arranque",
    fundAdjudicacao: "na adjudicação",
    fundEntrega: "antes da entrega",
    percebemosT: "O que percebemos",
    factosT: "O que nos disseste",
    leituraT: "A nossa leitura",
    medicaoT: "O que vamos medir",
    respT: "Quem faz o quê",
    respN5: "O Nº 5 assume",
    respCliente: "A tua parte",
    ritmo: "o ritmo, mês a mês",
    ritmoH: "Como trabalhamos, todos os meses",
    ritmoItens: [
      ["Até dia 15", "Enviamos-te o plano de publicações do mês seguinte."],
      ["Tens 5 dias", "Para pedires os ajustes que quiseres ao plano."],
      ["Depois disso", "O plano fecha e entra em produção, para sair a tempo e horas."],
      ["Durante o mês", "Alterações pedidas com o plano já a decorrer são orçamentadas à parte."],
    ],
    ritmoNota:
      "É este ritmo que garante constância e nos deixa a ambos com as contas certas — sem surpresas de parte a parte.",
    garantiaB: "A nossa garantia de honestidade:",
    garantia:
      " se olharmos para o teu digital e não encontrarmos pelo menos 3 coisas concretas para melhorar, dizemos-te na hora — e não avançamos. Não vendemos marketing que não precisas.",
    fecho: "Damos cá cinco? 🖐️",
    footer: "Proposta válida por 30 dias · Nº 5, marca operada por Os Caetanos, Lda · NIF 504428918",
  },
  en: {
    proposta: "Proposal",
    tagline: "A proposal from Nº 5 — the marketing department for brands that don't have one. 🖐️",
    indice: ["Where you are", "What we'll build", "Your assistant", "90 days", "Investment"],
    cue: "scroll to see the proposal",
    ondeEstas: "where you are today",
    ondeChegar: "where we're heading",
    resolver: "what we'll solve — and why",
    construir: "what we'll build for you",
    construirH: "Not talk. What you'll actually get.",
    assistenteE: "your assistant, only yours",
    conhece: (n: string) => `Meet ${n}`,
    responder: "always answering — on the site and WhatsApp",
    assistenteNota:
      "The name is our suggestion — we'll pick the final one with you. Made for your brand, never reused elsewhere. 🖐️",
    fazer: "what we'll do",
    caminho: "the path",
    caminhoH: "The first 90 days",
    trabalhamos: "how we work",
    metodoH: "Our method, in 4 beats",
    metodo: [
      ["Listen", "We understand the business, the customer and what you've tried. Without this, it's all guesswork."],
      ["Set up", "Strategy, message and the pieces in place. The house in order before making noise."],
      ["Publish", "Consistent content. AI accelerates; the decision and the 'publish' are always a person's."],
      ["Measure", "Real numbers, every month. What works, we double down on. What doesn't, we cut."],
    ],
    porque: "why Nº 5",
    jaFizemos: "what we've done",
    jaFizemosH: "Not promises. Work.",
    verSite: "View the site ↗",
    verRedes: "View the socials ↗",
    investimento: "investment",
    pediste: "What you asked for",
    recomendacao: "Our recommendation",
    recomendado: "recommended",
    mes: "/mo",
    semSetupPedido: "no setup requested",
    semSetup: "no setup",
    poupanca: (v: string) =>
      `We recommend ${v}/mo less than you asked — not because we cut, but because focus pays off. Better to be strong where it matters than spread thin. 🖐️`,
    arranque: "Setup",
    arranqueNota: "building the base, one-off",
    acompanhamento: "Monthly retainer",
    motorNota: "the engine working every month",
    fechaContigo:
      "The exact number is finalised with you once we align the scope — no surprises, no fine print.",
    iva: "VAT at the legal rate applies to the amounts shown.",
    descNormal: "Standard price",
    descCondicao: "Launch offer",
    descInicial: "Initial investment",
    descDepois: "Afterwards",
    meses: "months",
    condTitulo: "Terms",
    condValida: "Proposal valid until",
    condInclui: "Includes",
    condExclui: "Does not include",
    condArranque: "Start",
    condRevisoes: "Revisions",
    condPagamento: "Payment",
    condDuracao: "Minimum term",
    condRenova: "Renews on",
    condFundacaoTitulo: "Setup payment",
    fundAdjudicacao: "on signing",
    fundEntrega: "before delivery",
    percebemosT: "What we understood",
    factosT: "What you told us",
    leituraT: "Our reading",
    medicaoT: "What we'll measure",
    respT: "Who does what",
    respN5: "Nº 5 handles",
    respCliente: "Your part",
    ritmo: "the monthly rhythm",
    ritmoH: "How we work, every month",
    ritmoItens: [
      ["By the 15th", "We send you next month's publishing plan."],
      ["You have 5 days", "To request any changes to the plan."],
      ["After that", "The plan is locked and goes into production, to ship on time."],
      ["During the month", "Changes requested once the plan is running are quoted separately."],
    ],
    ritmoNota:
      "This rhythm is what guarantees consistency and keeps us both on the same page — no surprises either way.",
    garantiaB: "Our honesty guarantee:",
    garantia:
      " if we look at your digital presence and can't find at least 3 concrete things to improve, we'll tell you on the spot — and we won't proceed. We don't sell marketing you don't need.",
    fecho: "High five? 🖐️",
    footer: "Proposal valid for 30 days · Nº 5, a brand operated by Os Caetanos, Lda · NIF 504428918",
  },
};

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

  // Idioma do cliente, tolerante (não parte se a migração 0021 não correu).
  const { data: idiomaRow } = await supabase
    .from("clientes")
    .select("idioma")
    .eq("id", p.cliente_id)
    .maybeSingle();
  const idioma = idiomaDe(idiomaRow?.idioma);
  const t = TX[idioma];

  // Desconto ativo na avença (tolerante: null se a migração 0023 não correu).
  const { data: descAvenca } = await supabase
    .from("descontos")
    .select("valor_normal, tipo, valor_desconto, preco_durante, preco_apos, duracao_meses")
    .eq("cliente_id", p.cliente_id)
    .eq("alvo", "avenca")
    .eq("estado", "ativo")
    .maybeSingle();

  const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const cliente = um(p.clientes) as { nome_marca: string; setor: string | null } | null;
  const pacote = um(p.pacotes) as { nome: string; tagline: string | null } | null;
  const c = (p.conteudo ?? {}) as Partial<ConteudoProposta>;
  const ambito = (p.ambito ?? []) as string[];

  // Imutabilidade: se houver uma versão congelada, usa os preços da fotografia
  // (assim o «pediste vs. recomendamos» não muda quando o catálogo muda).
  const { data: versaoCongelada } = await supabase
    .from("proposta_versoes")
    .select("snapshot")
    .eq("proposta_id", p.id)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }));

  type PrecoLinha = { chave: string; rotulo: string; tipo: string; unidade: string; preco: number | null; minutos: number | null };
  let precos: PrecoLinha[] | null = null;
  const snapPrecos = (versaoCongelada?.snapshot as { precos?: unknown })?.precos;
  if (Array.isArray(snapPrecos) && snapPrecos.length > 0) {
    precos = snapPrecos as PrecoLinha[];
  } else {
    const { data } = await supabase
      .from("precos_unitarios")
      .select("chave, rotulo, tipo, unidade, preco, minutos")
      .eq("ativo", true);
    precos = data;
  }
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
    casos = (data ?? []).sort((a, b) => chavesCasos.indexOf(a.chave) - chavesCasos.indexOf(b.chave));
  }

  const pedido = normalizarEscopo(p.escopo_pedido ?? {});
  const orcPedido = calcular(pedido, (precos ?? []) as Preco[]);
  const temPedido = orcPedido.totalMensal > 0 || orcPedido.totalSetup > 0;
  const nossoMensal = Number(p.avenca_valor) || 0;
  const nossoSetup = Number(p.setup_valor) || 0;
  const poupancaMensal = temPedido ? orcPedido.totalMensal - nossoMensal : 0;
  const temMensal = orcPedido.totalMensal > 0 || nossoMensal > 0;
  const temSetup = orcPedido.totalSetup > 0 || nossoSetup > 0;
  const comparar = !!p.mostrar_comparacao && temPedido && nossoMensal > 0;

  const paras = (txt?: string) =>
    (txt ?? "").split(/\n\n+/).map((x) => x.trim()).filter(Boolean);

  const indice = [
    t.indice[0],
    t.indice[1],
    ...(c.assistente?.nome ? [t.indice[2]] : []),
    t.indice[3],
    t.indice[4],
  ];

  return (
    <main className="relative z-10 mx-auto max-w-3xl px-5 py-10 print:py-0">
      <style dangerouslySetInnerHTML={{ __html: PP_CSS }} />
      <EfeitosProposta />
      <header className="relative overflow-hidden rounded-t-2xl bg-ink px-8 py-10 text-cream print:rounded-none">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-gold/25 blur-3xl print:hidden" />
        <div className="relative">
          <Simbolo fundo="escuro" className="pp-simbolo mb-6 w-16" titulo="Nº 5" />
          <p className="rotulo !text-gold">
            {t.proposta}
            {pacote ? ` · ${pacote.nome}` : ""}
          </p>
          <h1 className="mt-2 font-display text-5xl font-extrabold leading-[0.98] tracking-tight">
            {cliente?.nome_marca ?? t.proposta}
          </h1>
          <p className="mt-3 max-w-[42ch] text-[15px] text-soft">{t.tagline}</p>
          <div className="pp-indice">
            {indice.map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
          <div className="pp-cue">
            <span className="seta">↓</span> {t.cue}
          </div>
        </div>
      </header>

      <div className="pp-corpo rounded-b-2xl border border-t-0 border-line bg-white px-8 py-9 print:rounded-none print:border-0">
        {c.abertura && (
          <section className="mb-8">
            <p className="rotulo">{t.ondeEstas}</p>
            {paras(c.abertura).map((x, i) => (
              <p key={i} className={`mt-2 text-[16px] leading-relaxed ${i === 0 ? "pp-cap" : ""}`}>
                {x}
              </p>
            ))}
          </section>
        )}

        {c.objetivo && (
          <section className="mb-8">
            <p className="rotulo">{t.ondeChegar}</p>
            <p className="mt-2 text-[16px] leading-relaxed">{c.objetivo}</p>
          </section>
        )}

        {c.percebemos && (!!c.percebemos.factos?.length || !!c.percebemos.leitura?.length) && (
          <section className="mb-8">
            <p className="rotulo">{t.percebemosT}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {!!c.percebemos.factos?.length && (
                <div className="rounded-xl border border-line bg-white p-4">
                  <p className="mb-1.5 text-xs font-bold text-grey">{t.factosT}</p>
                  <ul className="space-y-1 text-sm">
                    {c.percebemos.factos.map((f, i) => (
                      <li key={i}>· {f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!!c.percebemos.leitura?.length && (
                <div className="rounded-xl border border-gold/40 bg-gold/5 p-4">
                  <p className="mb-1.5 text-xs font-bold text-gold-dark">{t.leituraT}</p>
                  <ul className="space-y-1 text-sm">
                    {c.percebemos.leitura.map((f, i) => (
                      <li key={i}>· {f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {!!c.prioridades?.length && (
          <section className="mb-8">
            <p className="rotulo">{t.resolver}</p>
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
            <p className="rotulo">{t.construir}</p>
            <h2 className="mt-1 mb-3 font-display text-2xl font-extrabold">{t.construirH}</h2>
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
            <div className="relative overflow-hidden rounded-2xl bg-ink px-7 py-8 text-cream">
              <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-gold/20 blur-3xl print:hidden" />
              <div
                className="absolute right-6 top-6 hidden size-16 place-items-center bg-gold/15 text-3xl ring-1 ring-gold/40 sm:grid print:hidden"
                style={{ borderRadius: "20px 20px 20px 6px" }}
                aria-hidden
              >
                💬
              </div>
              <div className="relative">
                <p className="rotulo !text-gold">{t.assistenteE}</p>
                <h2 className="mt-1 font-display text-3xl font-extrabold text-gold">
                  {t.conhece(c.assistente.nome)}
                </h2>
                <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-soft">
                  {c.assistente.descricao}
                </p>
                <div className="mt-4 flex items-center gap-2.5 text-sm">
                  <span className="pp-dots" aria-hidden>
                    <i></i>
                    <i></i>
                    <i></i>
                  </span>
                  <span className="text-soft">{t.responder}</span>
                </div>
                <p className="mt-3 text-xs text-soft">{t.assistenteNota}</p>
              </div>
            </div>
          </section>
        )}

        {ambito.length > 0 && (
          <section className="mb-8">
            <p className="rotulo">{t.fazer}</p>
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
          <p className="rotulo">{t.trabalhamos}</p>
          <h2 className="mt-1 mb-2 font-display text-2xl font-extrabold">{t.metodoH}</h2>
          {t.metodo.map(([titulo, d], i) => (
            <div key={titulo} className="flex gap-4 border-b border-line/60 py-3 last:border-0">
              <span className="font-display text-2xl font-extrabold text-cobalt">{i + 1}</span>
              <div>
                <b className="text-[15px]">{titulo}</b>
                <p className="text-sm text-grey">{d}</p>
              </div>
            </div>
          ))}
        </section>

        {!!c.roadmap?.length && (
          <section className="mb-8">
            <p className="rotulo">{t.caminho}</p>
            <h2 className="mt-1 mb-3 font-display text-2xl font-extrabold">{t.caminhoH}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {c.roadmap.map((x, i) => (
                <div key={i} className="rounded-xl border border-line bg-white p-4">
                  <p className="font-mono text-xs font-bold uppercase tracking-wide text-cobalt">{x.fase}</p>
                  <b className="mt-1 block text-[15px]">{x.titulo}</b>
                  <p className="mt-1 text-sm text-grey">{x.texto}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {!!c.medicao?.length && (
          <section className="mb-8">
            <p className="rotulo">{t.medicaoT}</p>
            <ul className="mt-2 divide-y divide-line/60 rounded-xl border border-line bg-white">
              {c.medicao.map((m, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="font-bold">{m.metrica}</span>
                  <span className="text-xs text-soft">{m.fonte}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {c.responsabilidades && (!!c.responsabilidades.n5?.length || !!c.responsabilidades.cliente?.length) && (
          <section className="mb-8">
            <p className="rotulo">{t.respT}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gold/40 bg-gold/5 p-4">
                <p className="mb-1.5 text-xs font-bold text-gold-dark">{t.respN5}</p>
                <ul className="space-y-1 text-sm">
                  {(c.responsabilidades.n5 ?? []).map((x, i) => (
                    <li key={i}>· {x}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-line bg-white p-4">
                <p className="mb-1.5 text-xs font-bold text-grey">{t.respCliente}</p>
                <ul className="space-y-1 text-sm">
                  {(c.responsabilidades.cliente ?? []).map((x, i) => (
                    <li key={i}>· {x}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {c.porque_n5 && (
          <section className="mb-8">
            <p className="rotulo">{t.porque}</p>
            <p className="mt-2 text-[15px] leading-relaxed">{c.porque_n5}</p>
          </section>
        )}

        {casos.length > 0 && (
          <section className="mb-8">
            <p className="rotulo">{t.jaFizemos}</p>
            <h2 className="mt-1 mb-3 font-display text-2xl font-extrabold">{t.jaFizemosH}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {casos.map((caso) => (
                <div key={caso.chave} className="flex flex-col overflow-hidden rounded-xl border border-line bg-white">
                  {caso.imagem_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={caso.imagem_url} alt={caso.marca} className="h-40 w-full object-cover object-top" />
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
                        <a href={caso.link} target="_blank" rel="noopener" className="rounded-full border border-gold-dark px-3 py-1.5 text-xs font-bold text-gold-dark hover:bg-gold hover:text-ink">
                          {t.verSite}
                        </a>
                      )}
                      {caso.link_redes && (
                        <a href={caso.link_redes} target="_blank" rel="noopener" className="rounded-full border border-gold-dark px-3 py-1.5 text-xs font-bold text-gold-dark hover:bg-gold hover:text-ink">
                          {t.verRedes}
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
            <p className="rotulo">{t.investimento}</p>

            {comparar ? (
              <>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-white px-6 py-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-grey">{t.pediste}</p>
                    {temMensal && (
                      <p className="mt-2 font-display text-2xl font-extrabold text-grey">
                        {orcPedido.totalMensal > 0 ? euros(orcPedido.totalMensal) : "—"}
                        <span className="text-sm font-normal">{t.mes}</span>
                      </p>
                    )}
                    {temSetup && (
                      <p className="text-sm text-soft">
                        {orcPedido.totalSetup > 0 ? `setup ${euros(orcPedido.totalSetup)}` : t.semSetupPedido}
                      </p>
                    )}
                  </div>
                  <div className="relative rounded-xl bg-ink px-6 py-5 text-cream ring-2 ring-gold">
                    <span className="pp-tagr">{t.recomendado}</span>
                    <p className="text-xs font-bold uppercase tracking-wide text-gold">{t.recomendacao}</p>
                    {temMensal && (
                      <p className="mt-2 font-display text-3xl font-extrabold text-gold">
                        {nossoMensal > 0 ? euros(nossoMensal) : "—"}
                        <span className="text-base font-normal">{t.mes}</span>
                      </p>
                    )}
                    {temSetup && (
                      <p className="text-sm text-soft">
                        {Number(p.setup_valor) > 0 ? `setup ${euros(p.setup_valor)}` : t.semSetup}
                      </p>
                    )}
                  </div>
                </div>
                {poupancaMensal > 0 && (
                  <p className="mt-3 rounded-lg bg-gold/10 px-4 py-3 text-[15px]">{t.poupanca(euros(poupancaMensal))}</p>
                )}
                <p className="mt-2 text-xs text-soft">
                  {p.avenca_nota || t.motorNota}
                  {p.setup_nota ? ` · ${p.setup_nota}` : ""}. {t.fechaContigo}
                </p>
              </>
            ) : (
              <div className="mt-2 rounded-xl bg-ink px-7 py-6 text-cream">
                {p.setup_valor ? (
                  <div className="flex items-baseline justify-between gap-4 border-b border-white/10 py-2.5">
                    <div>
                      <p className="text-[15px]">{t.arranque}</p>
                      <p className="text-xs text-soft">{p.setup_nota || t.arranqueNota}</p>
                    </div>
                    <span className="font-display text-2xl font-extrabold text-gold">{euros(p.setup_valor)}</span>
                  </div>
                ) : null}
                {p.avenca_valor ? (
                  <div className="flex items-baseline justify-between gap-4 py-2.5">
                    <div>
                      <p className="text-[15px]">{t.acompanhamento}</p>
                      <p className="text-xs text-soft">{p.avenca_nota || t.motorNota}</p>
                    </div>
                    <span className="font-display text-2xl font-extrabold text-gold">{euros(p.avenca_valor)}</span>
                  </div>
                ) : null}
                <p className="mt-3 text-xs text-soft">{t.fechaContigo}</p>
              </div>
            )}
            {descAvenca && descAvenca.preco_durante != null && (
              <div className="mt-3 rounded-xl border border-gold/40 bg-gold/5 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-grey">{t.descNormal}</span>
                  <span>
                    {euros(descAvenca.valor_normal)}
                    {t.mes}
                  </span>
                </div>
                <div className="flex justify-between text-gold-dark">
                  <span>
                    {t.descCondicao}
                    {descAvenca.duracao_meses ? ` (${descAvenca.duracao_meses} ${t.meses})` : ""}
                  </span>
                  <span>
                    {descAvenca.tipo === "percentagem"
                      ? `−${descAvenca.valor_desconto}%`
                      : `−${euros(descAvenca.valor_desconto)}`}
                  </span>
                </div>
                <div className="mt-1.5 flex justify-between border-t border-gold/20 pt-1.5 font-bold">
                  <span>{t.descInicial}</span>
                  <b className="text-gold-dark">
                    {euros(descAvenca.preco_durante)}
                    {t.mes}
                  </b>
                </div>
                <div className="flex justify-between text-soft">
                  <span>{t.descDepois}</span>
                  <span>
                    {euros(descAvenca.preco_apos ?? descAvenca.valor_normal)}
                    {t.mes}
                  </span>
                </div>
              </div>
            )}
            <p className="mt-2 text-xs font-bold text-grey">{t.iva}</p>
          </section>
        )}

        {(() => {
          const c = (p.condicoes ?? {}) as Record<string, unknown>;
          const str = (k: string) => (c[k] == null ? null : String(c[k]));
          const nmb = (k: string) => (c[k] == null || c[k] === "" ? null : Number(c[k]));
          const fmtData = (iso: string) =>
            new Date(iso).toLocaleDateString(idioma === "en" ? "en-GB" : "pt-PT", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            });

          const linhas: [string, string][] = [];
          if (str("inclui")) linhas.push([t.condInclui, str("inclui")!]);
          if (str("exclui")) linhas.push([t.condExclui, str("exclui")!]);
          if (str("prazo_arranque")) linhas.push([t.condArranque, str("prazo_arranque")!]);
          if (str("politica_revisoes")) linhas.push([t.condRevisoes, str("politica_revisoes")!]);
          if (str("forma_pagamento")) linhas.push([t.condPagamento, str("forma_pagamento")!]);

          const datas = contratoDatas(str("data_inicio"), nmb("duracao_meses"), nmb("aviso_dias"));
          if (nmb("duracao_meses") != null) {
            const dur = `${nmb("duracao_meses")} ${t.meses}`;
            linhas.push([
              t.condDuracao,
              datas.renovacao ? `${dur} · ${t.condRenova} ${fmtData(datas.renovacao)}` : dur,
            ]);
          }

          // Pagamento da Fundação (só quando há arranque).
          const setup = Number(p.setup_valor) || 0;
          const modoFund = str("pagamento_fundacao");
          const planoFund =
            setup > 0 && modoFund !== "fases" ? planoPagamentoFundacao(modoFund, setup) : [];

          if (!p.validade && linhas.length === 0 && planoFund.length === 0 && !str("pagamento_fundacao_fases"))
            return null;

          const validadeFmt = p.validade ? fmtData(p.validade as string) : null;
          return (
            <section className="mb-8">
              <p className="rotulo">{t.condTitulo}</p>
              <div className="mt-2 rounded-xl border border-line bg-white p-4 text-sm">
                {validadeFmt && (
                  <p className="mb-2 font-bold">
                    {t.condValida} <span className="text-gold-dark">{validadeFmt}</span>
                  </p>
                )}
                <dl className="space-y-1.5">
                  {linhas.map(([rot, val]) => (
                    <div key={rot} className="grid grid-cols-[7rem_1fr] gap-2">
                      <dt className="text-grey">{rot}</dt>
                      <dd>{val}</dd>
                    </div>
                  ))}
                </dl>

                {(planoFund.length > 0 || str("pagamento_fundacao_fases")) && (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="mb-1 font-bold">{t.condFundacaoTitulo}</p>
                    {str("pagamento_fundacao_fases") ? (
                      <p className="text-grey">{str("pagamento_fundacao_fases")}</p>
                    ) : (
                      <ul className="space-y-0.5 text-grey">
                        {planoFund.map((f, i) => (
                          <li key={i} className="flex justify-between">
                            <span>
                              {f.pct}% {i === 0 ? t.fundAdjudicacao : t.fundEntrega}
                            </span>
                            <b className="text-ink">{euros(f.valor)}</b>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })()}

        {Number(p.avenca_valor) > 0 && (
          <section className="mb-8">
            <p className="rotulo">{t.ritmo}</p>
            <h2 className="mt-1 mb-3 font-display text-2xl font-extrabold">{t.ritmoH}</h2>
            <ol className="space-y-2.5">
              {t.ritmoItens.map(([q, d], i) => (
                <li key={i} className="flex gap-4 rounded-xl border border-line bg-white p-3.5">
                  <span className="font-display text-xl font-extrabold text-cobalt">{i + 1}</span>
                  <div>
                    <b className="text-[15px]">{q}</b>
                    <p className="text-sm text-grey">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-soft">{t.ritmoNota}</p>
          </section>
        )}

        <section className="mb-8 rounded-xl border border-dashed border-gold bg-gold/5 px-6 py-5 text-[15px]">
          <b className="text-gold-dark">{t.garantiaB}</b>
          {t.garantia}
        </section>

        <section className="py-6 text-center">
          {c.fecho && <p className="mx-auto mb-4 max-w-xl text-[17px]">{c.fecho}</p>}
          <p className="font-display text-3xl font-extrabold">{t.fecho}</p>
          <p className="mt-4 inline-block rounded-full bg-gold px-7 py-3 font-bold text-ink">
            numerocinco.pt · giveme5@numerocinco.pt
          </p>
        </section>

        <div className="mb-4">
          <DecisaoProposta token={token} estado={p.estado} idioma={idioma} />
        </div>

        <footer className="mt-4 text-center text-[11px] text-soft">{t.footer}</footer>
      </div>
    </main>
  );
}
