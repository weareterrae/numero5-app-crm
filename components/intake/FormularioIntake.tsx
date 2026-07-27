"use client";

import { useState } from "react";
import { Simbolo } from "@/components/marca/Simbolo";
import { OBJETIVOS, type ChaveObjetivo } from "@/lib/dominio/diagnostico/recomendacoes";
import {
  AUTOMACAO,
  CICLO_DECISAO,
  DECISORES,
  MATERIAIS,
  FAIXAS_ORCAMENTO,
  FAIXAS_ARRANQUE,
  FERRAMENTAS,
  IDADES,
  INTENCAO,
  LEADS_COMO,
  LEADS_FOLLOWUP,
  LEADS_REGISTO,
  LEADS_RESPOSTA,
  LOGO,
  ONDE,
  PRAZO,
  PRESENCA,
  PUBLICO,
  RENOVAR,
  rotulo,
  rotuloFaixa,
  SIM_NAO,
  SITE_ESTADO,
  SITE_NOVO,
  SITE_PROBLEMAS,
  SITE_TIPO,
  TOM,
  TRATAMENTO,
  ehB2B,
  ehB2C,
  investeAnuncios,
  recebeContactos,
  recomendacaoSite,
  respostaSubstancial,
  urlValido,
  type Brief,
  type Idioma,
} from "@/lib/dominio/intake";
import { CANAIS, ESCOPO_VAZIO, type ChaveCanal, type Escopo } from "@/lib/dominio/orcamento";
import { submeterIntake, guardarRascunhoIntake, analisarWebsiteIntake } from "@/app/intake/[token]/acoes";
import { resumoInfoSite, type InfoSite } from "@/lib/dominio/diagnostico/extrair-site";

type Opcao = readonly [string, string, string];

const REDES_LINK: [string, string][] = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["linkedin", "LinkedIn"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
];

