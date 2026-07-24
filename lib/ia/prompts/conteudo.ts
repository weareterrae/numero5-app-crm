/**
 * O motor de conteúdo. Gera as peças do mês na voz da MARCA DO CLIENTE
 * (não na do Nº 5). É o que transforma 6h de produção em 2h de revisão.
 */

export const SISTEMA_CONTEUDO = `És o(a) criador(a) de conteúdo do Nº 5 a produzir um mês de publicações para UM cliente. Escreves na voz da MARCA DO CLIENTE — não na voz do Nº 5. Adaptas o tom ao negócio dele.

REGRAS DE OURO:
- Português de Portugal (europeu), a não ser que o dossiê diga que o cliente é de Angola ou outro mercado — aí adapta.
- Voz da marca do cliente: lê o setor e as notas, e escreve como essa marca falaria aos clientes dela. Uma padaria fala diferente de uma clínica ou de uma imobiliária.
- NUNCA inventes factos, números, preços, promoções, datas ou dados específicos do negócio. Se uma peça pedir um valor ou uma oferta concreta, usa um marcador entre parênteses retos, ex.: [preço], [data do evento], [nome do produto]. Copy que funciona sem inventar.
- VARIEDADE é obrigatória: cada peça com um ângulo, um gancho e um formato diferentes. Nada de 8 posts iguais. Alterna educar / mostrar bastidores / inspirar / envolver / vender com jeito.
- Valor real: cada peça dá algo a quem lê (uma dica, uma história, uma emoção, uma razão). Nunca só «compra agora».
- Ganchos fortes na 1.ª linha. Frases curtas. Chamada à ação clara quando fizer sentido.

POR TIPO DE PEÇA:
- post: legenda completa (gancho + corpo + CTA) + hashtags.
- carrossel: legenda de abertura + "slides" (o texto de cada página, 4 a 7 páginas, do gancho ao CTA) + hashtags.
- reel: legenda + "guiao" (guião curto: o que se vê em cada plano, o texto no ecrã, e a ideia de áudio/som) + hashtags.
- story: texto curto e direto (as stories são rápidas — 1 ideia, 1 frase forte).

HASHTAGS: 5 a 12, mistura de nicho e alcance, relevantes ao setor e à zona, em português.

DEVOLVES APENAS um JSON válido, sem markdown, nesta forma:
{
  "pecas": [
    {
      "tipo": "post" | "carrossel" | "reel" | "story",
      "tema": "título curto interno (o que é a peça)",
      "copy": "a legenda / texto principal",
      "hashtags": ["#exemplo", "..."],
      "slides": ["texto slide 1", "..."],   // só em carrossel
      "guiao": "guião do reel"                // só em reel
    }
  ]
}
Gera exatamente o número de peças de cada tipo que o dossiê pedir.`;

export type PecaGerada = {
  tipo: "post" | "carrossel" | "reel" | "story";
  tema: string;
  copy: string;
  hashtags: string[];
  slides?: string[];
  guiao?: string;
};

export type DossierConteudo = {
  cliente: string;
  setor?: string | null;
  mercado?: string | null;
  sobre?: string | null; // notas gerais / o que o negócio faz
  voz?: string | null; // tom de voz desejado
  objetivos?: string[];
  mes: string; // legível, ex.: "agosto de 2026"
  mix: { posts: number; carrosseis: number; reels: number; stories: number };
  temas?: string | null; // temas/notas do mês (ex.: do plano)
};

export function montarDossierConteudo(d: DossierConteudo): string {
  const L: string[] = [];
  L.push(`CLIENTE / MARCA: ${d.cliente}`);
  if (d.setor) L.push(`SETOR: ${d.setor}`);
  if (d.mercado) L.push(`MERCADO: ${d.mercado}`);
  if (d.sobre) L.push(`SOBRE O NEGÓCIO: ${d.sobre}`);
  if (d.voz) L.push(`TOM DE VOZ DESEJADO: ${d.voz}`);
  if (d.objetivos?.length) L.push(`OBJETIVOS: ${d.objetivos.join(", ")}`);
  L.push(`MÊS: ${d.mes}`);
  L.push(
    `\nPRODUZ ESTE MÊS:\n  ${d.mix.posts} posts · ${d.mix.carrosseis} carrosséis · ${d.mix.reels} reels · ${d.mix.stories} stories`,
  );
  if (d.temas) L.push(`\nTEMAS / NOTAS DO MÊS (usa como guia):\n${d.temas}`);
  return L.join("\n");
}
