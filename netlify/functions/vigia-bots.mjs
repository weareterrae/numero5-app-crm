/**
 * Nº 5 · Watchdog dos bots sociais (FB/IG).
 *
 * De 2 em 2 horas: verifica cada bot e AVISA POR EMAIL só quando o estado muda
 * (um bot fica vermelho, ou recupera) — nada de spam. O estado anterior fica na
 * tabela `configuracoes` (chave `vigia_bots_vermelhos`). Métrica RECENTE (não o
 * histórico), igual à do vigia da app:
 *   vermelho = a função não responde OU há erros nas últimas 24h.
 *   (o backlog "por enviar" entra como aviso no corpo, não dispara sozinho.)
 *
 * Env (já no Netlify): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * RESEND_API_KEY, SUPABASE_MGMT_TOKEN. Destino: VIGIA_EMAIL (ou DIGEST_EMAIL).
 * Opcional: EMAIL_REMETENTE. Sem estas, sai em silêncio.
 */

import { createClient } from "@supabase/supabase-js";

export const config = { schedule: "0 */2 * * *" };

const REMETENTE = process.env.EMAIL_REMETENTE || "Nº 5 <geral@numerocinco.pt>";
const CHAVE_ESTADO = "vigia_bots_vermelhos";

const BOTS = [
  { marca: "KoolNature · Chef Kool", ref: "kvhkbaneplfblcjkvzor", tipo: "supabase" },
  { marca: "Nº 5 · Quinto", ref: "rycgekqszxyudmchpqvs", tipo: "supabase" },
  { marca: "Água Minda · Kianda", ref: "bxnxyrzjfyqvogcahrvh", tipo: "supabase" },
  { marca: "Quente e Bom · Chef Joaquim", ref: "qciagsktkqljvknmahfu", tipo: "supabase" },
  { marca: "Massa Prima · Chef Prima", ref: "swrwomjsleosbckrsjco", tipo: "supabase" },
  { marca: "Maria Goreti", ref: "ilpkmbxwbzknruhszgye", tipo: "supabase" },
  { marca: "Externato · Avó Maria", ref: "qhcuvlpliqanwqrwsozq", tipo: "supabase" },
  { marca: "Terrae · Joaquim", ref: null, tipo: "netlify", endpoint: "https://terrae.pt/.netlify/functions/joaquim-social" },
];

const resposta = (t) => new Response(t);

async function sonda(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const corpo = (await r.text().catch(() => "")).slice(0, 120);
    return { status: r.status, corpo };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function profundidade(ref, token) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        query:
          "select count(*) filter (where status='error' and created_at > now() - interval '24 hours') as erros, " +
          "count(*) filter (where status='pending' and created_at between now() - interval '24 hours' and now() - interval '2 hours') as presas from public.pending_replies",
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const [row] = await r.json();
    return row ? { erros: Number(row.erros) || 0, presas: Number(row.presas) || 0 } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export default async function handler() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveDb = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const chaveResend = process.env.RESEND_API_KEY;
  const token = process.env.SUPABASE_MGMT_TOKEN || "";
  const destino = process.env.VIGIA_EMAIL || process.env.DIGEST_EMAIL;
  if (!url || !chaveDb) return resposta("Falta o Supabase.");
  if (!chaveResend || !destino) return resposta("watchdog desativado (falta RESEND_API_KEY ou VIGIA_EMAIL).");

  const db = createClient(url, chaveDb, { auth: { persistSession: false } });

  const resultados = await Promise.all(
    BOTS.map(async (b) => {
      const endpoint = b.tipo === "supabase" ? `https://${b.ref}.functions.supabase.co/meta-inbox` : b.endpoint;
      const [live, deep] = await Promise.all([
        sonda(endpoint),
        b.tipo === "supabase" && token ? profundidade(b.ref, token) : Promise.resolve(null),
      ]);
      const vivo = b.tipo === "supabase" ? !!live && live.status === 200 && /ok/i.test(live.corpo) : !!live && live.status !== 404;
      const erros = deep?.erros ?? 0;
      const presas = deep?.presas ?? 0;
      const vermelho = !vivo || erros > 0; // consulta falhada NÃO marca vermelho (evita falso alarme)
      const motivo = !vivo ? (live ? `função respondeu ${live.status}` : "sem resposta") : erros > 0 ? `${erros} erro(s) nas últimas 24h` : "";
      return { marca: b.marca, vermelho, presas, motivo };
    }),
  );

  const vermelhos = resultados.filter((r) => r.vermelho);
  const amarelos = resultados.filter((r) => !r.vermelho && r.presas >= 5);
  const chaveEstado = vermelhos.map((r) => r.marca).sort().join("|");

  // Estado anterior na tabela configuracoes (service role ignora a RLS).
  let antes = "";
  try {
    const { data } = await db.from("configuracoes").select("valor").eq("chave", CHAVE_ESTADO).maybeSingle();
    antes = data?.valor ?? "";
  } catch {
    /* sem estado guardado: avisa na mesma na 1ª deteção */
  }

  // Só email quando o conjunto de bots vermelhos MUDA.
  if (chaveEstado !== antes) {
    let assunto, texto;
    if (vermelhos.length) {
      assunto = `🔴 Bot social com problema: ${vermelhos.map((r) => r.marca).join(", ")}`;
      texto =
        "Bots que precisam de atenção agora:\n\n" +
        vermelhos.map((r) => `🔴 ${r.marca} — ${r.motivo}`).join("\n") +
        (amarelos.length
          ? "\n\nA vigiar (backlog por enviar):\n" + amarelos.map((r) => `🟡 ${r.marca} — ${r.presas} por enviar (24h)`).join("\n")
          : "") +
        "\n\nVê tudo em https://app.numerocinco.pt/estado";
    } else {
      assunto = "✅ Bots sociais recuperaram";
      texto = "Já não há bots vermelhos. Tudo operacional.\n\nhttps://app.numerocinco.pt/estado";
    }
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${chaveResend}`, "content-type": "application/json" },
        body: JSON.stringify({ from: REMETENTE, to: [destino], subject: assunto, text: texto }),
      });
    } catch {
      /* falha de email não pode partir a função */
    }
    try {
      await db
        .from("configuracoes")
        .upsert({ chave: CHAVE_ESTADO, valor: chaveEstado, descricao: "Estado anterior do watchdog dos bots sociais." }, { onConflict: "chave" });
    } catch {
      /* não conseguir gravar o estado não pode partir a função */
    }
  }

  return resposta(`vermelhos: ${vermelhos.length} · amarelos: ${amarelos.length}`);
}
