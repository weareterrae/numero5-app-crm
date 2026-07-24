/**
 * "Onde a Nº 5 pode ajudar" — cruza o que o diagnóstico ENCONTROU (lacunas
 * técnicas e das redes) com o que o cliente DISSE que quer, e propõe ações
 * concretas e o pacote que faz sentido.
 *
 * Regra da casa: cada recomendação diz de ONDE veio. Nada aparece por palpite.
 */

import type { Resultado } from "./verificacoes";

export type ChavePacote = "fundacao" | "motor" | "performance";

export type Recomendacao = {
  titulo: string;
  descricao: string;
  pacote_sugerido: ChavePacote;
  /** 1 = primeiro de tudo. */
  prioridade: number;
  /** A prova: o achado ou o objetivo que originou esta recomendação. */
  origem: string;
};

/** Objetivos comuns, para o cliente escolher (e ainda texto livre). */
export const OBJETIVOS = [
  ["mais_contactos", "Receber mais contactos e pedidos"],
  ["notoriedade", "Ser mais conhecido na zona"],
  ["site_novo", "Ter um site à altura do negócio"],
  ["redes_vivas", "Ter redes sociais vivas e com regularidade"],
  ["automatizar", "Automatizar o atendimento e as respostas"],
  ["lancar", "Lançar um produto ou serviço novo"],
  ["imagem", "Profissionalizar a imagem da marca"],
  ["vender_online", "Vender online"],
] as const;

export type ChaveObjetivo = (typeof OBJETIVOS)[number][0];

export type EntradaRecomendacoes = {
  temSite: boolean;
  notaSite: number | null;
  resultados: Resultado[];
  /** Redes avaliadas: nota 0–10 e quais os critérios fracos. */
  redes: { nome: string; nota: number | null; fracos: string[] }[];
  /** Canais essenciais sem qualquer presença. */
  semPresenca: string[];
  objetivos: ChaveObjetivo[];
};

const TITULO_POR_CODIGO: Record<string, { titulo: string; descricao: string; pacote: ChavePacote }> = {
  https: {
    titulo: "Pôr o site em ligação segura",
    descricao: "Sem cadeado, os browsers avisam que o site não é seguro e muita gente desiste ali.",
    pacote: "fundacao",
  },
  velocidade: {
    titulo: "Acelerar o site",
    descricao: "Cada segundo a mais custa visitas. Otimizamos imagens, alojamento e carregamento.",
    pacote: "fundacao",
  },
  titulo: {
    titulo: "Escrever títulos que apareçam no Google",
    descricao: "É a primeira frase que alguém lê nos resultados de pesquisa — tem de convencer.",
    pacote: "fundacao",
  },
  meta_desc: {
    titulo: "Escrever as descrições de pesquisa",
    descricao: "O texto que aparece por baixo do título no Google e decide o clique.",
    pacote: "fundacao",
  },
  viewport: {
    titulo: "Preparar o site para telemóvel",
    descricao: "A maioria das visitas chega por telemóvel. Se não se vê bem, perde-se.",
    pacote: "fundacao",
  },
  h1: {
    titulo: "Dizer em 5 segundos ao que o negócio vem",
    descricao: "Uma frase principal clara, no topo, que explica o que fazem e para quem.",
    pacote: "fundacao",
  },
  open_graph: {
    titulo: "Tratar do aspeto das partilhas",
    descricao: "Para que o link partilhado no WhatsApp ou Facebook apareça com imagem e título.",
    pacote: "fundacao",
  },
  alt_imagens: {
    titulo: "Descrever as imagens",
    descricao: "Ajuda quem usa leitor de ecrã e ajuda o Google a perceber o site.",
    pacote: "fundacao",
  },
  contacto: {
    titulo: "Pôr o contacto a um toque de distância",
    descricao: "Telefone e email clicáveis. No telemóvel, é a diferença entre uma chamada e um desistente.",
    pacote: "fundacao",
  },
  formulario: {
    titulo: "Criar forma de deixar contacto",
    descricao: "Sem formulário, cada visita interessada perde-se sem deixar rasto.",
    pacote: "fundacao",
  },
  redes_ligadas: {
    titulo: "Ligar o site às redes",
    descricao: "Quem gosta do site quer seguir a marca. Facilitamos o caminho nos dois sentidos.",
    pacote: "motor",
  },
};

