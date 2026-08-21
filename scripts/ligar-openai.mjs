// Liga o fornecedor OpenAI e regista os modelos que a conta tem mesmo
// acesso, com preços oficiais e TTFT medido em produção a 22/08/2026.
// Nenhum valor inventado: modelos vindos de /v1/models, preços da
// documentação oficial, latências medidas pela função ai-descobrir.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 1. ligar o fornecedor
await sb.from("ai_providers").update({
  enabled: true,
  notas: "Ligado 22/08/2026. Conta com acesso a 124 modelos, incl. a familia GPT-5.6 (Luna/Terra/Sol) diretamente, sem passar pelo Bedrock.",
}).eq("id", "openai");

// 2. registar modelos — TTFT medido, precos oficiais
const modelos = [
  {
    provider_model_id: "gpt-5.4-mini", display_name: "GPT-5.4 Mini", family: "gpt-5.4",
    priority: 5, input_cost: 0.75, cached_input_cost: 0.075, output_cost: 4.50,
    notas: "TTFT 460ms medido 22/08/2026 — o mais rapido de todos os testados (Google incluida). PT-PT correto.",
  },
  {
    provider_model_id: "gpt-5.4-nano", display_name: "GPT-5.4 Nano", family: "gpt-5.4",
    priority: 12, input_cost: 0.20, cached_input_cost: 0.02, output_cost: 1.25,
    notas: "TTFT 966ms medido 22/08/2026. Muito barato — bom para FAQ/SIMPLE.",
  },
  {
    provider_model_id: "gpt-5.6-terra", display_name: "GPT-5.6 Terra", family: "gpt-5.6",
    priority: 8, input_cost: 2.00, cached_input_cost: 0.20, output_cost: 12.00,
    notas: "TTFT 1521ms medido 22/08/2026. O equilibrado da familia 5.6.",
  },
  {
    provider_model_id: "gpt-5.6-luna", display_name: "GPT-5.6 Luna", family: "gpt-5.6",
    priority: 20, input_cost: 0.20, cached_input_cost: 0.02, output_cost: 1.20,
    notas: "TTFT 3323ms medido 22/08/2026 — mais LENTO que o Terra, ao contrario do esperado. Barato, mas nao para chat.",
  },
];

for (const m of modelos) {
  const { error } = await sb.from("ai_models").upsert({
    provider_id: "openai", status: "ACTIVE", enabled: true,
    supports_streaming: true, supports_tools: true, supports_vision: true,
    ...m,
  }, { onConflict: "provider_id,provider_model_id" });
  console.log((error ? "✗ " : "✓ ") + m.provider_model_id.padEnd(16) + (error?.message ?? `${m.input_cost}/${m.output_cost} por 1M`));
}

// 3. cadeia de fallback ENTRE FORNECEDORES — o que faltava anteontem
const { data: pol } = await sb.from("ai_routing_policies").select("id").eq("nome", "default").single();
const id = async (k) => (await sb.from("ai_models").select("id").eq("provider_model_id", k).single()).data.id;
const gpt54mini = await id("gpt-5.4-mini");
const gpt54nano = await id("gpt-5.4-nano");
const gpt56terra = await id("gpt-5.6-terra");
const geminiLite = await id("gemini-flash-lite-latest");
const geminiPro = await id("gemini-pro-latest");

const set = (cls, role, model_id) =>
  sb.from("ai_routing_rules").upsert(
    { policy_id: pol.id, request_class: cls, role, model_id },
    { onConflict: "policy_id,request_class,role" });

// Regra: PRIMARY e FALLBACK_1 NUNCA do mesmo fornecedor.
for (const c of ["SIMPLE", "FAQ", "STANDARD"]) {
  await set(c, "PRIMARY", gpt54mini);      // OpenAI · 460ms
  await set(c, "FALLBACK_1", geminiLite);  // Google  · 600ms  ← outro fornecedor
  await set(c, "FALLBACK_2", gpt54nano);   // OpenAI  · 966ms
}
await set("COMPLEX", "PRIMARY", gpt56terra);
await set("COMPLEX", "FALLBACK_1", geminiPro);
await set("COMPLEX", "FALLBACK_2", gpt54mini);
await set("HIGH_VALUE_COMMERCIAL", "PRIMARY", gpt56terra);
await set("HIGH_VALUE_COMMERCIAL", "FALLBACK_1", geminiPro);

const { data: r } = await sb.from("ai_routing_rules")
  .select("request_class, role, ai_models(provider_id, provider_model_id)")
  .eq("policy_id", pol.id).order("request_class");
console.log("\ncadeia de routing (fornecedor · modelo):");
for (const x of r ?? []) {
  console.log(`  ${x.request_class.padEnd(22)}${x.role.padEnd(12)}→ ${x.ai_models.provider_id.padEnd(8)} ${x.ai_models.provider_model_id}`);
}
