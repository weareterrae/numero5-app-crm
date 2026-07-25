/**
 * Métricas de conversão do funil (Parte H). Puras e testáveis. Não apresentar
 * causalidade sem dados — estas são contagens e rácios honestos.
 */

export type ClienteFunil = {
  intake_token?: string | null;
  intake_submetido_em?: string | null;
};

export type PropostaFunil = {
  estado?: string | null; // rascunho|enviada|aceite|recusada
  setup_valor?: number | null;
  avenca_valor?: number | null;
  motivo_recusa?: string | null;
};

export type MetricasFunil = {
  diagnosticosEnviados: number; // clientes com link de diagnóstico
  diagnosticosSubmetidos: number;
  taxaSubmissao: number | null; // submetidos / enviados
  propostas: number;
  propostasEnviadas: number;
  propostasAceites: number;
  taxaAceitacao: number | null; // aceites / (enviadas+aceites+recusadas)
  setupMedio: number | null;
  mrrMedio: number | null;
  motivosRecusa: string[];
};

const rac = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function metricasFunil(clientes: ClienteFunil[], propostas: PropostaFunil[]): MetricasFunil {
  const enviados = clientes.filter((c) => !!c.intake_token).length;
  const submetidos = clientes.filter((c) => !!c.intake_submetido_em).length;

  const decididas = propostas.filter((p) =>
    ["enviada", "aceite", "recusada"].includes(p.estado ?? ""),
  );
  const aceites = propostas.filter((p) => p.estado === "aceite");
  const enviadasCount = propostas.filter((p) => p.estado === "enviada").length;

  const setups = aceites.map((p) => Number(p.setup_valor) || 0).filter((v) => v > 0);
  const avencas = aceites.map((p) => Number(p.avenca_valor) || 0).filter((v) => v > 0);
  const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

  const motivosRecusa = propostas
    .filter((p) => p.estado === "recusada" && (p.motivo_recusa ?? "").trim())
    .map((p) => (p.motivo_recusa as string).trim());

  return {
    diagnosticosEnviados: enviados,
    diagnosticosSubmetidos: submetidos,
    taxaSubmissao: rac(submetidos, enviados),
    propostas: propostas.length,
    propostasEnviadas: enviadasCount,
    propostasAceites: aceites.length,
    taxaAceitacao: rac(aceites.length, decididas.length),
    setupMedio: media(setups),
    mrrMedio: media(avencas),
    motivosRecusa,
  };
}
