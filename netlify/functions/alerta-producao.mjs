/**
 * Nº 5 · Alerta de produção mensal — "começa a produzir".
 *
 * Dispara UMA vez por mês, no dia em que faltam 20 dias para o fim do mês
 * (≈ dia 10-11), com a checklist dos planos do MÊS SEGUINTE por cada conta
 * com plano mensal. É o pontapé de saída; o reforço diário fica no
 * digest-diario (secção "Produção do próximo mês"), para não escapar.
 *
 * Variáveis (já no Netlify): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * RESEND_API_KEY, DIGEST_EMAIL. Opcional: EMAIL_REMETENTE.
 */

import { createClient } from "@supabase/supabase-js";

// Todas as manhãs às 06:00 UTC (antes do digest das 07:00). Só age no dia certo.
export const config = { schedule: "0 6 * * *" };

const GATILHO_DIAS = 20;
const REMETENTE = process.env.EMAIL_REMETENTE || "Nº 5 <geral@numerocinco.pt>";
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function resposta(msg) {
  console.log("[alerta-producao]", msg);
  return new Response(msg, { status: 200 });
}

export default async function handler() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveDb = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const chaveResend = process.env.RESEND_API_KEY;
  const para = process.env.DIGEST_EMAIL || "sandro.sousa@numerocinco.pt";

  const hoje = new Date();
  const y = hoje.getUTCFullYear();
  const m0 = hoje.getUTCMonth();
  const ultimoDia = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const diasAteFim = ultimoDia - hoje.getUTCDate();
  if (diasAteFim !== GATILHO_DIAS) return resposta(`Hoje faltam ${diasAteFim} dias — só disparo aos ${GATILHO_DIAS}.`);

  if (!url || !chaveDb) return resposta("Falta configurar o Supabase.");
  if (!chaveResend) return resposta("Falta a RESEND_API_KEY.");

  const db = createClient(url, chaveDb, { auth: { persistSession: false } });
  const proximoDate = new Date(Date.UTC(y, m0 + 1, 1));
  const proximoISO = proximoDate.toISOString().slice(0, 10);
  const proximoNome = MESES[proximoDate.getUTCMonth()];

  // Contas com plano mensal (tolerante: se a migração 0066 ainda não correu, não faz nada).
  const { data: clientes, error } = await db
    .from("clientes")
    .select("id, nome_marca")
    .eq("plano_mensal", true)
    .order("nome_marca");
  if (error) return resposta("Migração 0066 ainda não correu — sem contas com plano mensal.");
  if (!clientes || clientes.length === 0) return resposta("Nenhuma conta com plano mensal marcada.");

  const ids = clientes.map((c) => c.id);
  const planos = await db
    .from("planos")
    .select("cliente_id, estado")
    .eq("mes", proximoISO)
    .in("cliente_id", ids)
    .then((r) => r.data ?? [], () => []);
  const estadoPorCliente = new Map(planos.map((p) => [p.cliente_id, p.estado]));

  const linhas = clientes.map((c) => {
    const estado = estadoPorCliente.get(c.id) ?? null;
    let cor = "#C0392B", txt = "por começar";
    if (estado === "aprovado") { cor = "#1E7A43"; txt = "aprovado ✓"; }
    else if (estado === "enviado") { cor = "#2B44E7"; txt = "enviado — a aguardar cliente"; }
    else if (estado === "rascunho") { cor = "#B4761A"; txt = "em produção"; }
    else if (estado === "alteracoes") { cor = "#B4761A"; txt = "alterações pedidas"; }
    else if (estado === "recusado") { cor = "#C0392B"; txt = "recusado — rever"; }
    return { marca: c.nome_marca, cor, txt, feito: estado === "aprovado" };
  });
  const porFazer = linhas.filter((l) => !l.feito).length;

  const itens = linhas
    .map(
      (l) =>
        `<li style="margin:7px 0;font-size:15px;color:#15181D"><b>${esc(l.marca)}</b> — <span style="color:${l.cor};font-weight:bold">${esc(l.txt)}</span></li>`,
    )
    .join("");
  const txtLista = linhas.map((l) => `- ${l.marca}: ${l.txt}`).join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto">
    <div style="background:#15181D;color:#F5F4F0;border-radius:16px;padding:22px 24px">
      <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#E8A13C">produção mensal</p>
      <h1 style="margin:6px 0 0;font-size:24px">Hora de produzir ${esc(proximoNome)}</h1>
      <p style="margin:4px 0 0;font-size:14px;color:#9aa0a6">Faltam ${diasAteFim} dias para o fim do mês · ${porFazer} plano(s) por fechar</p>
    </div>
    <div style="padding:10px 4px">
      <p style="font-size:15px;color:#15181D">Começa a produzir os planos do próximo mês. Estado de cada conta:</p>
      <ul style="margin:0;padding-left:18px">${itens}</ul>
      <p style="margin:20px 0"><a href="https://app.numerocinco.pt/producao" style="background:#E8A13C;color:#15181D;font-weight:bold;padding:11px 22px;border-radius:999px;text-decoration:none">Abrir o quadro de produção →</a></p>
    </div>
    <p style="margin:14px 0 0;font-size:11px;color:#b8bcc2">Nº 5 · marca operada por Os Caetanos, Lda</p>
  </div>`;
  const texto = `Hora de produzir ${proximoNome} — faltam ${diasAteFim} dias.\n${porFazer} plano(s) por fechar.\n\n${txtLista}\n\nQuadro: https://app.numerocinco.pt/producao`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${chaveResend}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: REMETENTE,
      to: [para],
      subject: `Nº 5 · começa a produzir ${proximoNome} — faltam ${diasAteFim} dias 🖐️`,
      html,
      text: texto,
    }),
  });
  if (!r.ok) return resposta(`Resend respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return resposta(`Alerta de produção enviado para ${para} (${porFazer} por fechar).`);
}
