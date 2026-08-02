/**
 * Sinais de valor da Sede — funções puras sobre as leads do cliente.
 * Usadas no painel, no assistente e no cartão «Na Sede» do operador.
 */

export type LeadSinal = {
  created_at?: string | null;
  primeira_resposta_at?: string | null;
  resultado?: string | null;
  arquivado?: boolean | null;
  origem?: string | null;
  valor_negocio?: number | null;
  ganho_em?: string | null;
};

/** Leads abertas, sem 1.ª resposta, há mais de `horas` — as que ardem. */
export function leadsLentas(leads: LeadSinal[], horas = 24, agora = Date.now()): number {
  const limite = agora - horas * 3600 * 1000;
  return leads.filter(
    (l) =>
      !l.arquivado &&
      l.resultado === "aberto" &&
      !l.primeira_resposta_at &&
      l.created_at != null &&
      new Date(l.created_at).getTime() < limite,
  ).length;
}

/** Canais que fecharam vendas, por valor total (só leads ganhas com valor). */
export function canaisQueVendem(leads: LeadSinal[]): { origem: string; total: number; n: number }[] {
  const m = new Map<string, { total: number; n: number }>();
  for (const l of leads) {
    if (l.resultado !== "ganho") continue;
    const k = (l.origem && l.origem.trim()) || "direto";
    const e = m.get(k) ?? { total: 0, n: 0 };
    e.total += Number(l.valor_negocio) || 0;
    e.n += 1;
    m.set(k, e);
  }
  return [...m.entries()]
    .map(([origem, v]) => ({ origem, ...v }))
    .sort((a, b) => b.total - a.total || b.n - a.n);
}

const ROTULO_ORIGEM: Record<string, string> = {
  meta_instant_form: "Anúncios (Meta)",
  meta: "Meta",
  facebook: "Facebook",
  instagram: "Instagram",
  google: "Google",
  site: "Site",
  formulario: "Formulário do site",
  manual: "Adicionada à mão",
  importado: "Importada",
  direto: "Direto",
};

export function rotuloOrigem(o: string | null | undefined): string {
  const k = (o && o.trim()) || "direto";
  return ROTULO_ORIGEM[k] ?? k;
}
