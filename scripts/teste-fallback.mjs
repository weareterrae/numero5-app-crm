// Critério de aceitação nº2: matar o modelo primário e o utilizador
// continuar a receber resposta, com o incidente registado.
//
// Simulamos uma queda de fornecedor apontando o PRIMARY a um modelo que
// devolve 404 nesta conta (gemini-2.5-pro). Repõe sempre o estado no fim,
// mesmo que falhe a meio.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const URL_FN = "https://rycgekqszxyudmchpqvs.supabase.co/functions/v1/ai-chat";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const { data: pol } = await sb.from("ai_routing_policies").select("id").eq("nome", "default").single();
const regra = { policy_id: pol.id, request_class: "STANDARD", role: "PRIMARY" };
const { data: orig } = await sb.from("ai_routing_rules").select("model_id")
  .match(regra).single();
const originalId = orig.model_id;   // guardado em memória, não em ficheiro

let falhas = 0;
try {
  // 1. "derrubar" o primário
  await sb.from("ai_models").update({ enabled: true, status: "ACTIVE" }).eq("provider_model_id", "gemini-2.5-pro");
  const { data: morto } = await sb.from("ai_models").select("id").eq("provider_model_id", "gemini-2.5-pro").single();
  await sb.from("ai_routing_rules").update({ model_id: morto.id }).match(regra);
  console.log("PRIMARY apontado a modelo morto (gemini-2.5-pro → 404 nesta conta).");

  console.log("a aguardar expiração da cache do registry (65s)…");
  await espera(65_000);

  // 2. pedido real de utilizador
  const t0 = Date.now();
  const r = await fetch(URL_FN, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://linhasgerais.pt" },
    body: JSON.stringify({
      assistant_key: "mestre-linhas-gerais",
      messages: [{ role: "user", content: "Como capto clientes B2B com uma equipa pequena?" }],
    }),
  });
  const texto = await r.text();
  const total = Date.now() - t0;

  const temTexto = /"type":"delta"/.test(texto);
  const meta = texto.match(/"type":"metadata","data":(\{[^}]*\})/)?.[1];
  const usouFallback = /"fallback_used":true/.test(texto);
  const erro = /"type":"error"/.test(texto);

  console.log(`\n  ${temTexto ? "✓" : "✗"} utilizador recebeu resposta (${total}ms)`);
  console.log(`  ${usouFallback ? "✓" : "✗"} fallback assinalado nos metadados`);
  console.log(`  ${!erro ? "✓" : "✗"} sem erro visível para o utilizador`);
  if (meta) console.log(`     metadata: ${meta}`);
  if (!temTexto || !usouFallback || erro) falhas++;

  // 3. o ledger tem de contar a história toda
  await espera(3000);
  const { data: led } = await sb.from("ai_requests")
    .select("status,provider_model_id,routing_reason,fallback_used,fallback_reason,attempt_chain,ttft_ms")
    .order("created_at", { ascending: false }).limit(1).single();
  console.log(`\n  ledger → modelo=${led?.provider_model_id} fallback=${led?.fallback_used} razão=${led?.fallback_reason}`);
  console.log(`  tentativas registadas: ${JSON.stringify(led?.attempt_chain)}`);
  const cadeiaOk = Array.isArray(led?.attempt_chain) && led.attempt_chain.length >= 2;
  console.log(`  ${cadeiaOk ? "✓" : "✗"} cadeia de tentativas preservada para diagnóstico`);
  if (!cadeiaOk) falhas++;
} finally {
  // 4. repor SEMPRE
  await sb.from("ai_routing_rules").update({ model_id: originalId }).match(regra);
  await sb.from("ai_models").update({ enabled: false, status: "DISABLED" }).eq("provider_model_id", "gemini-2.5-pro");
  console.log("\nestado reposto (PRIMARY original + 2.5-pro desligado).");
}

console.log(falhas === 0 ? "\nOK — o utilizador não sente a queda do fornecedor." : `\nFALHAS: ${falhas}`);
process.exit(falhas === 0 ? 0 : 1);
