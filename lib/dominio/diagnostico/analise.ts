/**
 * Análise interna do diagnóstico (Parte B). Tudo derivado de sinais REAIS do
 * brief — nada genérico, nada inventado. Interno; nunca visível ao cliente.
 */

import {
  investeAnuncios,
  processoComercialFraco,
  recebeContactos,
  temSite,
  type Brief,
} from "../intake";

export type EntradaAnalise = {
  brief: Brief;
  objetivos: string[];
  objetivosTexto?: string | null;
  siteScore?: number | null;
  orcamento?: string | null;
};

// ── Oportunidades concretas (cada uma ligada a um serviço do catálogo) ───────

export type Prioridade = "ja" | "seguir" | "depois";
export type Confianca = "alta" | "media";

export type Oportunidade = {
  titulo: string;
  problema: string;
  evidencia: string;
  servico: string | null; // chave do catálogo
  prioridade: Prioridade;
  confianca: Confianca;
};

export function oportunidades(e: EntradaAnalise): Oportunidade[] {
  const b = e.brief;
  const ops: Oportunidade[] = [];
  const det = b.site_detetado as { temFormulario?: boolean; temLoja?: boolean } | undefined;

  // 1. Funil comercial furado — a prioridade nº 1 se o processo é fraco.
  //    Oferta nossa: montar-lhe o CRM/portal (a Sede) para não perder contactos.
  if (processoComercialFraco(b)) {
    ops.push({
      titulo: "Um sítio para os contactos não se perderem (CRM/portal)",
      problema: "Os contactos não são respondidos a tempo, registados nem seguidos.",
      evidencia: "Respostas do diagnóstico sobre resposta, registo e seguimento de contactos.",
      servico: "crm_portal",
      prioridade: "ja",
      confianca: "alta",
    });
  }

  // 2. Anúncios antes do funil = desperdício.
  if (investeAnuncios(b) && processoComercialFraco(b)) {
    ops.push({
      titulo: "Arrumar o funil antes de escalar anúncios",
      problema: "Já se investe em anúncios, mas os contactos gerados perdem-se por falta de processo.",
      evidencia: "Investe em anúncios + processo comercial fraco.",
      servico: "config_tracking",
      prioridade: "ja",
      confianca: "alta",
    });
  }

  // 3. Site — em falta ou fraco.
  if (!temSite(b) || b.site_estado === "fraco" || b.site_novo === "sim") {
    ops.push({
      titulo: "Um site que trabalha (não só uma montra)",
      problema: !temSite(b)
        ? "Sem site próprio, a marca depende das redes dos outros."
        : "O site atual não converte visitas em contactos.",
      evidencia: !temSite(b) ? "Cliente indicou que não tem site." : "Estado do site / pedido de site novo.",
      servico: temSite(b) ? "site_melhorias" : "site_novo",
      prioridade: temSite(b) ? "seguir" : "ja",
      confianca: "media",
    });
  }

  // 4. Formulário/tracking em falta (detetado no site).
  if (temSite(b) && det && det.temFormulario === false) {
    ops.push({
      titulo: "Formulário com origem dos contactos",
      problema: "O site não capta contactos nem sabe de onde vêm.",
      evidencia: "Nenhum formulário detetado no site.",
      servico: "config_tracking",
      prioridade: "seguir",
      confianca: "alta",
    });
  }

  // 5. Assistente / automação que o cliente pediu.
  const auto = b.automacao ?? [];
  if (auto.some((k) => ["assistente", "chatbot", "whatsapp", "marcacoes"].includes(k))) {
    ops.push({
      titulo: "Assistente à medida da marca",
      problema: "Contactos e perguntas ficam sem resposta fora de horas.",
      evidencia: "O cliente pediu automação/assistente no diagnóstico.",
      servico: "assistente",
      prioridade: "seguir",
      confianca: "media",
    });
  }

  // 6. Medição — se não regista contactos, não sabe o que resulta.
  if (recebeContactos(b) && (b.leads_registo === "cabeca" || b.leads_registo === "nao_registo")) {
    ops.push({
      titulo: "Medir para decidir",
      problema: "Sem registo, não é possível saber que canal traz clientes.",
      evidencia: "Contactos guardados «de cabeça» ou não registados.",
      servico: "relatorio",
      prioridade: "seguir",
      confianca: "alta",
    });
  }

  // 7. Imagem — só quando o próprio sinaliza.
  if (b.renovar === "sim" || b.logo === "nao") {
    ops.push({
      titulo: "Renovar a imagem da marca",
      problema: "A imagem atual não faz jus ao negócio.",
      evidencia: "Cliente quer renovar a imagem / logótipo fraco.",
      servico: "identidade",
      prioridade: "depois",
      confianca: "media",
    });
  }

  return ops;
}

