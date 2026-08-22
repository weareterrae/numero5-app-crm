// Prova que a rede de segurança funciona — derrubando o modelo principal.
//
// Construir fallback e nunca o experimentar é ter um extintor sem verificar
// se tem pressão. Este script desliga o modelo PRIMARY no registo, faz um
// pedido real a cada assistente, confirma que foram servidos por outro
// modelo, e volta a ligar tudo como estava.
//
// Restaura SEMPRE, mesmo se algo rebentar a meio: o `finally` existe para
// não deixar a produção com um modelo desligado por causa de um teste.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const URL_GW = `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat`;

const ALVO = "gpt-5.4-mini";   // o PRIMARY de quase todos os chats

const casos = [
  ["mestre-linhas-gerais", "https://linhasgerais.netlify.app", "Que serviços têm?"],
  ["terrae-joaquim", "https://terrae.pt", "Vale a pena o exclusivo?"],
  ["aguaminda-kianda", "https://aguaminda.com", "Onde compro Água Minda?"],
  ["academia-tutor", "https://academia.terrae.pt", "O que é o exclusivo?"],
];

async function pedir(chave, origem, pergunta) {
  const t0 = Date.now();
  const r = await fetch(URL_GW, {
    method: "POST",
    headers: { "content-type": "application/json", origin: origem },
    body: JSON.stringify({ assistant_key: chave, messages: [{ role: "user", content: pergunta }] }),
    signal: AbortSignal.timeout(120000),
  });
  const bruto = await r.text();
  let texto = "", erro = null, requestId = null;
  for (const l of bruto.split("\n")) {
    const s = l.trim();
    if (!s.startsWith("data:")) continue;
    try {
      const e = JSON.parse(s.slice(5).trim());
      if (e.type === "delta") texto += e.text;
      else if (e.type === "error") erro = e.code;
      else if (e.type === "start") requestId = e.request_id;
    } catch { /* fragmento */ }
  }
  return { ms: Date.now() - t0, texto, erro, requestId };
}

const { data: antes } = await sb.from("ai_models")
  .select("id, status").eq("provider_model_id", ALVO).single();
if (!antes) { console.error("não encontrei", ALVO); process.exit(1); }
console.log(`${ALVO} está ${antes.status}. A desligar...\n`);

try {
  await sb.from("ai_models").update({ status: "DISABLED" }).eq("id", antes.id);
  // O registo tem cache curta dentro da função; dar-lhe tempo de expirar.
  await new Promise((r) => setTimeout(r, 65000));

  for (const [chave, origem, pergunta] of casos) {
    const r = await pedir(chave, origem, pergunta);
    let modelo = "—";
    if (r.requestId) {
      await new Promise((s) => setTimeout(s, 2500));
      const { data } = await sb.from("ai_requests")
        .select("provider_model_id, fallback_used").eq("request_id", r.requestId).maybeSingle();
      modelo = data ? `${data.provider_model_id}${data.fallback_used ? " (fallback)" : ""}` : "—";
    }
    const ok = r.texto.trim().length > 60;
    console.log(
      (ok ? "RESPONDEU " : "FALHOU    ") + chave.padEnd(22) +
      String(r.ms).padStart(6) + "ms  " + modelo.padEnd(28) +
      (r.erro ? "erro: " + r.erro : r.texto.slice(0, 40).replace(/\n/g, " ")),
    );
  }
} finally {
  await sb.from("ai_models").update({ status: antes.status }).eq("id", antes.id);
  const { data: depois } = await sb.from("ai_models").select("status").eq("id", antes.id).single();
  console.log(`\n${ALVO} reposto: ${depois.status}`);
}
