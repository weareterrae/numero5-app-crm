export type Idioma = "pt" | "en";
export const idiomaDe = (v: unknown): Idioma => (v === "en" ? "en" : "pt");

/** Faixas de orçamento que o cliente pode indicar (sempre opcional). */
export const FAIXAS_ORCAMENTO = [
  ["ate_500", "Até 500 €/mês", "Up to €500/mo"],
  ["500_1000", "500 – 1 000 €/mês", "€500 – €1,000/mo"],
  ["1000_2000", "1 000 – 2 000 €/mês", "€1,000 – €2,000/mo"],
  ["mais_2000", "Mais de 2 000 €/mês", "More than €2,000/mo"],
  ["nao_sei", "Ainda não sei", "Not sure yet"],
] as const;

export type FaixaOrcamento = (typeof FAIXAS_ORCAMENTO)[number][0];

export function rotuloFaixa(chave: string | null | undefined, idioma: Idioma = "pt"): string | null {
  if (!chave) return null;
  const o = FAIXAS_ORCAMENTO.find(([k]) => k === chave);
  return o ? (idioma === "en" ? o[2] : o[1]) : null;
}

// =====================================================================
// Diagnóstico profundo — as perguntas todas, PT + EN.
// Cada opção é [chave, PT, EN]. `[k, r]` continua a dar a chave e o PT.
// =====================================================================

export const PRESENCA = [
  ["quase_nada", "Quase nada, começo agora", "Barely anything, just starting"],
  ["sem_plano", "Vou publicando sem plano", "I post without a plan"],
  ["sem_resultados", "Tenho redes, mas sem resultados", "I'm on social, but no results"],
  ["ja_invisto", "Já invisto e quero mais", "I already invest and want more"],
] as const;

export const PUBLICO = [
  ["b2c", "Pessoas (particulares)", "People (consumers)"],
  ["b2b", "Outras empresas", "Other businesses"],
  ["ambos", "Um bocado dos dois", "A bit of both"],
] as const;

export const ONDE = [
  ["zona", "A minha zona", "My local area"],
  ["pais", "Todo o país", "The whole country"],
  ["pt_angola", "Portugal e Angola", "Portugal and Angola"],
  ["intl", "Lá fora também", "Abroad too"],
] as const;

export const IDADES = [
  ["jovens", "18–25", "18–25"],
  ["adultos", "25–40", "25–40"],
  ["meia", "40–60", "40–60"],
  ["seniores", "60+", "60+"],
  ["todos", "De tudo um pouco", "A bit of everything"],
] as const;

export const TOM = [
  ["proxima", "Próxima e calorosa", "Close and warm"],
  ["profissional", "Profissional e séria", "Professional and serious"],
  ["divertida", "Divertida e irreverente", "Fun and irreverent"],
  ["premium", "Elegante e premium", "Elegant and premium"],
  ["ousada", "Confiante e ousada", "Confident and bold"],
  ["direta", "Simples e direta", "Simple and direct"],
  ["inspiradora", "Inspiradora", "Inspiring"],
  ["especialista", "Especialista no assunto", "The expert"],
] as const;

export const TRATAMENTO = [
  ["tu", "Por tu", "Casual"],
  ["voce", "Por você", "Formal"],
  ["depende", "Depende de quem é", "Depends who it is"],
] as const;

export const LOGO = [
  ["atual", "Tenho e está atual", "Have one, it's current"],
  ["velho", "Tenho, mas está velhote", "Have one, but it's dated"],
  ["nao", "Não tenho / é fraquinho", "None / it's weak"],
] as const;

export const RENOVAR = [
  ["sim", "Sim, bora renovar", "Yes, let's refresh it"],
  ["talvez", "Talvez, mostra-me ideias", "Maybe, show me ideas"],
  ["nao", "Não, gosto do que tenho", "No, I like what I have"],
] as const;

export const SITE_ESTADO = [
  ["nao", "Não tenho site", "No website"],
  ["fraco", "Tenho, mas está fraco", "Have one, but it's weak"],
  ["melhorias", "Está bom, só uns retoques", "It's good, just needs tweaks"],
  ["otimo", "Está ótimo", "It's great"],
] as const;

export const SITE_NOVO = [
  ["sim", "Sim, quero um site novo", "Yes, I want a new site"],
  ["melhorias", "Só melhorias no atual", "Just improve the current one"],
  ["nao", "Por agora, não", "Not for now"],
] as const;

export const SITE_TIPO = [
  ["institucional", "Montra do negócio (institucional)", "Business showcase"],
  ["landing", "Página de campanha (landing)", "Campaign landing page"],
  ["loja", "Loja online", "Online store"],
  ["marcacoes", "Marcações / reservas", "Bookings / reservations"],
  ["blog", "Blog / conteúdo", "Blog / content"],
] as const;

