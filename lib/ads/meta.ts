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

/**
 * Todas as chamadas ao Graph passam por aqui:
 *  · tempo limitado (8s) — um pedido lento do Meta deixava a página /anuncios
 *    pendurada até o SSR da Netlify a matar (nunca chegava a renderizar);
 *  · cache de 5 min do Next — o operador e a Sede não martelam a API a cada
 *    vista; números de anúncios não precisam de ser ao segundo.
 */
const fetchG = (url: string) =>
  globalThis.fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 300 } });

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

// O Meta devolve o MESMO contacto em vários action_types sobrepostos: "lead" é o total
// canónico e os outros são as parcelas que o compõem (ex.: lead=60 = lead_grouped=56 +
// fb_pixel_lead=4). Somá-los duplicava os contactos mostrados ao cliente.
const ACOES_LEAD = [
  "onsite_conversion.lead_grouped",
  "leadgen_grouped",
  "offsite_conversion.fb_pixel_lead",
];

/** Contactos gerados: usa o total canónico "lead"; sem ele, a maior das parcelas. Nunca soma. */
function contarLeads(actions?: { action_type: string; value: string }[]): number {
  const valor = (t: string) => Number(actions?.find((a) => a.action_type === t)?.value) || 0;
  const total = valor("lead");
  return total > 0 ? total : Math.max(0, ...ACOES_LEAD.map(valor));
}

/**
 * Campanhas da conta + métricas (30 dias). Nunca lança — devolve erro legível.
 *
 * Devolve também `alcanceReal`: pessoas ÚNICAS alcançadas na conta, pedido a level=account.
 * Somar o alcance de cada campanha conta a mesma pessoa uma vez por campanha em que caiu —
 * na Terrae dava 242 997 contra 185 729 reais (1,31x). Para mostrar ao cliente usa-se este.
 */
export async function campanhasMeta(
  accountId: string,
): Promise<
  | { ok: true; campanhas: CampanhaMeta[]; moeda: string; alcanceReal: number | null }
  | { ok: false; erro: string }