// ── Adequação do lead (interna, nunca visível ao cliente) ────────────────────

export type NivelAdequacao = "boa" | "possivel" | "risco" | "fora";

export type AdequacaoLead = {
  nivel: NivelAdequacao;
  fatores: string[];
  riscos: string[];
  emFalta: string[];
  recomendacao: string;
};

const ORC_FORTE = new Set(["600_1200", "1200_2500", "mais2500", "1500_2500", "2500_mais"]);
const ORC_FRACO = new Set(["ate300", "ate600", "ate1500", "nao_sei"]);

export function adequacaoLead(e: EntradaAnalise): AdequacaoLead {
  const b = e.brief;
  const fatores: string[] = [];
  const riscos: string[] = [];
  const emFalta: string[] = [];
  let pontos = 0;

  // Orçamento
  if (e.orcamento && ORC_FORTE.has(e.orcamento)) {
    fatores.push("Orçamento com folga para uma operação a sério.");
    pontos += 2;
  } else if (e.orcamento && ORC_FRACO.has(e.orcamento)) {
    riscos.push("Orçamento apertado para o que ambiciona.");
    pontos -= 1;
  } else {
    emFalta.push("Orçamento mensal.");
  }

  // Ambição / intenção
  if (b.intencao === "departamento" || b.intencao === "acelerar") {
    fatores.push("Quer um parceiro de marketing, não um remendo.");
    pontos += 1;
  } else if (b.intencao === "essencial") {
    riscos.push("Procura só o essencial — âmbito e expectativa a alinhar.");
  }

  // Clareza dos objetivos
  if (e.objetivos.length > 0 || (e.objetivosTexto ?? "").trim()) {
    fatores.push("Sabe o que quer alcançar.");
    pontos += 1;
  } else {
    emFalta.push("Objetivos do negócio.");
    pontos -= 1;
  }

  // Prazo
  if (b.prazo === "ja") {
    fatores.push("Quer arrancar já.");
    pontos += 1;
  } else if (b.prazo === "estudar") {
    riscos.push("Ainda em fase de estudo — pode demorar a decidir.");
  }

  // Processo comercial — não é impeditivo, mas condiciona.
  if (processoComercialFraco(b)) {
    riscos.push("Processo comercial por organizar (primeiro o funil, depois escala).");
  }

  const nivel: NivelAdequacao =
    pontos >= 3 ? "boa" : pontos >= 1 ? "possivel" : pontos >= -1 ? "risco" : "fora";

  const recomendacao =
    nivel === "boa"
      ? "Avança com confiança — encaixa no perfil."
      : nivel === "possivel"
        ? "Vale a pena, com âmbito bem definido e expectativas alinhadas."
        : nivel === "risco"
          ? "Prossegue com cautela: confirma orçamento e objetivos antes de investir tempo."
          : "Provavelmente fora do perfil hoje — sê honesto se não for a altura certa.";

  return { nivel, fatores, riscos, emFalta, recomendacao };
}

// ── Informação em falta (trava a proposta final se faltar o crítico) ─────────

export type InformacaoEmFalta = {
  suficiente: string[];
  confirmar: string[];
  critica: string[];
};

export function informacaoEmFalta(e: EntradaAnalise): InformacaoEmFalta {
  const b = e.brief;
  const suficiente: string[] = [];
  const confirmar: string[] = [];
  const critica: string[] = [];

  // Crítico: sem isto, o preço/âmbito não são fiáveis.
  if (e.objetivos.length === 0 && !(e.objetivosTexto ?? "").trim()) critica.push("Objetivos do negócio");
  else suficiente.push("Objetivos");

  if (!b.publico) critica.push("Quem é o cliente-alvo");
  else suficiente.push("Público-alvo");

  if (!e.orcamento) critica.push("Orçamento mensal");
  else suficiente.push("Orçamento");

  // A confirmar: não impede, mas deve ser validado.
  if (b.site_detetado) confirmar.push("Dados detetados no site (confirmar com o cliente)");
  if (recebeContactos(b) && !b.leads_resposta) confirmar.push("Tempo de resposta a contactos");
  if (!b.tom || (b.tom as unknown as string[])?.length === 0) confirmar.push("Tom de voz da marca");
  if (b.presenca) suficiente.push("Presença atual");

  return { suficiente, confirmar, critica };
}

/** Só se pode gerar a proposta final quando não falta informação crítica. */
export function podeGerarProposta(f: InformacaoEmFalta): boolean {
  return f.critica.length === 0;
}
