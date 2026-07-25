/**
 * Extrai informação VERIFICÁVEL de uma página, para o cliente confirmar ou
 * corrigir no diagnóstico. Nunca assumir como verdade — é uma sugestão.
 * Parsing por regex (sem DOM no servidor), tolerante a HTML imperfeito.
 */

export type InfoSite = {
  nome: string | null;
  descricao: string | null;
  email: string | null;
  telefone: string | null;
  redes: Record<string, string>;
  temLoja: boolean;
  temBlog: boolean;
  temFormulario: boolean;
  temAssistente: boolean;
  idiomas: string[];
};

const REDES_HOST: [string, RegExp][] = [
  ["instagram", /https?:\/\/(?:www\.)?instagram\.com\/[^"'\s<>]+/gi],
  ["facebook", /https?:\/\/(?:www\.)?facebook\.com\/[^"'\s<>]+/gi],
  ["linkedin", /https?:\/\/(?:www\.)?linkedin\.com\/[^"'\s<>]+/gi],
  ["tiktok", /https?:\/\/(?:www\.)?tiktok\.com\/[^"'\s<>]+/gi],
  ["youtube", /https?:\/\/(?:www\.)?youtube\.com\/[^"'\s<>]+/gi],
];

function meta(html: string, ...nomes: string[]): string | null {
  for (const n of nomes) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${n}["'][^>]+content=["']([^"']+)["']`,
      "i",
    );
    const m = html.match(re) ?? html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${n}["']`, "i"),
    );
    if (m?.[1]?.trim()) return decodeHtml(m[1].trim());
  }
  return null;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function extrairInfoSite(html: string, urlFinal?: string): InfoSite {
  const h = html ?? "";

  const titulo = h.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const nome = meta(h, "og:site_name") ?? (titulo ? decodeHtml(titulo) : null);
  const descricao = meta(h, "description", "og:description");

  const mail = h.match(/mailto:([^"'?\s<>]+@[^"'?\s<>]+)/i)?.[1] ?? null;
  const tel = h.match(/tel:([+\d][\d\s()-]{5,})/i)?.[1]?.trim() ?? null;

  const redes: Record<string, string> = {};
  for (const [nomeRede, re] of REDES_HOST) {
    // Primeiro link que não seja de partilha (sharer/intent) — o perfil da marca.
    for (const m of h.matchAll(re)) {
      if (!/sharer|intent|share\?|\/plugins\//i.test(m[0])) {
        redes[nomeRede] = m[0];
        break;
      }
    }
  }

  const temLoja = /shopify|woocommerce|add[-_ ]?to[-_ ]?cart|adicionar ao carrinho|\/cart|\/checkout|\/loja|\/shop/i.test(h);
  const temBlog = /\/blog|\/noticias|\/news|\/artigos/i.test(h);
  const temFormulario = /<form[\s>]/i.test(h);
  const temAssistente = /intercom|crisp\.chat|tawk\.to|drift\.com|hubspot.*messages|widget.*chat|chat.*widget|wa\.me\//i.test(h);

  const idiomas = new Set<string>();
  const lang = h.match(/<html[^>]+lang=["']([a-z]{2})/i)?.[1];
  if (lang) idiomas.add(lang.toLowerCase());
  for (const m of h.matchAll(/hreflang=["']([a-z]{2})/gi)) idiomas.add(m[1].toLowerCase());

  return {
    nome,
    descricao,
    email: mail,
    telefone: tel,
    redes,
    temLoja,
    temBlog,
    temFormulario,
    temAssistente,
    idiomas: [...idiomas],
  };
}

/** Resumo curto (para o dossiê da IA / painel), só com o que foi detetado. */
export function resumoInfoSite(info: InfoSite): string[] {
  const L: string[] = [];
  if (info.nome) L.push(`Nome no site: ${info.nome}`);
  if (info.descricao) L.push(`Descrição: ${info.descricao}`);
  if (info.email) L.push(`Email: ${info.email}`);
  if (info.telefone) L.push(`Telefone: ${info.telefone}`);
  const redes = Object.keys(info.redes);
  if (redes.length) L.push(`Redes ligadas: ${redes.join(", ")}`);
  const traz: string[] = [];
  if (info.temLoja) traz.push("loja");
  if (info.temBlog) traz.push("blog");
  if (info.temFormulario) traz.push("formulário");
  if (info.temAssistente) traz.push("assistente/chat");
  if (traz.length) L.push(`Tem: ${traz.join(", ")}`);
  if (info.idiomas.length) L.push(`Idiomas: ${info.idiomas.join(", ")}`);
  return L;
}
