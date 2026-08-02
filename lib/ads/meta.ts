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

// ── Nível do anúncio (vista do operador) ─────────────────────────────────────

export type AnuncioMeta = {
  id: string;
  nome: string;
  campanha: string;
  estado: string;
  impressoes: number;
  cliques: number;
  ctr: number | null; // cliques / impressões
  investimento: number;
  leads: number;
  custo_por_lead: number | null;
};

/** Anúncios ATIVOS da conta com métricas dos últimos 30 dias. */
export async function anunciosAtivosMeta(
  accountId: string,
): Promise<{ ok: true; anuncios: AnuncioMeta[] } | { ok: false; erro: string }> {
  const token = process.env.META_ADS_TOKEN?.trim();
  if (!token) return { ok: false, erro: "META_ADS_TOKEN por configurar no Netlify." };
  const acc = accountId.replace(/^act_/, "").trim();
  if (!acc) return { ok: false, erro: "Conta de anúncios por definir." };

  try {
    const base = `https://graph.facebook.com/${V}/act_${acc}`;
    const filtro = encodeURIComponent(
      JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }]),
    );
    const [rAds, rIns] = await Promise.all([
      fetch(
        `${base}/ads?fields=id,name,effective_status,campaign{name}&filtering=${filtro}&limit=100&access_token=${encodeURIComponent(token)}`,
      ),
      fetch(
        `${base}/insights?level=ad&date_preset=last_30d&fields=ad_id,impressions,clicks,spend,actions&limit=200&access_token=${encodeURIComponent(token)}`,
      ),
    ]);
    if (!rAds.ok) {
      const t = await rAds.text();
      return { ok: false, erro: `Meta respondeu ${rAds.status}: ${t.slice(0, 140)}` };
    }
    const ads = (await rAds.json()) as {
      data?: { id: string; name: string; effective_status: string; campaign?: { name?: string } }[];
    };
    const ins = rIns.ok
      ? ((await rIns.json()) as {
          data?: { ad_id?: string; impressions?: string; clicks?: string; spend?: string; actions?: { action_type: string; value: string }[] }[];
        })
      : { data: [] };
    const porAd = new Map((ins.data ?? []).map((i) => [i.ad_id, i]));

    const anuncios: AnuncioMeta[] = (ads.data ?? []).map((a) => {
      const i = porAd.get(a.id);
      const impressoes = Number(i?.impressions) || 0;
      const cliques = Number(i?.clicks) || 0;
      const investimento = Number(i?.spend) || 0;
      const leads = (i?.actions ?? [])
        .filter((x) => ACOES_LEAD.has(x.action_type))
        .reduce((s, x) => s + (Number(x.value) || 0), 0);
      return {
        id: a.id,
        nome: a.name,
        campanha: a.campaign?.name ?? "—",
        estado: a.effective_status,
        impressoes,
        cliques,
        ctr: impressoes > 0 ? cliques / impressoes : null,
        investimento,
        leads,
        custo_por_lead: leads > 0 && investimento > 0 ? investimento / leads : null,
      };
    });
    anuncios.sort((a, b) => b.investimento - a.investimento);
    return { ok: true, anuncios };
  } catch (e) {
    return { ok: false, erro: String(e).slice(0, 140) };
  }
}
