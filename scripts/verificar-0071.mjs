// Verificação pós-migração 0071. Lê via PostgREST com a service role.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const tabelas = [
  "ai_providers","ai_models","ai_assistants","ai_routing_policies","ai_routing_rules",
  "ai_model_health","ai_probes","ai_requests","ai_budgets","ai_budget_counters",
  "ai_rate_limits","ai_incidents",
];

let falhas = 0;
for (const t of tabelas) {
  const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
  if (error) { console.log(`  ✗ ${t.padEnd(22)} ${error.message}`); falhas++; }
  else console.log(`  ✓ ${t.padEnd(22)} ${count} linhas`);
}

console.log("\n--- providers ---");
const { data: provs } = await sb.from("ai_providers").select("id, adapter, enabled, api_key_env").order("id");
for (const p of provs ?? []) console.log(`  ${p.enabled ? "ON " : "off"} ${p.id.padEnd(10)} adapter=${p.adapter.padEnd(10)} key=${p.api_key_env}`);

console.log("\n--- modelos roteáveis (enabled) ---");
const { data: ms } = await sb.from("ai_models")
  .select("provider_id, provider_model_id, status, enabled, priority, health_status")
  .eq("enabled", true).order("priority");
for (const m of ms ?? []) console.log(`  p${String(m.priority).padStart(3)} ${m.provider_id.padEnd(9)} ${m.provider_model_id.padEnd(30)} ${m.status}`);

console.log("\n--- modelos desligados (memória do incidente) ---");
const { data: off } = await sb.from("ai_models")
  .select("provider_model_id, status").eq("enabled", false).order("provider_model_id");
for (const m of off ?? []) console.log(`  ${m.status.padEnd(11)} ${m.provider_model_id}`);

console.log("\n--- routing (política default) ---");
const { data: rr } = await sb.from("ai_routing_rules")
  .select("request_class, role, ai_models(provider_model_id)").order("request_class");
for (const r of rr ?? []) console.log(`  ${r.request_class.padEnd(10)} ${r.role.padEnd(12)} → ${r.ai_models?.provider_model_id}`);

console.log("\n--- assistente piloto ---");
const { data: as_ } = await sb.from("ai_assistants")
  .select("assistant_key, nome, marca, gateway_enabled, traffic_percentage, allowed_domains");
for (const a of as_ ?? []) console.log(`  ${a.assistant_key} · ${a.nome}/${a.marca} · gateway=${a.gateway_enabled} tráfego=${a.traffic_percentage}% · ${a.allowed_domains}`);

console.log(`\n${falhas === 0 ? "OK — 12/12 tabelas criadas." : `FALHAS: ${falhas}`}`);
