/** Faixas de orçamento que o cliente pode indicar (sempre opcional). */
export const FAIXAS_ORCAMENTO = [
  ["ate_500", "Até 500 €/mês"],
  ["500_1000", "500 – 1 000 €/mês"],
  ["1000_2000", "1 000 – 2 000 €/mês"],
  ["mais_2000", "Mais de 2 000 €/mês"],
  ["nao_sei", "Ainda não sei"],
] as const;

export type FaixaOrcamento = (typeof FAIXAS_ORCAMENTO)[number][0];

export function rotuloFaixa(chave: string | null | undefined): string | null {
  if (!chave) return null;
  return FAIXAS_ORCAMENTO.find(([k]) => k === chave)?.[1] ?? null;
}

// =====================================================================
// Diagnóstico profundo — as perguntas todas, no tom do Nº 5.
// Escolhas rápidas (o cliente toca e avança) que nos dão um brief a sério.
// =====================================================================

export const PRESENCA = [
  ["quase_nada", "Quase nada, começo agora"],
  ["sem_plano", "Vou publicando sem plano"],
  ["sem_resultados", "Tenho redes, mas sem resultados"],
  ["ja_invisto", "Já invisto e quero mais"],
] as const;

export const PUBLICO = [
  ["b2c", "Pessoas (particulares)"],
  ["b2b", "Outras empresas"],
  ["ambos", "Um bocado dos dois"],
] as const;

export const ONDE = [
  ["zona", "A minha zona"],
  ["pais", "Todo o país"],
  ["pt_angola", "Portugal e Angola"],
  ["intl", "Lá fora também"],
] as const;

export const IDADES = [
  ["jovens", "18–25"],
  ["adultos", "25–40"],
  ["meia", "40–60"],
  ["seniores", "60+"],
  ["todos", "De tudo um pouco"],
] as const;

export const TOM = [
  ["proxima", "Próxima e calorosa"],
  ["profissional", "Profissional e séria"],
  ["divertida", "Divertida e irreverente"],
  ["premium", "Elegante e premium"],
  ["ousada", "Confiante e ousada"],
  ["direta", "Simples e direta"],
  ["inspiradora", "Inspiradora"],
  ["especialista", "Especialista no assunto"],
] as const;

export const TRATAMENTO = [
  ["tu", "Por tu"],
  ["voce", "Por você"],
  ["depende", "Depende de quem é"],
] as const;

export const LOGO = [
  ["atual", "Tenho e está atual"],
  ["velho", "Tenho, mas está velhote"],
  ["nao", "Não tenho / é fraquinho"],
] as const;

export const RENOVAR = [
  ["sim", "Sim, bora renovar"],
  ["talvez", "Talvez, mostra-me ideias"],
  ["nao", "Não, gosto do que tenho"],
] as const;

export const SITE_ESTADO = [
  ["nao", "Não tenho site"],
  ["fraco", "Tenho, mas está fraco"],
  ["melhorias", "Está bom, só uns retoques"],
  ["otimo", "Está ótimo"],
] as const;

export const SITE_NOVO = [
  ["sim", "Sim, quero um site novo"],
  ["melhorias", "Só melhorias no atual"],
  ["nao", "Por agora, não"],
] as const;

export const SITE_TIPO = [
  ["institucional", "Montra do negócio (institucional)"],
  ["landing", "Página de campanha (landing)"],
  ["loja", "Loja online"],
  ["marcacoes", "Marcações / reservas"],
  ["blog", "Blog / conteúdo"],
] as const;

export const AUTOMACAO = [
  ["assistente", "Assistente virtual no site (responde 24/7)"],
  ["chatbot", "Chatbot que apanha contactos"],
  ["whatsapp", "Respostas automáticas no WhatsApp"],
  ["marcacoes", "Marcações online"],
  ["newsletter", "Newsletter e email marketing"],
  ["moderacao", "Responder a comentários e DMs"],
  ["anuncios", "Anúncios geridos por vocês"],
] as const;

export const PRAZO = [
  ["ja", "O quanto antes 🔥"],
  ["meses", "Nos próximos meses"],
  ["estudar", "Ainda ando a estudar"],
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
};

/** Todas as listas juntas, para traduzir chaves → rótulos onde for preciso. */
export const LISTAS_BRIEF: Record<string, readonly (readonly [string, string])[]> = {
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
};

/** Rótulo de uma chave numa dada lista. */
export function rotulo(lista: string, chave: string | undefined): string | null {
  if (!chave) return null;
  return LISTAS_BRIEF[lista]?.find(([k]) => k === chave)?.[1] ?? chave;
}
