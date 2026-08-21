/**
 * N5 AI OS · alertas por email.
 *
 * De 30 em 30 minutos, olha para os incidentes por resolver e avisa —
 * mas SÓ quando há novidade. Um alerta que chega de meia em meia hora
 * a dizer o mesmo deixa de ser lido, e nesse dia o alerta a sério passa
 * despercebido. Por isso guardamos a assinatura do último aviso em
 * `configuracoes` e só reenviamos se o conjunto de problemas mudar.
 *
 * Mesmo padrão (Resend + estado em `configuracoes`) do vigia-bots, que
 * já está a funcionar neste repositório.
 *
 * Env (já no Netlify): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * RESEND_API_KEY, VIGIA_EMAIL (ou DIGEST_EMAIL). Sem estas, sai em silêncio.
 */

import { createClient } from "@supabase/supabase-js";

export const config = { schedule: "*/30 * * * *" };

const REMETENTE = process.env.EMAIL_REMETENTE || "Nº 5 <geral@numerocinco.pt>";
const CHAVE_ESTADO = "n5_ai_alertas_assinatura";
const ok = (m) => new Response(JSON.stringify({ ok: true, nota: m }), {
  status: 200, headers: { "content-type": "application/json" },
});

export default async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resend = process.env.RESEND_API_KEY;
  const destino = process.env.VIGIA_EMAIL || process.env.DIGEST_EMAIL;
  if (!url || !chave) return ok("faltam variáveis do Supabase");
  if (!resend || !destino) return ok("alertas desativados (falta RESEND_API_KEY ou VIGIA_EMAIL)");

  const sb = createClient(url, chave, { auth: { persistSession: false } });

  // 1. o que está mal agora
  const { data: incidentes } = await sb
    .from("ai_incidents")
    .select("id, tipo, severidade, titulo, detalhe, created_at")
    .eq("resolvido", false)
    .in("severidade", ["warn", "crit"])
    .order("created_at", { ascending: false })
    .limit(30);

  const abertos = incidentes ?? [];
  const criticos = abertos.filter((i) => i.severidade === "crit");

  // Assinatura = conjunto de tipos+alvos. Muda quando há problema NOVO
  // ou quando um desaparece; não muda só por passar o tempo.
  const assinatura = abertos.map((i) => `${i.tipo}:${i.titulo}`).sort().join("|");

  const { data: estado } = await sb
    .from("configuracoes").select("valor").eq("chave", CHAVE_ESTADO).maybeSingle();
  const anterior = estado?.valor ?? "";

  if (assinatura === anterior) return ok("sem novidade");

  // 2. guardar já o novo estado (mesmo que o email falhe, não insistimos)
  await sb.from("configuracoes")
    .upsert({ chave: CHAVE_ESTADO, valor: assinatura }, { onConflict: "chave" });

  // Tudo resolvido desde o último aviso → dar a boa notícia uma vez.
  if (abertos.length === 0) {
    await enviar(resend, destino, "🟢 N5 AI OS · tudo normalizado",
      "Os incidentes que estavam abertos foram resolvidos.\n\n" +
      "Painel: https://app.numerocinco.pt/ai-operations\n");
    return ok("normalizado");
  }

  // 3. contexto útil: o que se passou nas últimas 24h
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: pedidos } = await sb.from("ai_requests")
    .select("id", { count: "exact", head: true }).gte("created_at", desde);
  const { count: erros } = await sb.from("ai_requests")
    .select("id", { count: "exact", head: true }).gte("created_at", desde).neq("status", "ok");

  const linhas = abertos.slice(0, 12).map((i) => {
    const hora = new Date(i.created_at).toLocaleString("pt-PT");
    const marca = i.severidade === "crit" ? "🔴" : "🟠";
    return `${marca} ${i.titulo}\n   ${i.tipo} · ${hora}`;
  }).join("\n\n");

  const assunto = criticos.length
    ? `🔴 N5 AI OS · ${criticos.length} incidente(s) crítico(s)`
    : `🟠 N5 AI OS · ${abertos.length} incidente(s) a vigiar`;

  const texto = [
    criticos.length
      ? "Há incidentes CRÍTICOS no N5 AI OS."
      : "Há incidentes a precisar de atenção no N5 AI OS.",
    "",
    linhas,
    "",
    "─────────────────────────",
    `Últimas 24h: ${pedidos ?? 0} pedidos, ${erros ?? 0} com erro.`,
    "",
    "Nota: se um fornecedor caiu, o gateway já terá desviado o tráfego",
    "para a reserva — o visitante não deve ter dado por nada. Confirma no",
    "painel se o fallback funcionou antes de agires.",
    "",
    "Painel: https://app.numerocinco.pt/ai-operations",
  ].join("\n");

  await enviar(resend, destino, assunto, texto);
  return ok(`avisado: ${abertos.length} incidente(s)`);
};

async function enviar(chaveResend, destino, assunto, texto) {
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${chaveResend}`, "content-type": "application/json" },
      body: JSON.stringify({ from: REMETENTE, to: [destino], subject: assunto, text: texto }),
    });
  } catch (e) {
    console.error("[n5-ai] alerta falhou:", String(e));
  }
}