// Todos os textos fixos do wizard, PT + EN.
const TX = {
  pt: {
    eyebrow: "diagnóstico gratuito",
    titulo: (n: string) => `Vamos sonhar com a ${n}`,
    sub: "Umas perguntas rápidas — a maioria é só tocar. Quanto mais nos contas, mais à tua medida fica a proposta. 🖐️",
    guardado: "As tuas respostas ficam guardadas — podes fechar e continuar mais tarde. É confidencial.",
    retomado: "Bem-vindo de volta — retomámos onde paraste.",
    analisar: "Ver o que já está no site",
    analisando: "A ver o site…",
    detetadoTitulo: "Detetámos isto no teu site. Confirma ou corrige.",
    usarRedes: "Usar as redes detetadas",
    analiseFalhou: "Não conseguimos aceder ao site — sem problema, continua e conta-nos tu.",
    jaSubmetido: "Já nos tinhas enviado isto — se preencheres outra vez, ficamos com a versão mais recente.",
    passo: (a: number, b: number) => `Passo ${a} de ${b}`,
    voltar: "← Voltar",
    continuar: "Continuar →",
    enviar: "Enviar 🖐️",
    aEnviar: "A enviar…",
    erroObj: "Escolhe pelo menos um objetivo (ou escreve por tuas palavras). É o que mais ajuda. 🖐️",
    rodape: (setor: string | null) =>
      `${setor ? `${setor} · ` : ""}Os teus dados servem só para prepararmos a tua proposta.`,
    okTitulo: "Recebido. Obrigado! 🖐️",
    okTexto: (n: string) =>
      `Já temos com que sonhar para a ${n}. Vamos preparar-te uma proposta à medida — falamos em breve.`,
    politica: "política de privacidade",
    ver: "Ver a",
    p1t: "A tua marca hoje",
    p1s: "Só para percebermos o ponto de partida.",
    website: "O teu website (se tiveres)",
    redes: "Onde já andas nas redes (opcional)",
    presencaQ: "Como está a tua presença digital hoje?",
    temHoje: "O que já fazes hoje em marketing? (opcional)",
    temHojePH: "Ex.: publico quando me lembro, já tentei anúncios uma vez…",
    p2t: "Quem queres alcançar",
    p2s: "Falar com toda a gente é falar com ninguém.",
    publicoQ: "Quem é o teu cliente ideal?",
    ondeQ: "Onde é que ele está?",
    idadesQ: "Que idades, mais ou menos?",
    varias: "Podes escolher várias.",
    publicoTxt: "O que faz alguém escolher-te a ti e não ao vizinho?",
    publicoTxtPH: "Ex.: sou o único da zona que…, o meu atendimento é…",
    p3t: "O que gostavas de alcançar",
    p3s: "A parte importante. Escolhe o que fizer sentido.",
    objQ: "Os teus objetivos",
    escolheQuiseres: "Escolhe os que quiseres.",
    objPrioridade: "Escolhe até 3, pela ordem que mais importam.",
    revT: "Antes de enviar",
    revS: "Uma última vista de olhos. Podes editar o que quiseres.",
    revEditar: "editar",
    revPublico: "Cliente",
    revObjetivos: "Objetivos",
    revSite: "Site",
    revOrcamento: "Investimento",
    revVazio: "—",
    setoresQ: "Que tipo de empresas? (setores, dimensão)",
    setoresPH: "Ex.: restaurantes, clínicas pequenas, construção…",
    cicloQ: "Quanto tempo demoram a decidir?",
    clienteValorQ: "Quem é hoje o cliente com mais valor para ti?",
    clienteValorPH: "Ex.: o cliente que volta sempre e recomenda…",
    clienteEvitarQ: "Há algum tipo de cliente que não queiras atrair? (opcional)",
    clienteEvitarPH: "Ex.: quem só procura o mais barato…",
    materiaisQ: "O que já tens disponível?",
    anexosQ: "Queres anexar já algum material? (opcional)",
    anexosNota: "Logótipo, brochura, fotos… máx. 10 MB por ficheiro.",
    anexosErro: "Não foi possível enviar — tenta outra vez.",
    anexosOk: "enviado",
    siteProblemasQ: "O que precisas de resolver no website?",
    recSite: {
      criar: "Pelo que dizes, faz sentido criar um site de raiz.",
      reconstruir: "Pelo que dizes, faz sentido reconstruir o site.",
      melhorar: "Pelo que dizes, dá para melhorar o que já tens.",
      manter: "Boa — o site parece estar a cumprir.",
    } as Record<string, string>,
    decideQ: "Quem terá de dizer «sim» para avançarmos?",
    decisorNomeQ: "Nome de quem decide (opcional)",
    decisorContactoQ: "Contacto dele (opcional)",
    avisoObjTexto: "Escreve um bocadinho mais — ajuda-nos a perceber o que queres.",
    avisoUrl: "Isto não parece um endereço válido — confere.",
    objTxt: "Por tuas palavras: o que querias mesmo que acontecesse?",
    objTxtPH: "Sonha um bocado. Daqui a um ano, o que mudou no negócio?",
    p4t: "A personalidade da tua marca",
    p4s: "É isto que faz uma marca soar a gente e não a folheto.",
    tomQ: "Se a tua marca fosse uma pessoa, como falaria?",
    encaixam: "Escolhe as que encaixam.",
    sentirQ: "Como queres que as pessoas se sintam quando te veem?",
    sentirPH: "Ex.: em confiança, com vontade de provar, que estão em boas mãos…",
    tratQ: "E tratas o cliente por…",
    p5t: "Inspiração & imagem",
    p5s: "Mostra-nos o que te faz olhar duas vezes.",
    refQ: "Marcas ou páginas que admiras",
    refNota: "Não têm de ser do teu setor.",
    refPH: "Nomes, @ ou links — o que te vier à cabeça.",
    refGostoQ: "O que gostas nelas?",
    refGostoPH: "As cores, o à-vontade, a forma de mostrar os produtos…",
    evitarQ: "Algo que NÃO queres parecer?",
    evitarPH: "Ex.: nada de foleiro, nada demasiado sério…",
    logoQ: "O teu logótipo…",
    renovarQ: "Apetece-te renovar a imagem?",
    p6t: "O teu site",
    p6s: "A casa que é mesmo tua — não a rede social dos outros.",
    siteEstadoQ: "Como está o teu site?",
    siteNovoQ: "Queres um site novo feito por nós?",
    siteTipoQ: "Que tipo de site imaginas?",
    maisQueUm: "Podes escolher mais do que um.",
    siteFuncoesQ: "O que é que o site tem mesmo de conseguir fazer?",
    siteFuncoesPH: "Ex.: receber marcações, vender online, mostrar o portefólio…",
    p7t: "Tecnologia & automação",
    p7s: "A parte de sonhar: o que a tecnologia pode tratar por ti.",
    autoQ: "O que gostavas de automatizar?",
    autoNota: "Escolhe tudo o que te fizer sonhar.",
    tarefaQ: "Uma tarefa chata que adoravas tirar do teu prato?",
    tarefaPH: "Ex.: responder sempre às mesmas perguntas no WhatsApp…",
    p8t: "Ambição & investimento",
    p8s: "Última passada. Depois é connosco.",
    canaisQ: "Em que redes gostavas de estar?",
    opcional: "Opcional.",
    orcQ: "Que investimento tens em mente?",
    orcNota: "Opcional, e sem compromisso.",
    ambicaoQ: "A tua ambição para os próximos 12 meses",
    ambicaoPH: "Onde queres estar daqui a um ano?",
    prazoQ: "Para quando isto?",
    notaFinalQ: "Mais alguma coisa que queiras que saibamos?",
    notaFinalPH: "O que quiseres. Estamos a ouvir. 🖐️",
    pcT: "Depois do contacto",
    pcS: "O que acontece quando alguém te procura. É aqui que muito negócio se ganha ou perde.",
    leadsComoQ: "Como chegam os contactos hoje?",
    leadsRespostaQ: "Quando te contactam, em quanto tempo respondes?",
    leadsRegistoQ: "Onde ficam registados?",
    leadsFollowupQ: "Fazes seguimento de quem não fecha logo?",
    leadsPerdaQ: "Qual a razão mais comum para perderes um cliente? (opcional)",
    leadsPerdaPH: "Ex.: demoro a responder, preço, não volto a contactar…",
    aqT: "Anúncios e aquisição",
    aqS: "Onde investes para trazer gente nova.",
    anunciosQ: "Já investes em anúncios? (Google, Meta, etc.)",
    anunciosDetalheQ: "Boa. Conta-nos: plataformas, verba e resultados.",
    anunciosDetalhePH: "Ex.: Meta, ~150 €/mês, alguns contactos mas sem saber o custo…",
    anunciosPorqueQ: "O que te trava de investir em anúncios?",
    anunciosPorquePH: "Ex.: não sei por onde começar, já tentei e não resultou…",
    ferramentasQ: "Que ferramentas já usas? (opcional)",
    intencaoQ: "O que procuras neste momento?",
    arranqueQ: "E para o arranque (pagamento único)?",
  },
  en: {
    eyebrow: "free diagnostic",
    titulo: (n: string) => `Let's dream up ${n}`,
    sub: "A few quick questions — most are just a tap. The more you tell us, the more tailored your proposal. 🖐️",
    jaSubmetido: "You'd already sent this — if you fill it in again, we keep the latest version.",
    passo: (a: number, b: number) => `Step ${a} of ${b}`,
    voltar: "← Back",
    continuar: "Continue →",
    enviar: "Send 🖐️",
    aEnviar: "Sending…",
    erroObj: "Pick at least one goal (or write it in your own words). That's what helps most. 🖐️",
    rodape: (setor: string | null) =>
      `${setor ? `${setor} · ` : ""}Your details are used only to prepare your proposal.`,
    okTitulo: "Got it. Thank you! 🖐️",
    okTexto: (n: string) =>
      `We now have plenty to dream up for ${n}. We'll prepare a tailored proposal — talk soon.`,
    politica: "privacy policy",
    ver: "See the",
    p1t: "Your brand today",
    p1s: "Just so we get the starting point.",
    website: "Your website (if you have one)",
    redes: "Where you already are on social (optional)",
    presencaQ: "How's your digital presence today?",
    temHoje: "What do you already do in marketing? (optional)",
    temHojePH: "e.g. I post when I remember, tried ads once…",
    p2t: "Who you want to reach",
    p2s: "Talking to everyone is talking to no one.",
    publicoQ: "Who's your ideal customer?",
    ondeQ: "Where are they?",
    idadesQ: "Roughly what ages?",
    varias: "Pick as many as you like.",
    publicoTxt: "What makes someone choose you over the competition?",
    publicoTxtPH: "e.g. I'm the only one around who…, my service is…",
    p3t: "What you'd love to achieve",
    p3s: "The important part. Pick what fits.",
    objQ: "Your goals",
    escolheQuiseres: "Choose any.",
    objPrioridade: "Pick up to 3, in order of importance.",
    revT: "Before you send",
    revS: "One last look. Edit anything you like.",
    revEditar: "edit",
    revPublico: "Customer",
    revObjetivos: "Goals",
    revSite: "Website",
    revOrcamento: "Investment",
    revVazio: "—",
    setoresQ: "What kind of companies? (sectors, size)",
    setoresPH: "e.g. restaurants, small clinics, construction…",
    cicloQ: "How long do they take to decide?",
    clienteValorQ: "Who's your highest-value customer today?",
    clienteValorPH: "e.g. the one who always comes back and refers others…",
    clienteEvitarQ: "Any kind of customer you'd rather not attract? (optional)",
    clienteEvitarPH: "e.g. those who only chase the cheapest…",
    materiaisQ: "What do you already have?",
    anexosQ: "Want to attach any material now? (optional)",
    anexosNota: "Logo, brochure, photos… max. 10 MB per file.",
    anexosErro: "Couldn't upload — please try again.",
    anexosOk: "uploaded",
    siteProblemasQ: "What do you need to fix on the website?",
    recSite: {
      criar: "From what you say, it makes sense to build a site from scratch.",
      reconstruir: "From what you say, it makes sense to rebuild the site.",
      melhorar: "From what you say, we can improve what you already have.",
      manter: "Good — the site seems to be doing its job.",
    } as Record<string, string>,
    decideQ: "Who has to say «yes» for us to go ahead?",
    decisorNomeQ: "Name of the decision-maker (optional)",
    decisorContactoQ: "Their contact (optional)",
    avisoObjTexto: "Write a little more — it helps us understand what you want.",
    avisoUrl: "That doesn't look like a valid address — check it.",
    objTxt: "In your words: what would you really love to happen?",
    objTxtPH: "Dream a little. A year from now, what changed in the business?",
    p4t: "Your brand's personality",
    p4s: "This is what makes a brand sound human, not like a brochure.",
    tomQ: "If your brand were a person, how would it talk?",
    encaixam: "Pick the ones that fit.",
    sentirQ: "How do you want people to feel when they see you?",
    sentirPH: "e.g. reassured, tempted to try, in good hands…",
    tratQ: "And you address customers as…",
    p5t: "Inspiration & image",
    p5s: "Show us what makes you look twice.",
    refQ: "Brands or pages you admire",
    refNota: "They don't have to be in your field.",
    refPH: "Names, @ or links — whatever comes to mind.",
    refGostoQ: "What do you like about them?",
    refGostoPH: "The colours, the ease, the way they show their products…",
    evitarQ: "Anything you do NOT want to look like?",
    evitarPH: "e.g. nothing tacky, nothing too stiff…",
    logoQ: "Your logo…",
    renovarQ: "Fancy refreshing the image?",
    p6t: "Your website",
    p6s: "The home that's truly yours — not someone else's social feed.",
    siteEstadoQ: "How's your website?",
    siteNovoQ: "Want a new site built by us?",
    siteTipoQ: "What kind of site do you picture?",
    maisQueUm: "You can pick more than one.",
    siteFuncoesQ: "What must the site actually be able to do?",
    siteFuncoesPH: "e.g. take bookings, sell online, show the portfolio…",
    p7t: "Technology & automation",
    p7s: "The dreamy part: what tech can handle for you.",
    autoQ: "What would you love to automate?",
    autoNota: "Pick everything that makes you dream.",
    tarefaQ: "A boring task you'd love off your plate?",
    tarefaPH: "e.g. answering the same WhatsApp questions over and over…",
    p8t: "Ambition & investment",
    p8s: "Last stretch. Then it's on us.",
    canaisQ: "Which networks would you like to be on?",
    opcional: "Optional.",
    orcQ: "What investment do you have in mind?",
    orcNota: "Optional, no strings attached.",
    ambicaoQ: "Your ambition for the next 12 months",
    ambicaoPH: "Where do you want to be a year from now?",
    prazoQ: "When are you looking to start?",
    notaFinalQ: "Anything else you'd like us to know?",
    notaFinalPH: "Anything you like. We're listening. 🖐️",
    guardado: "Your answers are saved — you can close and continue later. It's confidential.",
    retomado: "Welcome back — we picked up where you left off.",
    pcT: "After the lead",
    pcS: "What happens when someone reaches out. This is where a lot of business is won or lost.",
    leadsComoQ: "How do leads reach you today?",
    leadsRespostaQ: "When someone contacts you, how fast do you reply?",
    leadsRegistoQ: "Where are they recorded?",
    leadsFollowupQ: "Do you follow up with those who don't close right away?",
    leadsPerdaQ: "Most common reason you lose a client? (optional)",
    leadsPerdaPH: "e.g. slow to reply, price, I don't follow up…",
    aqT: "Ads & acquisition",
    aqS: "Where you invest to bring in new people.",
    anunciosQ: "Do you already invest in ads? (Google, Meta, etc.)",
    anunciosDetalheQ: "Great. Tell us: platforms, budget and results.",
    anunciosDetalhePH: "e.g. Meta, ~€150/mo, some leads but I don't know the cost…",
    anunciosPorqueQ: "What's stopping you from investing in ads?",
    anunciosPorquePH: "e.g. don't know where to start, tried it and it didn't work…",
    ferramentasQ: "Which tools do you already use? (optional)",
    intencaoQ: "What are you looking for right now?",
    arranqueQ: "And for the setup (one-off payment)?",
    analisar: "See what's already on the site",
    analisando: "Reading the site…",
    detetadoTitulo: "We found this on your site. Confirm or correct.",
    usarRedes: "Use the detected socials",
    analiseFalhou: "We couldn't reach the site — no problem, carry on and tell us yourself.",
  },
};

