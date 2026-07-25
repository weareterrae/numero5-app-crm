/**
 * Níveis de confiança das métricas (Partes 42-43). Nunca apresentar uma
 * estimativa como dado confirmado. Puro e testável — sem dependências.
 */

export type NivelConfianca =
  | "confirmado_sistema"
  | "reportado_plataforma"
  | "comunicado_cliente"
  | "estimado"
  | "indisponivel";

type Cor = "good" | "cobalt" | "grey" | "warn" | "soft";

export const CONFIANCA: Record<NivelConfianca, { pt: string; en: string; cor: Cor }> = {
  confirmado_sistema: { pt: "Confirmado pelo sistema", en: "Confirmed by the system", cor: "good" },
  reportado_plataforma: { pt: "Reportado pela plataforma", en: "Reported by the platform", cor: "cobalt" },
  comunicado_cliente: { pt: "Comunicado por ti", en: "Reported by you", cor: "grey" },
  estimado: { pt: "Estimado", en: "Estimated", cor: "warn" },
  indisponivel: { pt: "Indisponível", en: "Unavailable", cor: "soft" },
};

export function rotuloConfianca(nivel: string, idioma: "pt" | "en" = "pt"): string {
  const n = CONFIANCA[nivel as NivelConfianca];
  return n ? n[idioma] : nivel;
}

export function corConfianca(nivel: string): Cor {
  return CONFIANCA[nivel as NivelConfianca]?.cor ?? "grey";
}

/**
 * Confiança por defeito a partir do nome da métrica — a rede de segurança para
 * quando a métrica não traz um nível explícito. ROI/vendas nunca vêm como
 * «confirmado pelo sistema».
 */
export function confiancaPorDefeito(metrica: string): NivelConfianca {
  const m = (metrica ?? "").toLowerCase();
  if (/lead|formul|contact|marca|inscri|reserv/.test(m)) return "confirmado_sistema";
  if (/venda|receita|faturaç|sale|revenue/.test(m)) return "comunicado_cliente";
  if (/roi|retorno|lucro|profit/.test(m)) return "estimado";
  if (/alcance|reach|segu|follow|interaç|engag|tráfeg|traffic|visit|impress|clique|click/.test(m))
    return "reportado_plataforma";
  return "reportado_plataforma";
}