export const AUTOMACAO = [
  ["assistente", "Assistente virtual no site (responde 24/7)", "Virtual assistant on the site (answers 24/7)"],
  ["chatbot", "Chatbot que apanha contactos", "Chatbot that captures leads"],
  ["whatsapp", "Respostas automáticas no WhatsApp", "Automatic WhatsApp replies"],
  ["marcacoes", "Marcações online", "Online bookings"],
  ["newsletter", "Newsletter e email marketing", "Newsletter & email marketing"],
  ["moderacao", "Responder a comentários e DMs", "Reply to comments & DMs"],
  ["anuncios", "Anúncios geridos por vocês", "Ads managed by you"],
] as const;

export const PRAZO = [
  ["ja", "O quanto antes 🔥", "As soon as possible 🔥"],
  ["meses", "Nos próximos meses", "In the coming months"],
  ["estudar", "Ainda ando a estudar", "Still exploring"],
] as const;

// ── Processo comercial (o que acontece depois do lead) ──────────────────────
export const LEADS_COMO = [
  ["telefone", "Ligam-me", "They call me"],
  ["formulario", "Formulário do site", "Website form"],
  ["redes", "Mensagens/comentários nas redes", "Social messages/comments"],
  ["email", "Email", "Email"],
  ["presencial", "Aparecem na loja/espaço", "They show up in person"],
  ["passa_palavra", "Passa-palavra", "Word of mouth"],
  ["ainda_nao", "Ainda não recebo contactos", "I don't get leads yet"],
] as const;

export const LEADS_RESPOSTA = [
  ["na_hora", "Quase na hora", "Almost right away"],
  ["mesmo_dia", "No mesmo dia", "Same day"],
  ["um_dois_dias", "1 a 2 dias", "1 to 2 days"],
  ["mais", "Mais de 2 dias", "More than 2 days"],
  ["sem_processo", "Não tenho um processo", "I have no process"],
] as const;

export const LEADS_REGISTO = [
  ["cabeca", "De cabeça", "In my head"],
  ["papel_folha", "Papel ou folha de cálculo", "Paper or spreadsheet"],
  ["crm", "Num CRM", "In a CRM"],
  ["nao_registo", "Não registo", "I don't track them"],
] as const;

export const LEADS_FOLLOWUP = [
  ["sempre", "Sim, faço sempre seguimento", "Yes, I always follow up"],
  ["as_vezes", "Às vezes", "Sometimes"],
  ["nao", "Não faço", "I don't"],
] as const;

export const SIM_NAO = [
  ["sim", "Sim", "Yes"],
  ["nao", "Não", "No"],
] as const;

// ── Tecnologia ──────────────────────────────────────────────────────────────
export const FERRAMENTAS = [
  ["crm", "CRM", "CRM"],
  ["email_mkt", "Email marketing", "Email marketing"],
  ["whatsapp", "WhatsApp Business", "WhatsApp Business"],
  ["agenda", "Agenda/marcações", "Calendar/bookings"],
  ["faturacao", "Faturação", "Invoicing"],
  ["nenhuma", "Nenhuma, ainda", "None, yet"],
] as const;

// ── Ambição/investimento ────────────────────────────────────────────────────
export const INTENCAO = [
  ["essencial", "Resolver o essencial", "Cover the essentials"],
  ["presenca", "Criar uma presença consistente", "Build a consistent presence"],
  ["departamento", "Ter um departamento de marketing externo", "Have an outsourced marketing dept"],
  ["acelerar", "Acelerar o crescimento", "Accelerate growth"],
] as const;

export const FAIXAS_ARRANQUE = [
  ["ate1500", "Até 1.500 €", "Up to €1,500"],
  ["1500_2500", "1.500 – 2.500 €", "€1,500 – €2,500"],
  ["2500_mais", "Mais de 2.500 €", "More than €2,500"],
  ["nao_sei", "Ainda não sei", "Not sure yet"],
] as const;

/** Tudo o que o cliente conta no diagnóstico profundo. Guardado em diagnosticos.brief. */
export type Brief = {
  presenca?: string;
  publico?: string;
  onde?: string;
  idades?: string[];
  publico_texto?: string;
  tom?: string[];
  sentir?: string;
  tratamento?: string;
  referencias?: string;
  referencias_gosto?: string;
  evitar?: string;
  logo?: string;
  renovar?: string;
  site_estado?: string;
  site_novo?: string;
  site_tipo?: string[];
  site_funcoes?: string;
  automacao?: string[];
  tarefa_chata?: string;
  ambicao?: string;
  prazo?: string;
  nota_final?: string;
  // Processo comercial (o que acontece depois do lead)
  leads_como?: string[];
  leads_resposta?: string;
  leads_registo?: string;
  leads_followup?: string;
  leads_perda?: string;
  // Aquisição / anúncios
  anuncios_investe?: string;
  anuncios_detalhe?: string;
  anuncios_porque_nao?: string;
  // Tecnologia
  ferramentas?: string[];
  // Ambição / investimento
  intencao?: string;
  orcamento_arranque?: string;
  // Detetado no website (verificável, para o cliente confirmar/corrigir)
  site_detetado?: Record<string, unknown>;
};