> {
  const token = process.env.META_ADS_TOKEN?.trim();
  if (!token) return { ok: false, erro: "META_ADS_TOKEN por configurar no Netlify." };
  const acc = accountId.replace(/^act_/, "").trim();
  if (!acc) return { ok: false, erro: "Conta de anúncios por definir." };

  try {
    const base = `https://graph.facebook.com/${V}/act_${acc}`;
    const [rConta, rCamp, rIns, rGlobal] = await Promise.all([
      fetchG(`${base}?fields=currency&access_token=${encodeURIComponent(token)}`),
      fetchG(
        // effective_status explícito: sem ele a API omite campanhas (visto na Massa Prima).
        `${base}/campaigns?fields=id,name,effective_status,objective&effective_status=${encodeURIComponent('["ACTIVE","PAUSED","ARCHIVED"]')}&limit=50&access_token=${encodeURIComponent(token)}`,
      ),
      fetchG(
        `${base}/insights?level=campaign&date_preset=last_30d&fields=campaign_id,reach,impressions,clicks,spend,actions&limit=50&access_token=${encodeURIComponent(token)}`,
      ),
      fetchG(
        `${base}/insights?level=account&date_preset=last_30d&fields=reach&access_token=${encodeURIComponent(token)}`,
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
      const leads = contarLeads(i?.actions);
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
    const global = rGlobal.ok
      ? ((await rGlobal.json().catch(() => ({}))) as { data?: { reach?: string }[] })
      : {};
    const alcanceReal = Number(global.data?.[0]?.reach) || null;
    return { ok: true, campanhas, moeda, alcanceReal };
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
      fetchG(
        `${base}/ads?fields=id,name,effective_status,campaign{name}&filtering=${filtro}&limit=100&access_token=${encodeURIComponent(token)}`,
      ),
      fetchG(
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
      const leads = contarLeads(i?.actions);
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

// ── Vista RICA: criativo + público + métricas (para a Sede) ──────────────────

export type AnuncioRico = {
  id: string;
  nome: string;
  campanha: string;
  campanhaAtiva: boolean;
  ativo: boolean; // ainda a correr agora (vs. já parado, mas com entrega no período)
  publico: string; // em português simples
  imagem: string | null;
  titulo: string | null;
  corpo: string | null;
  cta: string | null;
  formato: "imagem" | "vídeo" | "carrossel" | "anúncio";
  impressoes: number;
  alcance: number;
  frequencia: number | null;
  cliques: number;
  ctr: number | null;
  investimento: number;
  leads: number;
  custo_por_lead: number | null;
  moeda: string;
};

const PAIS: Record<string, string> = {
  PT: "Portugal", AO: "Angola", ES: "Espanha", FR: "França", BR: "Brasil",
  GB: "Reino Unido", DE: "Alemanha", MZ: "Moçambique", CV: "Cabo Verde",
};
const CTA_PT: Record<string, string> = {
  LEARN_MORE: "Saber mais", SHOP_NOW: "Comprar agora", SIGN_UP: "Registar",
  SEND_MESSAGE: "Enviar mensagem", MESSAGE_PAGE: "Enviar mensagem",
  CONTACT_US: "Contactar", GET_QUOTE: "Pedir orçamento", BOOK_NOW: "Reservar",
  BOOK_TRAVEL: "Reservar", DOWNLOAD: "Descarregar", CALL_NOW: "Ligar",
  WHATSAPP_MESSAGE: "WhatsApp", APPLY_NOW: "Candidatar", SUBSCRIBE: "Subscrever",
  GET_DIRECTIONS: "Como chegar", ORDER_NOW: "Encomendar", GET_OFFER: "Ver oferta",
  SEE_DETAILS: "Ver detalhes", SEE_MENU: "Ver menu", REQUEST_TIME: "Marcar", DONATE_NOW: "Doar",
};

// Limpa nomes de locais da Meta (vêm em inglês): «Lisbon District» → «Lisboa».
const LOCAL_PT: Record<string, string> = {
  Lisbon: "Lisboa", Oporto: "Porto", Setubal: "Setúbal", Faro: "Faro", Braga: "Braga",
  Coimbra: "Coimbra", Aveiro: "Aveiro", Luanda: "Luanda", Benguela: "Benguela",
};
function limparLocal(nome: string): string {
  let n = nome.replace(/\s+(District|Province|Region|County)$/i, "").trim();
  n = LOCAL_PT[n] ?? n;
  return n;
}

type Targeting = {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: {
    countries?: string[];
    cities?: { name?: string }[];
    regions?: { name?: string }[];
    custom_locations?: { radius?: number; distance_unit?: string }[];
  };
  interests?: { name?: string }[];
  flexible_spec?: { interests?: { name?: string }[] }[];
  targeting_automation?: { advantage_audience?: number };
};

function humanizarPublico(t: Targeting | null | undefined): string {
  if (!t) return "Público amplo";
  const p: string[] = [];
  const g = t.genders;
  if (!g || g.length === 0 || (g.includes(1) && g.includes(2))) p.push("Homens e mulheres");
  else if (g.includes(1)) p.push("Homens");
  else if (g.includes(2)) p.push("Mulheres");
  if (t.age_min || t.age_max) p.push(`${t.age_min ?? 18}–${t.age_max ?? 65}${(t.age_max ?? 65) >= 65 ? "+" : ""} anos`);
  const geo = t.geo_locations ?? {};
  const locs: string[] = [];
  for (const c of geo.cities ?? []) if (c.name) locs.push(limparLocal(c.name));
  for (const r of geo.regions ?? []) if (r.name) locs.push(limparLocal(r.name));
  for (const c of geo.countries ?? []) locs.push(PAIS[c] ?? c);
  const cl = geo.custom_locations?.[0];
  if (cl?.radius) locs.push(`num raio de ${cl.radius} ${cl.distance_unit === "mile" ? "mi" : "km"}`);
  if (locs.length) p.push(locs.slice(0, 4).join(", "));
  const ints: string[] = [];
  for (const fs of t.flexible_spec ?? []) for (const i of fs.interests ?? []) if (i.name) ints.push(i.name);
  for (const i of t.interests ?? []) if (i.name) ints.push(i.name);
  if (ints.length) p.push(`interesses: ${ints.slice(0, 5).join(", ")}`);
  if (t.targeting_automation?.advantage_audience === 1 && !ints.length && locs.length <= 1)
    p.push("com otimização automática de público");
  return p.join(" · ") || "Público amplo";
}

type CreativeRaw = {
  title?: string;
  body?: string;
  image_url?: string;
  thumbnail_url?: string;
  object_type?: string;
  call_to_action_type?: string;
  object_story_spec?: {
    link_data?: { picture?: string; message?: string; name?: string; child_attachments?: unknown[]; call_to_action?: { type?: string } };
    video_data?: { image_url?: string; message?: string; call_to_action?: { type?: string } };
  };
};

/**
 * Anúncios COM ENTREGA nos últimos 30 dias — não só os que ainda estão a correr.
 *
 * Filtrar por effective_status=ACTIVE escondia o essencial: na Terrae havia 4 anúncios
 * ativos mas 73 com entrega no período. Como os totais no topo vêm de TODAS as campanhas,
 * a lista não explicava para onde tinha ido o dinheiro.
 *
 * ORDEM DAS PERGUNTAS (importa para a velocidade): primeiro pedimos os insights ao nível
 * do anúncio — uma chamada, só quem entregou — e só depois vamos buscar criativo e público
 * DESSES anúncios, em lotes de 50 por ids. Percorrer /ads com creative+insights expandidos
 * obrigava a paginar centenas de anúncios e a página da Sede não chegava a renderizar.
 */
export async function anunciosRicosMeta(
  accountId: string,
): Promise<
  | { ok: true; anuncios: AnuncioRico[]; moeda: string; truncado: boolean }
  | { ok: false; erro: string }
> {
  const token = process.env.META_ADS_TOKEN?.trim();
  if (!token) return { ok: false, erro: "META_ADS_TOKEN por configurar." };
  const acc = accountId.replace(/^act_/, "").trim();
  if (!acc) return { ok: false, erro: "Conta por definir." };

  try {
    const base = `https://graph.facebook.com/${V}/act_${acc}`;

    type LinhaIns = {
      ad_id?: string;
      ad_name?: string;
      impressions?: string;
      reach?: string;
      frequency?: string;
      clicks?: string;
      ctr?: string;
      spend?: string;
      actions?: { action_type: string; value: string }[];
    };
    type Detalhe = {
      id: string;
      name?: string;
      effective_status?: string;
      campaign?: { name?: string; effective_status?: string };
      adset?: { targeting?: Targeting };
      creative?: CreativeRaw;
    };

    // 1) Quem entregou no período. Uma chamada — os insights só existem para quem entregou,
    //    o que dispensa filtrar estados e apanha também os arquivados.
    const rConta = fetchG(`${base}?fields=currency&access_token=${encodeURIComponent(token)}`);
    const camposIns = "ad_id,ad_name,impressions,reach,frequency,clicks,ctr,spend,actions";
    const rIns = await fetchG(
      `${base}/insights?level=ad&date_preset=last_30d&fields=${camposIns}&limit=500&access_token=${encodeURIComponent(token)}`,
    );
    if (!rIns.ok) return { ok: false, erro: `Meta respondeu ${rIns.status}: ${(await rIns.text()).slice(0, 120)}` };
    const moeda = ((await (await rConta).json().catch(() => ({}))) as { currency?: string }).currency || "EUR";

    const linhas: LinhaIns[] = [];
    let truncado = false;
    let pagina = (await rIns.json()) as { data?: LinhaIns[]; paging?: { next?: string } };
    for (let i = 0; ; i++) {
      linhas.push(...(pagina.data ?? []));
      const proxima = pagina.paging?.next;
      if (!proxima) break;
      if (i >= 3) { truncado = true; break; } // 2000 anúncios — rede de segurança, não limite esperado
      const r = await fetchG(proxima);
      if (!r.ok) break;
      pagina = (await r.json()) as { data?: LinhaIns[]; paging?: { next?: string } };
    }

    const comEntrega = linhas.filter((l) => l.ad_id && (Number(l.impressions) || 0) > 0);

    // 2) Criativo e público só destes. Em lotes de 50 por ids — na Terrae são 2 chamadas,
    //    contra as 6 páginas pesadas que faziam a página nunca chegar a renderizar.
    const camposDet =
      "id,name,effective_status,campaign{name,effective_status},adset{targeting},creative{title,body,image_url,thumbnail_url,object_type,call_to_action_type,object_story_spec}";
    const detalhes = new Map<string, Detalhe>();
    const ids = comEntrega.map((l) => l.ad_id!);
    const lotes: string[][] = [];
    for (let i = 0; i < ids.length; i += 50) lotes.push(ids.slice(i, i + 50));
    const respostas = await Promise.all(
      lotes.map((lote) =>
        fetchG(
          `https://graph.facebook.com/${V}/?ids=${lote.join(",")}&fields=${encodeURIComponent(camposDet)}&access_token=${encodeURIComponent(token)}`,
        )
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({})),
      ),
    );
    for (const r of respostas)
      for (const d of Object.values(r as Record<string, Detalhe>))
        if (d && d.id) detalhes.set(d.id, d);

    const anuncios: AnuncioRico[] = comEntrega.map((ins) => {
      const a = detalhes.get(ins.ad_id!) ?? ({ id: ins.ad_id!, name: ins.ad_name } as Detalhe);
      const c = a.creative ?? {};
      const oss = c.object_story_spec ?? {};
      const imagem =
        oss.link_data?.picture || oss.video_data?.image_url || c.image_url || c.thumbnail_url || null;
      const titulo = c.title || oss.link_data?.name || null;
      const corpo = c.body || oss.link_data?.message || oss.video_data?.message || null;
      const ctaTipo = c.call_to_action_type || oss.link_data?.call_to_action?.type || oss.video_data?.call_to_action?.type;
      const cta = ctaTipo ? CTA_PT[ctaTipo] ?? null : null;
      const formato: AnuncioRico["formato"] = (oss.link_data?.child_attachments?.length ?? 0) > 0
        ? "carrossel"
        : c.object_type === "VIDEO" || oss.video_data
          ? "vídeo"
          : imagem
            ? "imagem"
            : "anúncio";

      const impressoes = Number(ins.impressions) || 0;
      const alcance = Number(ins.reach) || 0;
      const cliques = Number(ins.clicks) || 0;
      const investimento = Number(ins.spend) || 0;
      const leads = contarLeads(ins.actions);

      return {
        id: a.id,
        nome: a.name ?? ins.ad_name ?? "—",
        campanha: a.campaign?.name ?? "—",
        campanhaAtiva: a.campaign?.effective_status === "ACTIVE",
        ativo: a.effective_status === "ACTIVE",
        publico: humanizarPublico(a.adset?.targeting),
        imagem,
        titulo,
        corpo,
        cta,
        formato,
        impressoes,
        alcance,
        frequencia: ins.frequency ? Number(ins.frequency) : null,
        cliques,
        ctr: ins.ctr ? Number(ins.ctr) / 100 : impressoes > 0 ? cliques / impressoes : null,
        investimento,
        leads,
        custo_por_lead: leads > 0 && investimento > 0 ? investimento / leads : null,
        moeda,
      };
    });
    // A correr primeiro, depois por investimento.
    anuncios.sort((a, b) => Number(b.ativo) - Number(a.ativo) || b.investimento - a.investimento);
    return { ok: true, anuncios, moeda, truncado };
  } catch (e) {
    return { ok: false, erro: String(e).slice(0, 120) };
  }
}

// ── Resumo de um MÊS (para o relatório mensal) ───────────────────────────────

export type ResumoMesMeta = {
  moeda: string;
  investimento: number;
  alcance: number;
  impressoes: number;
  cliques: number;
  leads: number;
  campanhas: { nome: string; investimento: number; alcance: number; cliques: number; leads: number; cpl: number | null }[];
};

/** Resultados de anúncios num intervalo (o mês do relatório). `since`/`until` = YYYY-MM-DD. */
export async function resumoAnunciosMes(
  accountId: string,
  since: string,
  until: string,
): Promise<{ ok: true; resumo: ResumoMesMeta } | { ok: false; erro: string }> {
  const token = process.env.META_ADS_TOKEN?.trim();
  if (!token) return { ok: false, erro: "sem token" };
  const acc = accountId.replace(/^act_/, "").trim();
  if (!acc) return { ok: false, erro: "sem conta" };
  try {
    const base = `https://graph.facebook.com/${V}/act_${acc}`;
    const tr = encodeURIComponent(JSON.stringify({ since, until }));
    const [rConta, rIns] = await Promise.all([
      fetchG(`${base}?fields=currency&access_token=${encodeURIComponent(token)}`),
      fetchG(
        `${base}/insights?level=campaign&time_range=${tr}&fields=campaign_name,reach,impressions,clicks,spend,actions&limit=100&access_token=${encodeURIComponent(token)}`,
      ),
    ]);
    if (!rIns.ok) return { ok: false, erro: `Meta ${rIns.status}` };
    const moeda = ((await rConta.json().catch(() => ({}))) as { currency?: string }).currency || "EUR";
    const d = (await rIns.json()) as {
      data?: { campaign_name?: string; reach?: string; impressions?: string; clicks?: string; spend?: string; actions?: { action_type: string; value: string }[] }[];
    };
    let investimento = 0, alcance = 0, impressoes = 0, cliques = 0, leads = 0;
    const campanhas = (d.data ?? []).map((c) => {
      const inv = Number(c.spend) || 0;
      const l = contarLeads(c.actions);
      investimento += inv;
      alcance += Number(c.reach) || 0;
      impressoes += Number(c.impressions) || 0;
      cliques += Number(c.clicks) || 0;
      leads += l;
      return { nome: c.campaign_name ?? "Campanha", investimento: inv, alcance: Number(c.reach) || 0, cliques: Number(c.clicks) || 0, leads: l, cpl: l > 0 && inv > 0 ? inv / l : null };
    });
    campanhas.sort((a, b) => b.investimento - a.investimento);
    return { ok: true, resumo: { moeda, investimento, alcance, impressoes, cliques, leads, campanhas } };
  } catch (e) {
    return { ok: false, erro: String(e).slice(0, 100) };
  }
}
