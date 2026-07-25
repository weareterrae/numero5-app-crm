/**
 * Mensagens de seguimento preparadas (Parte G). NUNCA são enviadas sozinhas —
 * são sugestões para o operador copiar/enviar. Bilingues, com [NOME]/[EMPRESA]
 * preenchidos. Puro e testável.
 */

export type SituacaoSeguimento =
  | "intake_incompleto"
  | "intake_submetido"
  | "proposta_enviada"
  | "proposta_sem_decisao";

type Idioma = "pt" | "en";

const MODELOS: Record<SituacaoSeguimento, Record<Idioma, (n: string, e: string) => string>> = {
  intake_incompleto: {
    pt: (n, e) =>
      `Olá, ${n}. O diagnóstico da ${e} ficou a meio. As respostas já estão guardadas — podes continuar exatamente onde paraste. 🖐️`,
    en: (n, e) =>
      `Hi ${n}. The ${e} diagnostic is half done. Your answers are saved — you can pick up right where you left off. 🖐️`,
  },
  intake_submetido: {
    pt: (n, e) =>
      `Obrigado, ${n}. Já temos o diagnóstico da ${e}. Vamos agora transformar as respostas numa leitura concreta e numa proposta com âmbito e investimento claros.`,
    en: (n, e) =>
      `Thank you, ${n}. We've got the ${e} diagnostic. We'll now turn your answers into a concrete reading and a proposal with clear scope and investment.`,
  },
  proposta_enviada: {
    pt: (n, e) =>
      `Olá, ${n}. A proposta da ${e} já está disponível. Preparámos duas leituras: aquilo que pediste e a solução que consideramos mais adequada.`,
    en: (n, e) =>
      `Hi ${n}. The ${e} proposal is ready. We prepared two readings: what you asked for and the solution we believe fits best.`,
  },
  proposta_sem_decisao: {
    pt: (n) =>
      `Olá, ${n}. Vi que já consultaste a proposta. Ficou alguma dúvida sobre o âmbito, o investimento ou a diferença entre as duas opções?`,
    en: (n) =>
      `Hi ${n}. I saw you've looked at the proposal. Any questions about the scope, the investment, or the difference between the two options?`,
  },
};

export function mensagemSeguimento(
  situacao: SituacaoSeguimento,
  dados: { nome?: string | null; empresa?: string | null },
  idioma: Idioma = "pt",
): string {
  const n = (dados.nome ?? "").trim() || (idioma === "en" ? "there" : "olá");
  const e = (dados.empresa ?? "").trim() || (idioma === "en" ? "your business" : "tua marca");
  return MODELOS[situacao][idioma](n, e);
}

/** Estado mínimo para escolher a mensagem certa. */
export type EstadoSeguimento = {
  intakeSubmetido: boolean;
  temRascunho: boolean;
  propostaEnviada: boolean;
  propostaVista: boolean;
  propostaDecidida: boolean;
};

/** Qual a mensagem de seguimento que faz sentido agora? (null = nenhuma). */
export function situacaoSeguimento(e: EstadoSeguimento): SituacaoSeguimento | null {
  if (e.propostaEnviada && !e.propostaDecidida) {
    return e.propostaVista ? "proposta_sem_decisao" : "proposta_enviada";
  }
  if (e.intakeSubmetido && !e.propostaEnviada) return "intake_submetido";
  if (e.temRascunho && !e.intakeSubmetido) return "intake_incompleto";
  return null;
}
