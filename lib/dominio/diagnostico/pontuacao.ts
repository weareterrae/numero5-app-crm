import type { Resultado } from "./verificacoes";

/** Peso de cada verificação. Sobrepõe-se com o que vier de verificacoes_catalogo. */
const PESO_BASE = 1;

const VALOR: Record<Resultado["estado"], number> = { ok: 1, warn: 0.5, bad: 0 };

/** Nota de 0 a 10 a partir dos resultados, com pesos opcionais por código. */
export function pontuarSite(
  resultados: Resultado[],
  pesos: Record<string, number> = {},
): number {
  if (resultados.length === 0) return 0;
  let obtido = 0;
  let total = 0;
  for (const r of resultados) {
    const peso = pesos[r.codigo] ?? PESO_BASE;
    obtido += VALOR[r.estado] * peso;
    total += peso;
  }
  return Math.round((obtido / total) * 10 * 10) / 10;
}

export function vereditoSite(nota: number): string {
  if (nota >= 9) return "Casa arrumada. Agora é escalar.";
  if (nota >= 7) return "Boa base. Com mão-cheia de afinações, muda de campeonato.";
  if (nota >= 4) return "Há muito por fazer — e isso é boa notícia: há muito para ganhar.";
  return "A base está por construir. É por aqui que se começa.";
}

/** Os 5 critérios com que avaliamos cada rede social, à mão. */
export const CRITERIOS_REDE = [
  "Perfil otimizado (bio clara, foto, link para o site)",
  "Identidade coerente (visual e mensagem alinhados)",
  "Regularidade (publica com frequência)",
  "Qualidade do conteúdo (mensagem clara, boa produção)",
  "Interação e conversão (responde, tem CTA, encaminha)",
] as const;

/** Média de um scorecard de redes (cada rede 0–2 em 5 critérios) para 0–10. */
export function pontuarRede(notas: (number | null)[]): number | null {
  const dadas = notas.filter((n): n is number => n !== null);
  if (dadas.length === 0) return null;
  const soma = dadas.reduce((a, b) => a + b, 0);
  return Math.round((soma / (dadas.length * 2)) * 10);
}