/** Todas as listas juntas, para traduzir chaves → rótulos. */
export const LISTAS_BRIEF: Record<string, readonly (readonly [string, string, string])[]> = {
  presenca: PRESENCA,
  publico: PUBLICO,
  onde: ONDE,
  idades: IDADES,
  tom: TOM,
  tratamento: TRATAMENTO,
  logo: LOGO,
  renovar: RENOVAR,
  site_estado: SITE_ESTADO,
  site_novo: SITE_NOVO,
  site_tipo: SITE_TIPO,
  automacao: AUTOMACAO,
  prazo: PRAZO,
  leads_como: LEADS_COMO,
  leads_resposta: LEADS_RESPOSTA,
  leads_registo: LEADS_REGISTO,
  leads_followup: LEADS_FOLLOWUP,
  anuncios_investe: SIM_NAO,
  ferramentas: FERRAMENTAS,
  intencao: INTENCAO,
  orcamento_arranque: FAIXAS_ARRANQUE,
};

// ── Lógica adaptativa (Parte 6): que perguntas fazem sentido mostrar ─────────

/** O cliente recebe contactos hoje? (senão, não perguntar tempo de resposta). */
export function recebeContactos(b: Brief): boolean {
  const como = b.leads_como ?? [];
  return como.length > 0 && !(como.length === 1 && como[0] === "ainda_nao");
}

/** O cliente investe em anúncios? (mostra detalhe vs. «porque ainda não»). */
export function investeAnuncios(b: Brief): boolean {
  return b.anuncios_investe === "sim";
}

/** O cliente tem site? (senão, não perguntar problemas técnicos do site). */
export function temSite(b: Brief): boolean {
  return !!b.site_estado && b.site_estado !== "nao";
}

// ── Validação inteligente das respostas (Parte 24) ──────────────────────────

const RESPOSTAS_LIXO = new Set([
  "teste", "test", "asdf", "asdfasdf", "qwerty", "xxx", "aaa", "abc",
  "na", "n/a", "-", ".", "..", "...", "nada", "nenhum", "nenhuma",
]);

/**
 * A resposta tem substância? (rejeita «teste», vazios, curtos, aleatórios).
 * «Não sei» conta como VAZIO — não é lixo, mas alimenta a informação em falta.
 */
export function respostaSubstancial(texto: string | null | undefined, minChars = 3): boolean {
  const t = (texto ?? "").trim().toLowerCase();
  if (t.length < minChars) return false;
  if (RESPOSTAS_LIXO.has(t)) return false;
  if (/^(.)\1{2,}$/.test(t.replace(/\s/g, ""))) return false; // aaaa, xxxx
  return true;
}

/** «Não sei / não se aplica / falo disto depois» — informação em falta, não erro. */
export function respostaAdiada(texto: string | null | undefined): boolean {
  const t = (texto ?? "").trim().toLowerCase();
  return ["não sei", "nao sei", "não se aplica", "nao se aplica", "depois", "later", "dunno", "idk"].some(
    (x) => t === x,
  );
}

export function urlValido(u: string | null | undefined): boolean {
  const s = (u ?? "").trim();
  if (!s || !s.includes(".")) return false;
  try {
    new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return true;
  } catch {
    return false;
  }
}

export function emailValido(e: string | null | undefined): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((e ?? "").trim());
}

/**
 * O processo comercial é fraco? Se sim, a proposta deve recomendar primeiro
 * organização/CRM/atendimento, não «mais anúncios». (Parte 16.)
 */
export function processoComercialFraco(b: Brief): boolean {
  const sinais = [
    b.leads_resposta === "mais" || b.leads_resposta === "sem_processo",
    b.leads_registo === "cabeca" || b.leads_registo === "nao_registo",
    b.leads_followup === "nao",
  ].filter(Boolean).length;
  return sinais >= 2;
}

/** Rótulo de uma chave numa dada lista, no idioma pedido. */
export function rotulo(lista: string, chave: string | undefined, idioma: Idioma = "pt"): string | null {
  if (!chave) return null;
  const o = LISTAS_BRIEF[lista]?.find(([k]) => k === chave);
  return o ? (idioma === "en" ? o[2] : o[1]) : chave;
}