export type RascunhoIntake = {
  website?: string;
  redes?: Record<string, string>;
  temHoje?: string;
  objetivos?: ChaveObjetivo[];
  objetivosTexto?: string;
  orcamento?: string;
  pedido?: Escopo;
  brief?: Brief;
};

export function FormularioIntake({
  token,
  nome,
  setor,
  websiteInicial,
  redesIniciais,
  jaSubmetido,
  idioma = "pt",
  rascunhoInicial = null,
  passoInicial = 0,
}: {
  token: string;
  nome: string;
  setor: string | null;
  websiteInicial: string;
  redesIniciais: Record<string, string>;
  jaSubmetido: boolean;
  idioma?: Idioma;
  rascunhoInicial?: RascunhoIntake | null;
  passoInicial?: number;
}) {
  const t = TX[idioma];
  const L = (o: Opcao) => (idioma === "en" ? o[2] : o[1]);

  const r0 = rascunhoInicial ?? {};
  const [passo, setPasso] = useState(passoInicial || 0);
  const [website, setWebsite] = useState(r0.website ?? websiteInicial);
  const [redes, setRedes] = useState<Record<string, string>>(r0.redes ?? redesIniciais);
  const [temHoje, setTemHoje] = useState(r0.temHoje ?? "");
  const [objetivos, setObjetivos] = useState<ChaveObjetivo[]>(r0.objetivos ?? []);
  const [objetivosTexto, setObjetivosTexto] = useState(r0.objetivosTexto ?? "");
  const [orcamento, setOrcamento] = useState(r0.orcamento ?? "");
  const [pedido, setPedido] = useState<Escopo>(r0.pedido ?? { ...ESCOPO_VAZIO });
  const [brief, setBrief] = useState<Brief>(r0.brief ?? {});
  const [estado, setEstado] = useState<"a-preencher" | "a-enviar" | "enviado" | "erro">(
    "a-preencher",
  );
  const [erro, setErro] = useState("");
  const [retomado] = useState((passoInicial || 0) > 0);
  const [analisando, setAnalisando] = useState(false);
  const [detetado, setDetetado] = useState<InfoSite | null>(null);
  const [analiseFalhou, setAnaliseFalhou] = useState(false);

  async function analisarSite() {
    if (!website.trim() || analisando) return;
    setAnalisando(true);
    setAnaliseFalhou(false);
    const r = await analisarWebsiteIntake(website.trim());
    setAnalisando(false);
    if (r.ok) {
      setDetetado(r.info);
      setBrief((b) => ({ ...b, site_detetado: r.info as unknown as Record<string, unknown> }));
    } else {
      setAnaliseFalhou(true);
    }
  }

  function usarRedesDetetadas() {
    if (detetado) setRedes((prev) => ({ ...prev, ...detetado.redes }));
  }

  const setB = (campo: keyof Brief, valor: unknown) => setBrief((b) => ({ ...b, [campo]: valor }));
  const um = (campo: keyof Brief, k: string) =>
    setBrief((b) => ({ ...b, [campo]: b[campo] === k ? undefined : k }));
  const varios = (campo: keyof Brief, k: string) =>
    setBrief((b) => {
      const arr = (b[campo] as string[] | undefined) ?? [];
      return { ...b, [campo]: arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k] };
    });

  // Máximo 3 objetivos, guardados por ordem de escolha = ordem de prioridade.
  function toggleObjetivo(k: ChaveObjetivo) {
    setObjetivos((o) => {
      if (o.includes(k)) return o.filter((x) => x !== k);
      if (o.length >= 3) return o;
      return [...o, k];
    });
  }
  function toggleCanal(k: ChaveCanal) {
    setPedido((prev) => {
      const atual = prev.canais[k] ?? { ativo: false, proprio: false };
      return { ...prev, canais: { ...prev.canais, [k]: { ...atual, ativo: !atual.ativo } } };
    });
  }

  const semObjetivos = objetivos.length === 0 && !objetivosTexto.trim();

  async function enviar() {
    if (semObjetivos) {
      setPasso(2);
      setErro(t.erroObj);
      return;
    }
    setEstado("a-enviar");
    setErro("");
    const r = await submeterIntake({
      token,
      website,
      redes,
      temHoje,
      objetivos,
      objetivosTexto,
      pedido,
      orcamento,
      brief,
    });
    if (r.ok) setEstado("enviado");
    else {
      setErro(r.erro);
      setEstado("erro");
    }
  }

  if (estado === "enviado") {
    return (
      <main className="grid min-h-dvh place-items-center px-5">
        <div className="w-full max-w-md text-center">
          <Simbolo className="mx-auto mb-6 w-20" titulo="Nº 5" />
          <h1 className="font-display text-3xl font-extrabold">{t.okTitulo}</h1>
          <p className="mt-3 text-grey">{t.okTexto(nome)}</p>
        </div>
      </main>
    );
  }

  const passos: { titulo: string; sub: string; corpo: React.ReactNode }[] = [
    {
      titulo: t.p1t,
      sub: t.p1s,
      corpo: (
        <>
          <Campo label={t.website}>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className={CAMPO} />
            {website.trim().length > 3 && !urlValido(website) && (
              <p className="mt-1 text-xs text-warn">{t.avisoUrl}</p>
            )}
            {website.trim() && (
              <button
                type="button"
                onClick={analisarSite}
                disabled={analisando}
                className="mt-2 rounded-full border border-gold-dark px-4 py-1.5 text-sm font-bold text-gold-dark disabled:opacity-60"
              >
                {analisando ? t.analisando : t.analisar}
              </button>
            )}
            {analiseFalhou && <p className="mt-2 text-sm text-soft">{t.analiseFalhou}</p>}
            {detetado && (
              <div className="mt-3 rounded-lg border-2 border-gold/40 bg-gold/5 p-3">
                <p className="text-sm font-bold">{t.detetadoTitulo}</p>
                <ul className="mt-1.5 space-y-0.5 text-sm text-grey">
                  {resumoInfoSite(detetado).map((l, i) => (
                    <li key={i}>• {l}</li>
                  ))}
                </ul>
                {Object.keys(detetado.redes).length > 0 && (
                  <button
                    type="button"
                    onClick={usarRedesDetetadas}
                    className="mt-2 rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-ink"
                  >
                    {t.usarRedes}
                  </button>
                )}
              </div>
            )}
          </Campo>
          <Campo label={t.redes}>
            <div className="grid gap-2 sm:grid-cols-2">
              {REDES_LINK.map(([k, nomeRede]) => (
                <input
                  key={k}
                  value={redes[k] ?? ""}
                  onChange={(e) => setRedes({ ...redes, [k]: e.target.value })}
                  placeholder={nomeRede}
                  className="rounded-lg border border-line px-3 py-2 text-sm"
                />
              ))}
            </div>
          </Campo>
          <Pergunta titulo={t.presencaQ}>
            <Chips opcoes={PRESENCA} L={L} ativo={(k) => brief.presenca === k} onSel={(k) => um("presenca", k)} />
          </Pergunta>
          <Campo label={t.temHoje}>
            <textarea value={temHoje} onChange={(e) => setTemHoje(e.target.value)} rows={2} placeholder={t.temHojePH} className={CAMPO} />
          </Campo>
        </>
      ),
    },
    {
      titulo: t.p2t,
      sub: t.p2s,
      corpo: (
        <>
          <Pergunta titulo={t.publicoQ}>
            <Chips opcoes={PUBLICO} L={L} ativo={(k) => brief.publico === k} onSel={(k) => um("publico", k)} />
          </Pergunta>
          <Pergunta titulo={t.ondeQ}>
            <Chips opcoes={ONDE} L={L} ativo={(k) => brief.onde === k} onSel={(k) => um("onde", k)} />
          </Pergunta>
          {ehB2C(brief) && (
            <Pergunta titulo={t.idadesQ} nota={t.varias}>
              <Chips opcoes={IDADES} L={L} multi ativo={(k) => (brief.idades ?? []).includes(k)} onSel={(k) => varios("idades", k)} />
            </Pergunta>
          )}
          {ehB2B(brief) && (
            <>
              <Campo label={t.setoresQ}>
                <input value={brief.setores ?? ""} onChange={(e) => setB("setores", e.target.value)} placeholder={t.setoresPH} className={CAMPO} />
              </Campo>
              <Pergunta titulo={t.cicloQ}>
                <Chips opcoes={CICLO_DECISAO} L={L} ativo={(k) => brief.ciclo_decisao === k} onSel={(k) => um("ciclo_decisao", k)} />
              </Pergunta>
            </>
          )}
          <Campo label={t.clienteValorQ}>
            <textarea value={brief.cliente_valor ?? ""} onChange={(e) => setB("cliente_valor", e.target.value)} rows={2} placeholder={t.clienteValorPH} className={CAMPO} />
          </Campo>
          <Campo label={t.clienteEvitarQ}>
            <input value={brief.cliente_evitar ?? ""} onChange={(e) => setB("cliente_evitar", e.target.value)} placeholder={t.clienteEvitarPH} className={CAMPO} />
          </Campo>
          <Campo label={t.publicoTxt}>
            <textarea value={brief.publico_texto ?? ""} onChange={(e) => setB("publico_texto", e.target.value)} rows={2} placeholder={t.publicoTxtPH} className={CAMPO} />
          </Campo>
        </>
      ),
    },
    {
      titulo: t.p3t,
      sub: t.p3s,
      corpo: (
        <>
          <Pergunta titulo={t.objQ} nota={t.objPrioridade}>
            <div className="flex flex-wrap gap-1.5">
              {OBJETIVOS.map((o) => {
                const idx = objetivos.indexOf(o[0] as ChaveObjetivo);
                const on = idx >= 0;
                const cheio = objetivos.length >= 3 && !on;
                return (
                  <button
                    key={o[0]}
                    type="button"
                    onClick={() => toggleObjetivo(o[0] as ChaveObjetivo)}
                    disabled={cheio}
                    className={`${chipClasse(on)} ${cheio ? "opacity-40" : ""}`}
                  >
                    {on && (
                      <span className="mr-1.5 inline-grid size-4 place-items-center rounded-full bg-ink text-[10px] font-bold text-gold">
                        {idx + 1}
                      </span>
                    )}
                    {L(o)}
                  </button>
                );
              })}
            </div>
          </Pergunta>
          <Campo label={t.objTxt}>
            <textarea value={objetivosTexto} onChange={(e) => setObjetivosTexto(e.target.value)} rows={3} placeholder={t.objTxtPH} className={CAMPO} />
            {objetivosTexto.trim().length > 0 && !respostaSubstancial(objetivosTexto) && (
              <p className="mt-1 text-xs text-warn">{t.avisoObjTexto}</p>
            )}
          </Campo>
        </>
      ),
    },
    {
      titulo: t.p4t,
      sub: t.p4s,
      corpo: (
        <>
          <Pergunta titulo={t.tomQ} nota={t.encaixam}>
            <Chips opcoes={TOM} L={L} multi ativo={(k) => (brief.tom ?? []).includes(k)} onSel={(k) => varios("tom", k)} />
          </Pergunta>
          <Campo label={t.sentirQ}>
            <textarea value={brief.sentir ?? ""} onChange={(e) => setB("sentir", e.target.value)} rows={2} placeholder={t.sentirPH} className={CAMPO} />
          </Campo>
          <Pergunta titulo={t.tratQ}>
            <Chips opcoes={TRATAMENTO} L={L} ativo={(k) => brief.tratamento === k} onSel={(k) => um("tratamento", k)} />
          </Pergunta>
        </>
      ),
    },
    {
      titulo: t.p5t,
      sub: t.p5s,
      corpo: (
        <>
          <Campo label={t.refQ} nota={t.refNota}>
            <textarea value={brief.referencias ?? ""} onChange={(e) => setB("referencias", e.target.value)} rows={2} placeholder={t.refPH} className={CAMPO} />
          </Campo>
          <Campo label={t.refGostoQ}>
            <textarea value={brief.referencias_gosto ?? ""} onChange={(e) => setB("referencias_gosto", e.target.value)} rows={2} placeholder={t.refGostoPH} className={CAMPO} />
          </Campo>
          <Campo label={t.evitarQ}>
            <textarea value={brief.evitar ?? ""} onChange={(e) => setB("evitar", e.target.value)} rows={2} placeholder={t.evitarPH} className={CAMPO} />
          </Campo>
          <Pergunta titulo={t.logoQ}>
            <Chips opcoes={LOGO} L={L} ativo={(k) => brief.logo === k} onSel={(k) => um("logo", k)} />
          </Pergunta>
          <Pergunta titulo={t.renovarQ}>
            <Chips opcoes={RENOVAR} L={L} ativo={(k) => brief.renovar === k} onSel={(k) => um("renovar", k)} />
          </Pergunta>
          <Pergunta titulo={t.materiaisQ} nota={t.maisQueUm}>
            <Chips opcoes={MATERIAIS} L={L} multi ativo={(k) => (brief.materiais ?? []).includes(k)} onSel={(k) => varios("materiais", k)} />
          </Pergunta>
          <Pergunta titulo={t.anexosQ} nota={t.anexosNota}>
            <AnexosIntake token={token} okTxt={t.anexosOk} erroTxt={t.anexosErro} />
          </Pergunta>
        </>
      ),
    },
    {
      titulo: t.p6t,
      sub: t.p6s,
      corpo: (
        <>
          <Pergunta titulo={t.siteProblemasQ} nota={t.maisQueUm}>
            <Chips opcoes={SITE_PROBLEMAS} L={L} multi ativo={(k) => (brief.site_problemas ?? []).includes(k)} onSel={(k) => varios("site_problemas", k)} />
          </Pergunta>
          {(() => {
            const rec = recomendacaoSite(brief.site_problemas, brief.site_estado);
            return rec ? (
              <p className="-mt-1 rounded-lg border border-gold/40 bg-gold/5 p-2.5 text-sm text-gold-dark">
                {t.recSite[rec]}
              </p>
            ) : null;
          })()}
          <Pergunta titulo={t.siteEstadoQ}>
            <Chips opcoes={SITE_ESTADO} L={L} ativo={(k) => brief.site_estado === k} onSel={(k) => um("site_estado", k)} />
          </Pergunta>
          <Pergunta titulo={t.siteNovoQ}>
            <Chips opcoes={SITE_NOVO} L={L} ativo={(k) => brief.site_novo === k} onSel={(k) => um("site_novo", k)} />
          </Pergunta>
          <Pergunta titulo={t.siteTipoQ} nota={t.maisQueUm}>
            <Chips opcoes={SITE_TIPO} L={L} multi ativo={(k) => (brief.site_tipo ?? []).includes(k)} onSel={(k) => varios("site_tipo", k)} />
          </Pergunta>
          <Campo label={t.siteFuncoesQ}>
            <textarea value={brief.site_funcoes ?? ""} onChange={(e) => setB("site_funcoes", e.target.value)} rows={2} placeholder={t.siteFuncoesPH} className={CAMPO} />
          </Campo>
        </>
      ),
    },
    {
      titulo: t.p7t,
      sub: t.p7s,
      corpo: (
        <>
          <Pergunta titulo={t.autoQ} nota={t.autoNota}>
            <Chips opcoes={AUTOMACAO} L={L} multi ativo={(k) => (brief.automacao ?? []).includes(k)} onSel={(k) => varios("automacao", k)} />
          </Pergunta>
          <Pergunta titulo={t.ferramentasQ} nota={t.maisQueUm}>
            <Chips opcoes={FERRAMENTAS} L={L} multi ativo={(k) => (brief.ferramentas ?? []).includes(k)} onSel={(k) => varios("ferramentas", k)} />
          </Pergunta>
          <Campo label={t.tarefaQ}>
            <textarea value={brief.tarefa_chata ?? ""} onChange={(e) => setB("tarefa_chata", e.target.value)} rows={2} placeholder={t.tarefaPH} className={CAMPO} />
          </Campo>
        </>
      ),
    },
    {
      titulo: t.pcT,
      sub: t.pcS,
      corpo: (
        <>
          <Pergunta titulo={t.leadsComoQ} nota={t.maisQueUm}>
            <Chips opcoes={LEADS_COMO} L={L} multi ativo={(k) => (brief.leads_como ?? []).includes(k)} onSel={(k) => varios("leads_como", k)} />
          </Pergunta>
          {recebeContactos(brief) && (
            <>
              <Pergunta titulo={t.leadsRespostaQ}>
                <Chips opcoes={LEADS_RESPOSTA} L={L} ativo={(k) => brief.leads_resposta === k} onSel={(k) => um("leads_resposta", k)} />
              </Pergunta>
              <Pergunta titulo={t.leadsRegistoQ}>
                <Chips opcoes={LEADS_REGISTO} L={L} ativo={(k) => brief.leads_registo === k} onSel={(k) => um("leads_registo", k)} />
              </Pergunta>
              <Pergunta titulo={t.leadsFollowupQ}>
                <Chips opcoes={LEADS_FOLLOWUP} L={L} ativo={(k) => brief.leads_followup === k} onSel={(k) => um("leads_followup", k)} />
              </Pergunta>
              <Campo label={t.leadsPerdaQ}>
                <textarea value={brief.leads_perda ?? ""} onChange={(e) => setB("leads_perda", e.target.value)} rows={2} placeholder={t.leadsPerdaPH} className={CAMPO} />
              </Campo>
            </>
          )}
        </>
      ),
    },
    {
      titulo: t.aqT,
      sub: t.aqS,
      corpo: (
        <>
          <Pergunta titulo={t.anunciosQ}>
            <Chips opcoes={SIM_NAO} L={L} ativo={(k) => brief.anuncios_investe === k} onSel={(k) => um("anuncios_investe", k)} />
          </Pergunta>
          {investeAnuncios(brief) ? (
            <Campo label={t.anunciosDetalheQ}>
              <textarea value={brief.anuncios_detalhe ?? ""} onChange={(e) => setB("anuncios_detalhe", e.target.value)} rows={3} placeholder={t.anunciosDetalhePH} className={CAMPO} />
            </Campo>
          ) : brief.anuncios_investe === "nao" ? (
            <Campo label={t.anunciosPorqueQ}>
              <textarea value={brief.anuncios_porque_nao ?? ""} onChange={(e) => setB("anuncios_porque_nao", e.target.value)} rows={2} placeholder={t.anunciosPorquePH} className={CAMPO} />
            </Campo>
          ) : null}
        </>
      ),
    },
    {
      titulo: t.p8t,
      sub: t.p8s,
      corpo: (
        <>
          <Pergunta titulo={t.canaisQ} nota={t.opcional}>
            <Chips
              opcoes={CANAIS.map(([k, n]) => [k, n, n] as Opcao)}
              L={L}
              multi
              ativo={(k) => !!pedido.canais[k as ChaveCanal]?.ativo}
              onSel={(k) => toggleCanal(k as ChaveCanal)}
            />
          </Pergunta>
          <Pergunta titulo={t.intencaoQ}>
            <Chips opcoes={INTENCAO} L={L} ativo={(k) => brief.intencao === k} onSel={(k) => um("intencao", k)} />
          </Pergunta>
          <Pergunta titulo={t.orcQ} nota={t.orcNota}>
            <Chips opcoes={FAIXAS_ORCAMENTO} L={L} ativo={(k) => orcamento === k} onSel={(k) => setOrcamento(orcamento === k ? "" : k)} />
          </Pergunta>
          <Pergunta titulo={t.arranqueQ}>
            <Chips opcoes={FAIXAS_ARRANQUE} L={L} ativo={(k) => brief.orcamento_arranque === k} onSel={(k) => um("orcamento_arranque", k)} />
          </Pergunta>
          <Campo label={t.ambicaoQ}>
            <textarea value={brief.ambicao ?? ""} onChange={(e) => setB("ambicao", e.target.value)} rows={2} placeholder={t.ambicaoPH} className={CAMPO} />
          </Campo>
          <Pergunta titulo={t.prazoQ}>
            <Chips opcoes={PRAZO} L={L} ativo={(k) => brief.prazo === k} onSel={(k) => um("prazo", k)} />
          </Pergunta>
          <Pergunta titulo={t.decideQ}>
            <Chips opcoes={DECISORES} L={L} ativo={(k) => brief.quem_decide === k} onSel={(k) => um("quem_decide", k)} />
          </Pergunta>
          {(brief.quem_decide === "direcao" || brief.quem_decide === "varios") && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Campo label={t.decisorNomeQ}>
                <input value={brief.decisor_nome ?? ""} onChange={(e) => setB("decisor_nome", e.target.value)} className={CAMPO} />
              </Campo>
              <Campo label={t.decisorContactoQ}>
                <input value={brief.decisor_contacto ?? ""} onChange={(e) => setB("decisor_contacto", e.target.value)} className={CAMPO} />
              </Campo>
            </div>
          )}
          <Campo label={t.notaFinalQ}>
            <textarea value={brief.nota_final ?? ""} onChange={(e) => setB("nota_final", e.target.value)} rows={2} placeholder={t.notaFinalPH} className={CAMPO} />
          </Campo>
        </>
      ),
    },
    {
      titulo: t.revT,
      sub: t.revS,
      corpo: (
        <div className="space-y-2.5">
          <ResumoLinha
            rot={t.revPublico}
            val={
              [rotulo("publico", brief.publico, idioma), rotulo("onde", brief.onde, idioma)]
                .filter(Boolean)
                .join(" · ") || t.revVazio
            }
            onEditar={() => setPasso(1)}
            editar={t.revEditar}
          />
          <ResumoLinha
            rot={t.revObjetivos}
            val={
              objetivos.map((k) => OBJETIVOS.find((o) => o[0] === k)).filter(Boolean).map((o) => (idioma === "en" ? o![2] : o![1])).join(" · ") ||
              (objetivosTexto.trim() ? objetivosTexto.trim() : t.revVazio)
            }
            onEditar={() => setPasso(2)}
            editar={t.revEditar}
          />
          <ResumoLinha
            rot={t.revSite}
            val={rotulo("site_estado", brief.site_estado, idioma) ?? t.revVazio}
            onEditar={() => setPasso(5)}
            editar={t.revEditar}
          />
          <ResumoLinha
            rot={t.revOrcamento}
            val={rotuloFaixa(orcamento, idioma) ?? t.revVazio}
            onEditar={() => setPasso(9)}
            editar={t.revEditar}
          />
          {brief.nota_final?.trim() && (
            <p className="rounded-lg border border-line bg-cream p-3 text-sm text-grey">
              {brief.nota_final}
            </p>
          )}
        </div>
      ),
    },
  ];

  const total = passos.length;
  const atual = passos[passo];
  const ultimo = passo === total - 1;

  // Guarda o rascunho para o cliente poder retomar (fire-and-forget).
  function guardarRascunho(novoPasso: number) {
    void guardarRascunhoIntake({
      token,
      passo: novoPasso,
      website,
      redes,
      temHoje,
      objetivos,
      objetivosTexto,
      pedido,
      orcamento,
      brief,
    });
  }

  function avancar() {
    if (passo === 2 && semObjetivos) {
      setErro(t.erroObj);
      return;
    }
    setErro("");
    const novo = Math.min(passo + 1, total - 1);
    setPasso(novo);
    guardarRascunho(novo);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function voltar() {
    setErro("");
    const novo = Math.max(0, passo - 1);
    setPasso(novo);
    guardarRascunho(novo);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      {passo === 0 ? (
        <header className="rounded-2xl bg-ink px-7 py-7 text-cream">
          <Simbolo fundo="escuro" className="mb-4 w-12" titulo="Nº 5" />
          <p className="rotulo !text-gold">{t.eyebrow}</p>
          <h1 className="mt-1.5 font-display text-2xl font-extrabold leading-tight sm:text-3xl">
            {t.titulo(nome)}
          </h1>
          <p className="mt-2 text-[15px] text-soft">{t.sub}</p>
        </header>
      ) : (
        <header className="flex items-center justify-between gap-3 rounded-xl bg-ink px-4 py-2.5 text-cream">
          <span className="flex items-center gap-2 truncate">
            <Simbolo fundo="escuro" className="w-6 shrink-0" titulo="Nº 5" />
            <b className="truncate font-display text-sm">{nome}</b>
          </span>
          <span className="shrink-0 font-mono text-[11px] text-soft">{t.passo(passo + 1, total)}</span>
        </header>
      )}

      {jaSubmetido && passo === 0 && (
        <p className="mt-4 rounded-lg border border-gold bg-gold/10 p-3 text-sm">{t.jaSubmetido}</p>
      )}

      {retomado && (
        <p className="mt-4 rounded-lg border border-good/40 bg-good/10 p-3 text-sm text-good">
          {t.retomado}
        </p>
      )}

      <div className="mt-6 mb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-grey">
          <span>{t.passo(passo + 1, total)}</span>
          <span className="text-soft">{Math.round(((passo + 1) / total) * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-gold transition-all duration-300" style={{ width: `${((passo + 1) / total) * 100}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-soft">{t.guardado}</p>
      </div>

      <section className="rounded-xl border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-xl font-extrabold">{atual.titulo}</h2>
        <p className="mb-4 mt-0.5 text-sm text-soft">{atual.sub}</p>
        <div className="space-y-5">{atual.corpo}</div>
      </section>

      {erro && <p className="mt-3 text-sm font-bold text-bad">{erro}</p>}

      <div className="mt-5 flex items-center gap-3">
        {passo > 0 && (
          <button type="button" onClick={voltar} className="rounded-full border border-line px-5 py-3 text-sm font-bold text-grey hover:text-ink">
            {t.voltar}
          </button>
        )}
        <span className="flex-1" />
        {ultimo ? (
          <button type="button" onClick={enviar} disabled={estado === "a-enviar"} className="rounded-full bg-gold px-7 py-3 text-lg font-bold text-ink transition hover:brightness-105 disabled:opacity-60">
            {estado === "a-enviar" ? t.aEnviar : t.enviar}
          </button>
        ) : (
          <button type="button" onClick={avancar} className="rounded-full bg-gold px-7 py-3 text-lg font-bold text-ink transition hover:brightness-105">
            {t.continuar}
          </button>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-soft">
        {t.rodape(setor)} {t.ver}{" "}
        <a href="https://numerocinco.pt/politica-de-privacidade/" target="_blank" rel="noopener" className="underline">
          {t.politica}
        </a>
        .
      </p>
    </main>
  );
}

const CAMPO =
  "w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-gold";

function chipClasse(on: boolean) {
  return `rounded-full border px-3.5 py-2 text-sm font-bold transition ${
    on ? "border-gold bg-gold text-ink" : "border-line bg-white text-grey hover:border-gold"
  }`;
}

function Chips({
  opcoes,
  L,
  ativo,
  onSel,
}: {
  opcoes: readonly Opcao[];
  L: (o: Opcao) => string;
  ativo: (k: string) => boolean;
  onSel: (k: string) => void;
  multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => (
        <button key={o[0]} type="button" onClick={() => onSel(o[0])} className={chipClasse(ativo(o[0]))}>
          {L(o)}
        </button>
      ))}
    </div>
  );
}

function ResumoLinha({
  rot,
  val,
  onEditar,
  editar,
}: {
  rot: string;
  val: string;
  onEditar: () => void;
  editar: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-white p-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-grey">{rot}</p>
        <p className="text-sm">{val}</p>
      </div>
      <button
        type="button"
        onClick={onEditar}
        className="shrink-0 text-xs font-bold text-gold-dark hover:underline"
      >
        {editar}
      </button>
    </div>
  );
}

function Pergunta({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-ink">
        {titulo}
        {nota && <span className="ml-2 font-normal text-soft">{nota}</span>}
      </p>
      {children}
    </div>
  );
}

function Campo({ label, nota, children }: { label: string; nota?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold text-ink">
        {label}
        {nota && <span className="ml-2 font-normal text-soft">{nota}</span>}
      </label>
      {children}
    </div>
  );
}

/** Upload opcional de materiais no intake público — envia para /api/intake-upload. */
function AnexosIntake({ token, okTxt, erroTxt }: { token: string; okTxt: string; erroTxt: string }) {
  const [itens, setItens] = useState<{ nome: string; estado: "a-enviar" | "ok" | "erro" }[]>([]);

  async function enviar(lista: FileList | null) {
    if (!lista) return;
    for (const f of Array.from(lista).slice(0, 5)) {
      setItens((v) => [...v, { nome: f.name, estado: "a-enviar" }]);
      const fd = new FormData();
      fd.set("token", token);
      fd.set("ficheiro", f);
      let ok = false;
      try {
        const r = await fetch("/api/intake-upload", { method: "POST", body: fd });
        ok = (await r.json())?.ok === true;
      } catch { /* fica erro */ }
      setItens((v) => v.map((i) => (i.nome === f.name && i.estado === "a-enviar" ? { ...i, estado: ok ? "ok" : "erro" } : i)));
    }
  }

  return (
    <div>
      <input
        type="file"
        multiple
        onChange={(e) => { void enviar(e.target.files); e.target.value = ""; }}
        className="block w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-gold file:px-4 file:py-1.5 file:text-sm file:font-bold file:text-ink"
      />
      {itens.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {itens.map((i, n) => (
            <li key={`${i.nome}-${n}`} className="flex items-center gap-2">
              <span className="truncate">📎 {i.nome}</span>
              {i.estado === "a-enviar" && <span className="text-soft">…</span>}
              {i.estado === "ok" && <span className="font-bold text-good">✓ {okTxt}</span>}
              {i.estado === "erro" && <span className="text-bad">{erroTxt}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
