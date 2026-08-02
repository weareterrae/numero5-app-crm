/**
 * Anúncios Meta na Sede — SÓ LEITURA (ads_read).
 *
 *   META_ADS_TOKEN  = token de system user do Business Manager do Nº 5, com
 *                     acesso de leitura às contas de anúncios dos clientes.
 *                     Vive no Netlify — nunca no código nem na base.
 *
 * O ID da conta de cada marca vive em orgs.meta_ads_id (0061).
 */

const V = "v21.0";

export function metaAdsConfigurado(): boolean {
  return !!process.env.META_ADS_TOKEN?.trim();
}

export type CampanhaMeta = {
  id: string;
  nome: string;
  estado: string; // ACTIVE | PAUSED | ...
  objetivo: string | null;
  // Métricas dos últimos 30 dias (podem faltar se a campanha não correu)
  alcance: number;
  impressoes: number;
  cliques: number;
  investimento: number;
  moeda: string;
  leads: number;
  custo_por_lead: number | null;
};

type InsightRaw = {
  campaign_id?: string;
  reach?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  actions?: { action_type: string; value: string }[];
};

const ACOES_LEAD = new Set([
  "lead",
  "onsite_conversion.lead_grouped",
  "leadgen_grouped",
  "offsite_conversion.fb_pixel_lead",
]);

/** Campanhas da conta + métricas (30 dias). Nunca lança — devolve erro legível. */
export async function campanhasMeta(
  accountId: string,
): Promise<{ ok: true; campanhas: CampanhaMeta[]; moeda: string } | { ok: false; erro: string }> {
  const token = process.env.META_ADS_TOKEN?.trim();
  if (!token) return { ok: false, erro: "META_ADS_TOKEN por configurar no Netlify." };
  const acc = accountId.replace(/^act_/, "").trim();
  if (!acc) return { ok: false, erro: "Conta de anúncios por definir." };

  try {
    const base = `https://graph.facebook.com/${V}/act_${acc}`;
    const [rConta, rCamp, rIns] = await Promise.all([
      fetch(`${base}?fields=currency&access_token=${encodeURIComponent(token)}`),
      fetch(
        `${base}/campaigns?fields=id,name,effective_status,objective&limit=50&access_token=${encodeURIComponent(token)}`,
      ),
      fetch(
        `${base}/insights?level=campaign&date_preset=last_30d&fields=campaign_id,reach,impressions,clicks,spend,actions&limit=50&access_token=${encodeURIComponent(token)}`,
      ),
    ]);
    if (!rCamp.ok) {
      const t = await rCamp.text();
      return { ok: false, erro: `Meta respondeu ${rCamp.status}: ${t.slice(0, 140)}` };
    }
    const conta = (await rConta.json().catch(() => ({}))) as { currency?: string };
    const moeda = conta.currency || "EUR";
    const camp = (await rCamp.json()) as {
      data?: { id: string; name: string; effective_status: string; objective?: string }[];
    };
    const ins = rIns.ok ? ((await rIns.json()) as { data?: InsightRaw[] }) : { data: [] };
    const porCampanha = new Map<string, InsightRaw>();
    for (const i of ins.data ?? []) if (i.campaign_id) porCampanha.set(i.campaign_id, i);

    const campanhas: CampanhaMeta[] = (camp.data ?? []).map((c) => {
      const i = porCampanha.get(c.id);
      const leads = (i?.actions ?? [])
        .filter((a) => ACOES_LEAD.has(a.action_type))
        .reduce((s, a) => s + (Number(a.value) || 0), 0);
      const investimento = Number(i?.spend) || 0;
      return {
        id: c.id,
        nome: c.name,
        estado: c.effective_status,
        objetivo: c.objective ?? null,
        alcance: Number(i?.reach) || 0,
        impressoes: Number(i?.impressions) || 0,
        cliques: Number(i?.clicks) || 0,
        investimento,
        moeda,
        leads,
        custo_por_lead: leads > 0 && investimento > 0 ? investimento / leads : null,
      };
    });
    // Ativas primeiro, depois por investimento.
    campanhas.sort(
      (a, b) =>
        Number(b.estado === "ACTIVE") - Number(a.estado === "ACTIVE") ||
        b.investimento - a.investimento,
    );
    return { ok: true, campanhas, moeda };
  } catch (e) {
    return { ok: false, erro: String(e).slice(0, 140) };
  }
}