/** Ações que nascem do que o cliente declarou querer. */
const POR_OBJETIVO: Record<ChaveObjetivo, { titulo: string; descricao: string; pacote: ChavePacote }> = {
  mais_contactos: {
    titulo: "Transformar visitas em contactos",
    descricao:
      "Trabalhamos as páginas e as mensagens para pedir o contacto no momento certo — e medimos quanto custa cada um.",
    pacote: "performance",
  },
  notoriedade: {
    titulo: "Fazer a marca aparecer na zona",
    descricao: "Conteúdo local com regularidade e ficha no Google tratada, para aparecer a quem procura por perto.",
    pacote: "motor",
  },
  site_novo: {
    titulo: "Construir o site que o negócio merece",
    descricao: "Um site rápido, claro e feito para converter — não um catálogo bonito que ninguém usa.",
    pacote: "fundacao",
  },
  redes_vivas: {
    titulo: "Pôr as redes a trabalhar todos os meses",
    descricao: "Plano mensal, publicações e reels com a cara da marca, e alguém a responder a quem aparece.",
    pacote: "motor",
  },
  automatizar: {
    titulo: "Assistente a responder 24/7",
    descricao:
      "Um assistente com o tom da marca a sugerir respostas a comentários e mensagens — com aprovação humana antes de sair.",
    pacote: "motor",
  },
  lancar: {
    titulo: "Preparar o lançamento",
    descricao: "Mensagem, materiais e calendário para o novo produto ou serviço entrar a ganhar.",
    pacote: "motor",
  },
  imagem: {
    titulo: "Arrumar a identidade da marca",
    descricao: "Como a marca fala e se mostra, documentado — para tudo o que sai parecer da mesma casa.",
    pacote: "fundacao",
  },
  vender_online: {
    titulo: "Preparar a venda online",
    descricao: "Loja ou catálogo com pagamento, e o caminho até à compra sem tropeços.",
    pacote: "fundacao",
  },
};

export function gerarRecomendacoes(e: EntradaRecomendacoes): Recomendacao[] {
  const recs: Recomendacao[] = [];

  // 1. Sem site é sempre a primeira prioridade.
  if (!e.temSite) {
    recs.push({
      titulo: "Construir a base: um site que explica e converte",
      descricao:
        "Sem site, todo o esforço nas redes fica sem casa. É a primeira coisa a resolver.",
      pacote_sugerido: "fundacao",
      prioridade: 1,
      origem: "Diagnóstico: não tem site",
    });
  }

  // 2. Falhas técnicas do site (as graves primeiro).
  for (const r of e.resultados) {
    if (r.estado === "ok") continue;
    const molde = TITULO_POR_CODIGO[r.codigo];
    if (!molde) continue;
    recs.push({
      titulo: molde.titulo,
      descricao: molde.descricao,
      pacote_sugerido: molde.pacote,
      prioridade: r.estado === "bad" ? 2 : 4,
      origem: `Análise do site: ${r.detalhe}`,
    });
  }

  // 3. Canais essenciais sem presença.
  for (const canal of e.semPresenca) {
    recs.push({
      titulo: `Marcar presença no ${canal}`,
      descricao: `Montar e otimizar o perfil, e passar a alimentá-lo com regularidade.`,
      pacote_sugerido: "motor",
      prioridade: 3,
      origem: `Diagnóstico: sem presença no ${canal}`,
    });
  }

  // 4. Redes que existem mas estão fracas.
  for (const rede of e.redes) {
    if (rede.nota === null || rede.nota >= 7) continue;
    recs.push({
      titulo: `Levantar o ${rede.nome}`,
      descricao:
        rede.fracos.length > 0
          ? `A trabalhar sobretudo: ${rede.fracos.join(", ")}.`
          : "Regularidade, qualidade e uma mensagem que encaminhe para o negócio.",
      pacote_sugerido: "motor",
      prioridade: rede.nota <= 3 ? 2 : 4,
      origem: `Scorecard: ${rede.nome} com ${rede.nota}/10`,
    });
  }

  // 5. O que o cliente pediu — entra sempre, e com prioridade alta.
  for (const obj of e.objetivos) {
    const molde = POR_OBJETIVO[obj];
    if (!molde) continue;
    const rotulo = OBJETIVOS.find(([k]) => k === obj)?.[1] ?? obj;
    recs.push({
      titulo: molde.titulo,
      descricao: molde.descricao,
      pacote_sugerido: molde.pacote,
      prioridade: 2,
      origem: `Objetivo do cliente: «${rotulo}»`,
    });
  }

  // Sem duplicados, e por prioridade.
  const vistos = new Set<string>();
  return recs
    .filter((r) => (vistos.has(r.titulo) ? false : (vistos.add(r.titulo), true)))
    .sort((a, b) => a.prioridade - b.prioridade);
}

/**
 * Que pacote propor. A base manda: sem casa arrumada não se mete gasolina.
 */
export function sugerirPacote(e: EntradaRecomendacoes): { chave: ChavePacote; porque: string } {
  const baseFraca = !e.temSite || (e.notaSite !== null && e.notaSite < 6);
  const querEscalar =
    e.objetivos.includes("mais_contactos") || e.objetivos.includes("vender_online");

  if (baseFraca) {
    return {
      chave: "fundacao",
      porque: !e.temSite
        ? "Não há site — a base tem de existir antes de tudo o resto."
        : "O site ainda não está a fazer o trabalho dele. Primeiro arruma-se a casa.",
    };
  }
  if (querEscalar) {
    return {
      chave: "performance",
      porque: "A base está sólida e o objetivo é trazer mais negócio — é altura de escalar com medição.",
    };
  }
  return {
    chave: "motor",
    porque: "A base está de pé; o que falta é constância mensal para a marca acontecer.",
  };
}
