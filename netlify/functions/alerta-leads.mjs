/**
 * Nº 5 · CRM — alerta de leads a arrefecer.
 *
 * De 15 em 15 min: para cada cliente (org) com email de alerta, encontra as
 * leads que acabaram de cruzar o limiar sem resposta (por defeito 30 min) e
 * avisa por email. A janela "acabou de cruzar" evita repetir o alerta.
 *
 * Variáveis (já no Netlify): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * RESEND_API_KEY. Opcional: EMAIL_REMETENTE.
 */

import { createClient } from "@supabase/supabase-js";

export const config = { schedule: "*/15 * * * *" };

const REMETENTE = process.env.EMAIL_REMETENTE || "Nº 5 <geral@numerocinco.pt>";
const INTERVALO_MIN = 15;

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default async function handler() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveDb = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const chaveResend = process.env.RESEND_API_KEY;
  if (!url || !chaveDb) return resposta("Falta o Supabase.");
  if (!chaveResend) return resposta("Falta a RESEND_API_KEY.");

  const db = createClient(url, chaveDb, { auth: { persistSession: false } });

  const { data: orgs } = await db
    .from("orgs")
    .select("id, nome, slug, alerta_email, alerta_minutos")
    .eq("ativo", true)
    .not("alerta_email", "is", null);
  if (!orgs?.length) return resposta("Sem clientes com alerta configurado.");

  const agora = Date.now();
  let enviados = 0;

  for (const o of orgs) {
    const limiar = o.alerta_minutos ?? 30;
    const maxISO = new Date(agora - limiar * 60_000).toISOString();
    const minISO = new Date(agora - (limiar + INTERVALO_MIN) * 60_000).toISOString();

    const { data: leads } = await db
      .from("crm_leads")
      .select("id, nome, telefone, email, created_at, fonte_detalhe")
      .eq("org_id", o.id)
      .eq("arquivado", false)
      .eq("resultado", "aberto")
      .is("primeira_resposta_at", null)
      .lte("created_at", maxISO)
      .gt("created_at", minISO)
      .order("created_at", { ascending: true });
    if (!leads?.length) continue;

    const lis = leads
      .map((l) => {
        const nome = l.nome || l.telefone || l.email || "Lead";
        const tel = l.telefone ? ` — <a href="tel:${esc(l.telefone.replace(/[^\d+]/g, ""))}">${esc(l.telefone)}</a>` : "";
        const fonte = l.fonte_detalhe ? ` <span style="color:#9aa0a6">(${esc(l.fonte_detalhe)})</span>` : "";
        return `<li style="margin:6px 0"><b>${esc(nome)}</b>${tel}${fonte}</li>`;
      })
      .join("");

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto">
      <div style="background:#15181D;color:#F5F4F0;border-radius:16px;padding:20px 22px">
        <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#E8A13C">Leads por responder</p>
        <h1 style="margin:6px 0 0;font-size:22px">${esc(o.nome)}</h1>
      </div>
      <div style="padding:10px 4px">
        <p style="font-size:15px;color:#15181D">${leads.length} lead(s) estão há mais de ${limiar} min sem resposta. Ligar quanto antes faz toda a diferença na conversão.</p>
        <ul style="margin:0;padding-left:18px;font-size:15px;color:#15181D">${lis}</ul>
        <p style="margin:18px 0 0;font-size:13px"><a href="https://app.numerocinco.pt/leads/${esc(o.slug)}" style="color:#B4761A;font-weight:bold">Abrir o quadro →</a></p>
      </div>
      <p style="margin:16px 0 0;font-size:11px;color:#b8bcc2">Nº 5 · o teu CRM</p>
    </div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${chaveResend}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: REMETENTE,
        to: [o.alerta_email],
        subject: `⏰ ${leads.length} lead(s) por responder — ${o.nome}`,
        html,
      }),
    });
    if (r.ok) enviados++;
    else console.log("[alerta-leads] Resend", r.status, (await r.text()).slice(0, 160));
  }

  return resposta(`Alertas enviados: ${enviados}.`);
}

function resposta(msg) {
  console.log("[alerta-leads]", msg);
  return new Response(msg, { status: 200 });
}
