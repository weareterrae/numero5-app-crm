/**
 * Nº 5 · Digest diário — o painel de controlo empurrado para o email.
 *
 * Todas as manhãs olha para a carteira toda e manda ao Sandro só o que precisa
 * de atenção hoje: follow-ups a vencer, coisas à espera dele, clientes a
 * arrefecer. Reusa o Resend (envio) e o Supabase (dados).
 *
 * Variáveis (já no Netlify): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * RESEND_API_KEY. Falta só: DIGEST_EMAIL (para onde vai o digest).
 * Opcional: EMAIL_REMETENTE (defeito "Nº 5 <geral@numerocinco.pt>").
 */

import { createClient } from "@supabase/supabase-js";

// Corre todas as manhãs às 07:00 UTC (~08:00 em Portugal no verão).
export const config = { schedule: "0 7 * * *" };

const REMETENTE = process.env.EMAIL_REMETENTE || "Nº 5 <geral@numerocinco.pt>";
const DIAS_ARREFECER = 14;

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function dataLegivel(d) {
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default async function handler() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveDb = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const chaveResend = process.env.RESEND_API_KEY;
  const para = process.env.DIGEST_EMAIL;

  if (!url || !chaveDb) return resposta("Falta configurar o Supabase.");
  if (!chaveResend) return resposta("Falta a RESEND_API_KEY.");
  if (!para) return resposta("Falta a DIGEST_EMAIL — define para onde vai o digest.");

  const db = createClient(url, chaveDb, { auth: { persistSession: false } });
  const hojeISO = new Date().toISOString().slice(0, 10);
  const limiteFrio = new Date(Date.now() - DIAS_ARREFECER * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const daqui7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  // Carteira ativa (id -> nome/estado/última interação).
  const { data: clientes } = await db
    .from("clientes")
    .select("id, nome_marca, estado, ultima_interacao_at, intake_submetido_em")
    .neq("estado", "perdido");
  const nome = new Map((clientes ?? []).map((c) => [c.id, c.nome_marca]));

  // Consultas em paralelo. relatorios e descontos são tolerantes (a tabela
  // pode ainda não existir).
  const [followups, propostas, planos, relatorios, descontosRes, aprovacoesRes] = await Promise.all([
    db
      .from("atividades")
      .select("cliente_id, descricao, followup_nota, followup_em")
      .lte("followup_em", hojeISO)
      .eq("concluido", false)
      .order("followup_em", { ascending: true }),
    db.from("propostas").select("cliente_id, estado, updated_at").eq("estado", "enviada"),
    db.from("planos").select("cliente_id, estado, mes").in("estado", ["rascunho", "alteracoes"]),
    db.from("relatorios").select("cliente_id, estado").eq("estado", "rascunho").then(
      (r) => r,
      () => ({ data: [] }),
    ),
    db
      .from("descontos")
      .select("cliente_id, alvo, preco_durante, preco_apos, fim")
      .eq("estado", "ativo")
      .not("fim", "is", null)
      .lte("fim", daqui7)
      .then((r) => r, () => ({ data: [] })),
    db
      .from("aprovacoes")
      .select("cliente_id, titulo, prazo")
      .in("estado", ["pendente", "sem_resposta"])
      .not("prazo", "is", null)
      .lte("prazo", hojeISO)
      .then((r) => r, () => ({ data: [] })),
  ]);

  // ── Secção 1: hoje / atrasado ──────────────────────────────────────────
  const hoje = (followups.data ?? [])
    .filter((f) => nome.has(f.cliente_id))
    .map((f) => ({
      marca: nome.get(f.cliente_id),
      texto: f.followup_nota || f.descricao || "follow-up marcado",
      atrasado: f.followup_em < hojeISO,
    }));

  // ── Secção 2: à espera de ti ───────────────────────────────────────────
  const espera = [];
  for (const c of clientes ?? []) {
    if (c.intake_submetido_em && c.estado === "lead")
      espera.push({ marca: c.nome_marca, texto: "preencheu o diagnóstico — falta a proposta" });
  }
  for (const p of propostas.data ?? []) {
    const dias = p.updated_at
      ? Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86_400_000)
      : 0;
    if (dias >= 3 && nome.has(p.cliente_id))
      espera.push({ marca: nome.get(p.cliente_id), texto: `proposta enviada há ${dias} dias, sem resposta` });
  }
  for (const pl of planos.data ?? []) {
    if (nome.has(pl.cliente_id))
      espera.push({
        marca: nome.get(pl.cliente_id),
        texto: pl.estado === "alteracoes" ? "plano com alterações pedidas — por ajustar" : "plano em rascunho — por enviar",
      });
  }
  for (const rl of relatorios.data ?? []) {
    if (nome.has(rl.cliente_id))
      espera.push({ marca: nome.get(rl.cliente_id), texto: "relatório em rascunho — por enviar" });
  }

  // ── Secção 3: a arrefecer ──────────────────────────────────────────────
  const arrefecer = (clientes ?? [])
    .filter((c) => c.ultima_interacao_at && c.ultima_interacao_at.slice(0, 10) < limiteFrio)
    .map((c) => {
      const dias = Math.floor((Date.now() - new Date(c.ultima_interacao_at).getTime()) / 86_400_000);
      return { marca: c.nome_marca, dias };
    })
    .sort((a, b) => b.dias - a.dias)
    .slice(0, 8);

  // ── Secção 4: descontos a terminar (7 dias) ────────────────────────────
  const eur = (v) => (v == null ? "—" : `${Math.round(v)}€`);
  const descontos = (descontosRes.data ?? [])
    .filter((d) => nome.has(d.cliente_id))
    .map((d) => {
      const [, m, dia] = d.fim.split("-");
      return {
        marca: nome.get(d.cliente_id),
        texto: `${d.alvo === "avenca" ? "avença" : "arranque"} volta a ${eur(d.preco_apos)}${
          d.alvo === "avenca" ? "/mês" : ""
        } a ${dia}/${m} — fala com o cliente antes`,
      };
    });

  // ── Secção 5: aprovações em atraso ─────────────────────────────────────
  const aprovacoes = (aprovacoesRes.data ?? [])
    .filter((a) => nome.has(a.cliente_id))
    .map((a) => {
      const [, m, dia] = a.prazo.split("-");
      return { marca: nome.get(a.cliente_id), texto: `«${a.titulo}» à espera de aprovação (prazo ${dia}/${m})` };
    });

  const nada =
    hoje.length === 0 && espera.length === 0 && descontos.length === 0 && aprovacoes.length === 0;
  const { html, texto } = render({ hoje, espera, arrefecer, descontos, aprovacoes, nada });

  // Envio pelo Resend.
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${chaveResend}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: REMETENTE,
      to: [para],
      subject: `Nº 5 · o teu dia — ${dataLegivel(new Date())}`,
      html,
      text: texto,
    }),
  });
  if (!r.ok) return resposta(`Resend respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return resposta(`Digest enviado para ${para}.`);
}

function render({ hoje, espera, arrefecer, descontos, aprovacoes, nada }) {
  const linhasTxt = [];
  const blocos = [];

  function bloco(titulo, itens, corTitulo) {
    if (!itens.length) return;
    linhasTxt.push(`\n${titulo}`);
    const lis = itens
      .map((i) => {
        linhasTxt.push(`- ${i.marca}: ${i.texto}`);
        return `<li style="margin:6px 0"><b>${esc(i.marca)}</b> — ${esc(i.texto)}</li>`;
      })
      .join("");
    blocos.push(
      `<h2 style="font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:${corTitulo};margin:22px 0 6px">${esc(titulo)}</h2><ul style="margin:0;padding-left:18px;font-size:15px;color:#15181D">${lis}</ul>`,
    );
  }

  bloco(
    `⏰ Hoje (${hoje.length})`,
    hoje.map((h) => ({ marca: h.marca, texto: (h.atrasado ? "⚠️ atrasado · " : "") + h.texto })),
    "#B4761A",
  );
  bloco(`👀 À espera de ti (${espera.length})`, espera, "#2B44E7");
  bloco(`✅ Aprovações em atraso (${(aprovacoes ?? []).length})`, aprovacoes ?? [], "#C0392B");
  bloco(`🏷️ Descontos a terminar (${(descontos ?? []).length})`, descontos ?? [], "#B4761A");
  bloco(
    `❄️ A arrefecer (${arrefecer.length})`,
    arrefecer.map((a) => ({ marca: a.marca, texto: `sem mexer há ${a.dias} dias` })),
    "#6B7280",
  );

  const abertura = nada
    ? `<p style="font-size:15px;color:#15181D">Tudo tranquilo por agora — nada urgente hoje. 🖐️</p>`
    : "";
  if (nada) linhasTxt.push("Tudo tranquilo por agora — nada urgente hoje.");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto">
    <div style="background:#15181D;color:#F5F4F0;border-radius:16px;padding:22px 24px">
      <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#E8A13C">o teu dia</p>
      <h1 style="margin:6px 0 0;font-size:24px">Bom dia, Sandro</h1>
      <p style="margin:4px 0 0;font-size:14px;color:#9aa0a6">${esc(dataLegivel(new Date()))}</p>
    </div>
    <div style="padding:6px 4px">${abertura}${blocos.join("")}</div>
    <p style="margin:24px 0 0;font-size:13px;color:#9aa0a6">Bom trabalho. Dá cá cinco. 🖐️</p>
    <p style="margin:14px 0 0;font-size:11px;color:#b8bcc2">Nº 5 · marca operada por Os Caetanos, Lda</p>
  </div>`;

  return { html, texto: `Bom dia, Sandro — ${dataLegivel(new Date())}\n${linhasTxt.join("\n")}\n\nDá cá cinco. 🖐️` };
}

function resposta(msg) {
  console.log("[digest-diario]", msg);
  return new Response(msg, { status: 200 });
}
