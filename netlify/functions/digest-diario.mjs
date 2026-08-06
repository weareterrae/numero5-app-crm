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
  const para = process.env.DIGEST_EMAIL || "sandro.sousa@numerocinco.pt";

  if (!url || !chaveDb) return resposta("Falta configurar o Supabase.");
  if (!chaveResend) return resposta("Falta a RESEND_API_KEY.");

  const db = createClient(url, chaveDb, { auth: { persistSession: false } });
  const hojeISO = new Date().toISOString().slice(0, 10);
  const limiteFrio = new Date(Date.now() - DIAS_ARREFECER * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const daqui7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  // Carteira ativa (id -> nome/estado/última interação).
  const { data: clientes } = await db
    .from("clientes")
    .select("id, nome_marca, estado, ultima_interacao_at, intake_submetido_em, intake_token, idioma, created_at")
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
    db
      .from("propostas")
      .select("cliente_id, estado, updated_at, partilha_token, partilha_ativa")
      .eq("estado", "enviada"),
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

  // ── Secção 0: o que os clientes fizeram (últimas 24h) ──────────────────
  // Lê as atividades recentes e destila as que foram AÇÃO DO CLIENTE
  // (aprovou/recusou plano ou proposta, preencheu guia/diagnóstico, pediu algo).
  const desde24h = new Date(Date.now() - 24 * 86_400_000).toISOString();
  let respostas = [];
  try {
    const { data: recentes } = await db
      .from("atividades")
      .select("cliente_id, descricao, data")
      .gte("data", desde24h)
      .order("data", { ascending: false });
    respostas = (recentes ?? [])
      .filter((a) => nome.has(a.cliente_id))
      .filter((a) => /(^|[^a-zçãõáéí])o cliente/i.test(a.descricao || "") || /proposta aceite/i.test(a.descricao || ""))
      .map((a) => {
        const limpo = (a.descricao || "")
          .replace(/^🚀\s*/, "")
          .replace(/^💼\s*/, "")
          .replace(/^na sede,\s*o cliente\s*/i, "")
          .replace(/^o cliente\s*/i, "")
          .replace(/\s*🖐️\s*$/, "")
          .replace(/\s+/g, " ") // uma linha só (fichas grandes não rebentam o email)
          .trim();
        return {
          marca: nome.get(a.cliente_id),
          texto: limpo.length > 160 ? limpo.slice(0, 159) + "…" : limpo,
        };
      })
      .slice(0, 20);
  } catch (e) {
    console.log("[digest-diario] respostas 24h:", e);
  }

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

  // ── Secção 6: lembretes automáticos aos clientes ───────────────────────
  // Um ÚNICO lembrete por diagnóstico (≥3 dias por preencher) e por proposta
  // (≥5 dias sem decisão), máx. 3+3 por dia. O marcador nas atividades
  // garante que nunca se repete. Falhar aqui nunca trava o digest.
  const lembretes = [];
  try {
    const tresDias = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const cincoDias = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const { data: contactosRaw } = await db
      .from("contactos")
      .select("cliente_id, nome, email")
      .eq("principal", true)
      .not("email", "is", null);
    const contactoDe = new Map((contactosRaw ?? []).map((c) => [c.cliente_id, c]));
    const { data: marcadores } = await db
      .from("atividades")
      .select("cliente_id, descricao")
      .ilike("descricao", "🔔 Lembrete automático%");
    const jaLembrado = new Set(
      (marcadores ?? []).map((m) => `${m.cliente_id}:${m.descricao.includes("proposta") ? "p" : "d"}`),
    );

    const enviar = async (para, assunto, corpoHtml, corpoTexto) => {
      const rr = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${chaveResend}`, "content-type": "application/json" },
        body: JSON.stringify({ from: REMETENTE, to: [para], subject: assunto, html: corpoHtml, text: corpoTexto }),
      });
      return rr.ok;
    };
    const molde = (titulo, corpo, cta, url) => `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#15181D">
        <p style="font-size:16px;font-weight:bold">${esc(titulo)}</p>
        <p style="font-size:15px;line-height:1.6">${esc(corpo)}</p>
        <p style="margin:18px 0"><a href="${url}" style="background:#E8A13C;color:#15181D;font-weight:bold;padding:11px 22px;border-radius:999px;text-decoration:none">${esc(cta)}</a></p>
        <p style="font-size:12px;color:#9aa0a6">Este é um lembrete único — não voltamos a incomodar. Nº 5 · marca operada por Os Caetanos, Lda</p>
      </div>`;

    // Diagnósticos a meio (≥3 dias)
    const candDiag = (clientes ?? [])
      .filter(
        (c) =>
          c.intake_token &&
          !c.intake_submetido_em &&
          c.created_at &&
          c.created_at <= tresDias &&
          ["lead", "contactado", "diagnostico"].includes(c.estado) &&
          !jaLembrado.has(`${c.id}:d`) &&
          contactoDe.get(c.id)?.email,
      )
      .slice(0, 3);
    for (const c of candDiag) {
      const ct = contactoDe.get(c.id);
      const en = c.idioma === "en";
      const url = `https://app.numerocinco.pt/intake/${c.intake_token}`;
      const ok = await enviar(
        ct.email,
        en ? `Your Nº 5 diagnosis is waiting 🖐️` : `O teu diagnóstico Nº 5 está à tua espera 🖐️`,
        molde(
          en ? `Hi ${ct.nome || ""}!` : `Olá${ct.nome ? ` ${ct.nome}` : ""}!`,
          en
            ? `The ${c.nome_marca} diagnosis is still open — it takes just a few minutes and your answers are saved as you go. It's the first step to a concrete proposal.`
            : `O diagnóstico da ${c.nome_marca} ficou a meio — são só uns minutos e as respostas vão ficando gravadas. É o primeiro passo para uma proposta concreta.`,
          en ? "Continue the diagnosis →" : "Continuar o diagnóstico →",
          url,
        ),
        `${en ? "Continue your diagnosis" : "Continua o teu diagnóstico"}: ${url}`,
      );
      if (ok) {
        await db.from("atividades").insert({
          cliente_id: c.id,
          tipo: "nota",
          descricao: `🔔 Lembrete automático do diagnóstico enviado a ${ct.email}.`,
        });
        lembretes.push({ marca: c.nome_marca, texto: "lembrete do diagnóstico enviado" });
      }
    }

    // Propostas sem decisão (≥5 dias)
    const candProp = (propostas.data ?? [])
      .filter(
        (p) =>
          p.partilha_ativa &&
          p.partilha_token &&
          p.updated_at &&
          p.updated_at <= cincoDias &&
          !jaLembrado.has(`${p.cliente_id}:p`) &&
          contactoDe.get(p.cliente_id)?.email &&
          nome.has(p.cliente_id),
      )
      .slice(0, 3);
    for (const p of candProp) {
      const ct = contactoDe.get(p.cliente_id);
      const cli = (clientes ?? []).find((c) => c.id === p.cliente_id);
      const en = cli?.idioma === "en";
      const marca = nome.get(p.cliente_id);
      const url = `https://app.numerocinco.pt/r/proposta/${p.partilha_token}`;
      const ok = await enviar(
        ct.email,
        en ? `Your Nº 5 proposal is waiting for you 🖐️` : `A tua proposta Nº 5 continua à tua espera 🖐️`,
        molde(
          en ? `Hi ${ct.nome || ""}!` : `Olá${ct.nome ? ` ${ct.nome}` : ""}!`,
          en
            ? `The proposal we prepared for ${marca} is still open. If anything needs adjusting, just reply — we'd rather adapt it than leave you in doubt.`
            : `A proposta que preparámos para a ${marca} continua em aberto. Se algo precisar de ajuste, responde a este email — preferimos adaptá-la a deixar-te na dúvida.`,
          en ? "Review the proposal →" : "Rever a proposta →",
          url,
        ),
        `${en ? "Review your proposal" : "Revê a tua proposta"}: ${url}`,
      );
      if (ok) {
        await db.from("atividades").insert({
          cliente_id: p.cliente_id,
          tipo: "nota",
          descricao: `🔔 Lembrete automático da proposta enviado a ${ct.email}.`,
        });
        lembretes.push({ marca, texto: "lembrete da proposta enviado" });
      }
    }
  } catch (e) {
    console.log("[digest-diario] lembretes:", e);
  }

  const nada =
    respostas.length === 0 &&
    hoje.length === 0 &&
    espera.length === 0 &&
    descontos.length === 0 &&
    aprovacoes.length === 0;
  const { html, texto } = render({ respostas, hoje, espera, arrefecer, descontos, aprovacoes, lembretes, nada });

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

function render({ respostas, hoje, espera, arrefecer, descontos, aprovacoes, lembretes, nada }) {
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

  bloco(`🎉 Os clientes responderam (${(respostas ?? []).length})`, respostas ?? [], "#1E7A43");
  bloco(
    `⏰ Hoje (${hoje.length})`,
    hoje.map((h) => ({ marca: h.marca, texto: (h.atrasado ? "⚠️ atrasado · " : "") + h.texto })),
    "#B4761A",
  );
  bloco(`👀 À espera de ti (${espera.length})`, espera, "#2B44E7");
  bloco(`✅ Aprovações em atraso (${(aprovacoes ?? []).length})`, aprovacoes ?? [], "#C0392B");
  bloco(`🏷️ Descontos a terminar (${(descontos ?? []).length})`, descontos ?? [], "#B4761A");
  bloco(`🔔 Lembretes automáticos enviados (${(lembretes ?? []).length})`, lembretes ?? [], "#2B44E7");
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
