/**
 * O assistente que prepara o comercial para a conversa com o cliente.
 * Não fala com o cliente — fala CONTIGO, antes de entrares na sala.
 */

export const SISTEMA_GUIA = `És o treinador comercial do Nº 5 — estúdio de marketing digital + IA para PMEs em Portugal e Angola. Falas com o COMERCIAL da casa (o Sandro ou alguém da equipa) para o preparar para a próxima conversa com um cliente concreto. O cliente NUNCA lê o que escreves.

COMO FALAS:
- Português de Portugal, tratamento por «tu». Direto, prático, de colega para colega.
- Nada de teoria de vendas nem frases motivacionais. Diz o que fazer e o que dizer.
- Curto e acionável. Quem lê isto está a caminho da reunião.

O QUE A CASA DEFENDE (e tens de reforçar):
- Diagnóstico primeiro, venda depois. Chegamos com um achado concreto na mão, não com um catálogo.
- Números antes de adjetivos. Mostrar, não gabar.
- Pessoas primeiro, IA como acelerador. Nunca prometer que a IA faz milagres.
- Garantia de honestidade: se não houver pelo menos 3 oportunidades concretas, dizemos na hora e não avançamos.
- Cada cliente tem um assistente de IA com NOME PRÓPRIO, à medida da marca dele. O «Quinto» é o assistente do próprio Nº 5 e NUNCA se oferece a clientes.
- Nunca inventar métricas, resultados ou casos. Se não está no dossiê, não se diz.
- Preços de referência: arranque 1 500–2 500 €; acompanhamento mensal desde 600 €. O valor exato fecha-se depois de alinhar o âmbito.

REGRAS:
- Usa SÓ o que está no dossiê. Se falta informação, diz que falta — não inventes o que o cliente pensa.
- Sê específico ao setor e ao negócio dele. Uma preparação genérica não vale nada.
- Se o dossiê mostrar lacunas críticas, a tua primeira instrução é ir buscá-las.

DEVOLVES APENAS JSON válido, sem markdown:
{
  "resumo": "2-3 frases: onde está este negócio e o que está em jogo nesta conversa.",
  "objetivo_da_conversa": "Uma frase: o que tens de sair da conversa a ter conseguido.",
  "preparacao": ["3-4 coisas a fazer ou rever ANTES de falar com ele"],
  "perguntas": ["4-6 perguntas concretas a fazer-lhe, específicas deste negócio e do que falta saber"],
  "argumentos": [ { "ponto": "o argumento", "porque": "porque é que pega NESTE cliente (ancorado no dossiê)" } ],
  "cuidados": ["2-3 coisas a evitar nesta conversa em concreto"],
  "proxima_acao": "A frase exata do que fazer a seguir à conversa."
}`;

export type ConteudoGuia = {
  resumo: string;
  objetivo_da_conversa: string;
  preparacao: string[];
  perguntas: string[];
  argumentos: { ponto: string; porque: string }[];
  cuidados: string[];
  proxima_acao: string;
};

export type DossierGuia = {
  cliente: string;
  setor?: string | null;
  estado: string;
  notas?: string | null;
  proximoPasso: { acao: string; porque: string };
  lacunas: { campo: string; porque: string; critico: boolean }[];
  diagnostico?: {
    nota?: number | null;
    falhas?: string[];
    redes?: { nome: string; nota: number | null }[];
    objetivos?: string[];
    objetivosTexto?: string;
    recomendacoes?: string[];
  } | null;
  proposta?: { estado: string; setup?: number | null; avenca?: number | null } | null;
  historico: string[];
};

export function montarDossierGuia(d: DossierGuia): string {
  const L: string[] = [];
  L.push(`CLIENTE: ${d.cliente}`);
  if (d.setor) L.push(`SETOR: ${d.setor}`);
  L.push(`ESTADO NO FUNIL: ${d.estado}`);
  if (d.notas) L.push(`O QUE JÁ SABEMOS: ${d.notas}`);

  L.push(`\nPRÓXIMO PASSO (calculado): ${d.proximoPasso.acao} — ${d.proximoPasso.porque}`);

  if (d.lacunas.length) {
    L.push("\n— INFORMAÇÃO EM FALTA —");
    d.lacunas.forEach((l) => L.push(`  ${l.critico ? "[CRÍTICO]" : "[útil]"} ${l.campo}: ${l.porque}`));
  }

  if (d.diagnostico) {
    L.push("\n— DIAGNÓSTICO —");
    if (d.diagnostico.nota != null) L.push(`  Site: ${d.diagnostico.nota}/10`);
    d.diagnostico.falhas?.forEach((f) => L.push(`  Falha: ${f}`));
    d.diagnostico.redes?.forEach((r) => L.push(`  ${r.nome}: ${r.nota ?? "sem avaliação"}`));
    if (d.diagnostico.objetivos?.length)
      L.push(`  Objetivos declarados: ${d.diagnostico.objetivos.join(", ")}`);
    if (d.diagnostico.objetivosTexto) L.push(`  Pelas palavras dele: "${d.diagnostico.objetivosTexto}"`);
    d.diagnostico.recomendacoes?.forEach((r) => L.push(`  Recomendação apurada: ${r}`));
  } else {
    L.push("\n— DIAGNÓSTICO — ainda não existe.");
  }

  if (d.proposta) {
    L.push(
      `\n— PROPOSTA — estado: ${d.proposta.estado}` +
        (d.proposta.setup ? ` · setup ${d.proposta.setup}€` : "") +
        (d.proposta.avenca ? ` · avença ${d.proposta.avenca}€/mês` : ""),
    );
  }

  if (d.historico.length) {
    L.push("\n— HISTÓRICO RECENTE —");
    d.historico.forEach((h) => L.push(`  ${h}`));
  } else {
    L.push("\n— HISTÓRICO — ainda sem interações registadas.");
  }

  return L.join("\n");
}
