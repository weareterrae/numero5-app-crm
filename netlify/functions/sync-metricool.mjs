/**
 * Nº 5 · Sincronização Metricool → Supabase (posts agendados).
 *
 * Puxa os posts agendados de cada conta (clientes.metricool_blog_id) e grava
 * um resumo por mês na tabela `metricool_agendados`. O quadro /producao lê de
 * lá — a app NUNCA fala com o Metricool em direto (mesmo padrão do marca_metricas).
 *
 * Variáveis a pôr no Netlify (o Sandro, nunca no chat):
 *   METRICOOL_USER_TOKEN  — token da API do Metricool (Definições → API/Connect)
 *   METRICOOL_USER_ID     — o teu userId Metricool (ex.: 4896041)
 * Já existentes: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Sem token → não faz nada (o quadro fica com "—" no Agendado). Nunca rebenta.
 */

import { createClient } from "@supabase/supabase-js";

// De 6 em 6 horas — fresco q.b. sem martelar a API.
export const config = { schedule: "0 */6 * * *" };

function resposta(msg) {
  console.log("[sync-metricool]", msg);
  return new Response(msg, { status: 200 });
}

const yyyymmdd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const primeiroDiaISO = (ano, mes0) => new Date(Date.UTC(ano, mes0, 1)).toISOString().slice(0, 10);

/**
 * Pede ao Metricool os posts de uma marca numa janela. Isolado de propósito:
 * se o contrato da API precisar de um ajuste, é só aqui. Devolve [] em erro.
 */
async function buscarPosts(blogId, userId, token, inicio, fim) {
  const url =
    `https://app.metricool.com/api/v2/scheduler/posts?blogId=${encodeURIComponent(blogId)}` +
    `&userId=${encodeURIComponent(userId)}&start=${yyyymmdd(inicio)}&end=${yyyymmdd(fim)}`;
  try {
    const r = await fetch(url, { headers: { "X-Mc-Auth": token, accept: "application/json" } });
    if (!r.ok) {
      console.log(`[sync-metricool] blog ${blogId}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
      return [];
    }
    const j = await r.json();
    return Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
  } catch (e) {
    console.log(`[sync-metricool] blog ${blogId}: ${e.message}`);
    return [];
  }
}

/** Resume os posts por mês (yyyy-mm-01) → {total, pendentes, publicados, por_rede, por_tipo}. */
function resumirPorMes(posts) {
  const porMes = new Map();
  for (const p of posts) {
    if (p?.draft === true) continue;
    const iso = p?.publicationDate?.dateTime || p?.publicationDate || "";
    const mesISO = /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) + "-01" : null;
    if (!mesISO) continue;
    if (!porMes.has(mesISO))
      porMes.set(mesISO, { total: 0, pendentes: 0, publicados: 0, por_rede: {}, por_tipo: {} });
    const m = porMes.get(mesISO);
    m.total += 1;

    const provs = Array.isArray(p.providers) ? p.providers : [];
    const algumPendente = provs.some((x) => String(x?.status || "").toUpperCase() === "PENDING");
    const todosPublicados = provs.length > 0 && provs.every((x) => String(x?.status || "").toUpperCase() === "PUBLISHED");
    if (algumPendente) m.pendentes += 1;
    else if (todosPublicados) m.publicados += 1;

    for (const x of provs) {
      const rede = String(x?.network || "").toLowerCase();
      if (rede) m.por_rede[rede] = (m.por_rede[rede] || 0) + 1;
    }
    const tipo = String(
      p?.instagramData?.type || p?.facebookData?.type || p?.tiktokData?.type || p?.linkedinData?.type || "post",
    ).toLowerCase();
    m.por_tipo[tipo] = (m.por_tipo[tipo] || 0) + 1;
  }
  return porMes;
}

export default async function handler() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveDb = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = process.env.METRICOOL_USER_TOKEN;
  const userId = process.env.METRICOOL_USER_ID;

  if (!url || !chaveDb) return resposta("Falta configurar o Supabase.");
  if (!token || !userId) return resposta("Sem METRICOOL_USER_TOKEN/USER_ID — sincronização desativada.");

  const db = createClient(url, chaveDb, { auth: { persistSession: false } });

  // Só as contas com plano mensal E blog_id (poupa chamadas). Tolerante à migração.
  const { data: clientes, error } = await db
    .from("clientes")
    .select("id, nome_marca, metricool_blog_id")
    .eq("plano_mensal", true)
    .not("metricool_blog_id", "is", null);
  if (error) return resposta("Migração 0066 ainda não correu (coluna plano_mensal em falta).");
  if (!clientes || clientes.length === 0) return resposta("Nenhuma conta com plano mensal + blog_id.");

  const hoje = new Date();
  const ano = hoje.getUTCFullYear();
  const m0 = hoje.getUTCMonth();
  const inicio = new Date(Date.UTC(ano, m0, 1)); // 1.º do mês atual
  const fim = new Date(Date.UTC(ano, m0 + 2, 0)); // último dia do mês seguinte
  const mesesAlvo = new Set([primeiroDiaISO(ano, m0), primeiroDiaISO(ano, m0 + 1)]);

  let gravados = 0;
  for (const c of clientes) {
    const posts = await buscarPosts(c.metricool_blog_id, userId, token, inicio, fim);
    const porMes = resumirPorMes(posts);
    for (const mesISO of mesesAlvo) {
      const r = porMes.get(mesISO) || { total: 0, pendentes: 0, publicados: 0, por_rede: {}, por_tipo: {} };
      const { error: eUp } = await db.from("metricool_agendados").upsert(
        {
          cliente_id: c.id,
          mes: mesISO,
          total: r.total,
          pendentes: r.pendentes,
          publicados: r.publicados,
          por_rede: r.por_rede,
          por_tipo: r.por_tipo,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "cliente_id,mes" },
      );
      if (!eUp) gravados += 1;
      else console.log(`[sync-metricool] upsert ${c.nome_marca} ${mesISO}: ${eUp.message}`);
    }
  }

  return resposta(`Sincronizadas ${clientes.length} contas · ${gravados} linhas gravadas.`);
}
