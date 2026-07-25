/**
 * Biblioteca de conteúdos (Partes 46-47). Sugestões de reaproveitamento a partir
 * do formato e do desempenho. Puro e testável. As sugestões nunca publicam nada.
 */

export const FORMATOS_CONTEUDO: [string, string][] = [
  ["post", "Post"],
  ["carrossel", "Carrossel"],
  ["reel", "Reel"],
  ["story", "História"],
  ["artigo", "Artigo/blog"],
  ["video", "Vídeo"],
  ["email", "Email/newsletter"],
];

export const DESEMPENHO_CONTEUDO: [string, string][] = [
  ["fraco", "Fraco"],
  ["medio", "Médio"],
  ["bom", "Bom"],
  ["otimo", "Ótimo"],
];

export const ORIGEM_CONTEUDO: [string, string][] = [
  ["cliente", "Do cliente"],
  ["n5", "Produzido pelo Nº 5"],
  ["banco", "Banco de imagem"],
  ["licenca", "Com licença"],
  ["ia", "Criado com IA"],
];

export const LICENCA_CONTEUDO: [string, string][] = [
  ["livre", "Livre"],
  ["autorizada", "Autorizada pelo cliente"],
  ["com_licenca", "Com licença paga"],
  ["restrita", "Restrita"],
];

/** Sugestões de reaproveitamento — nunca publica, só sugere. */
export function sugestoesReaproveitamento(
  formato: string | null | undefined,
  desempenho?: string | null,
  reutilizavel: boolean = true,
): string[] {
  if (!reutilizavel) return [];
  const s: string[] = [];
  switch (formato) {
    case "post":
      s.push("Transformar em carrossel", "Adaptar a reel");
      break;
    case "carrossel":
      s.push("Transformar em reel", "Reutilizar o tema com novo ângulo");
      break;
    case "reel":
      s.push("Cortar em clips curtos", "Recuperar o tema num post");
      break;
    case "artigo":
      s.push("Dividir em carrossel", "Resumir num email");
      break;
    case "video":
      s.push("Cortar em reels", "Extrair posts com frases-chave");
      break;
    default:
      s.push("Adaptar a outro canal");
  }
  if (desempenho === "bom" || desempenho === "otimo") {
    s.unshift("Recuperar — teve bom desempenho");
  }
  return s;
}
