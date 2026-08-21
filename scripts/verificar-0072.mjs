// Testa as funções atómicas de 0072 (e limpa o que criar).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) falhas++; };

// --- ai_rate_bump: tem de contar de forma incremental
const chave = "teste-" + Date.now();
const r1 = await sb.rpc("ai_rate_bump", { p_scope: "ip", p_scope_key: chave, p_window_seconds: 60 });
const r2 = await sb.rpc("ai_rate_bump", { p_scope: "ip", p_scope_key: chave, p_window_seconds: 60 });
ok(!r1.error && r1.data === 1, `ai_rate_bump 1ª chamada → ${r1.data ?? r1.error?.message}`);
ok(!r2.error && r2.data === 2, `ai_rate_bump 2ª chamada → ${r2.data ?? r2.error?.message}`);

// --- concorrência: 20 chamadas em paralelo têm de dar exatamente 20
const kc = "conc-" + Date.now();
const res = await Promise.all(Array.from({ length: 20 }, () =>
  sb.rpc("ai_rate_bump", { p_scope: "ip", p_scope_key: kc, p_window_seconds: 60 })));
const max = Math.max(...res.map((r) => r.data ?? 0));
ok(max === 20, `20 chamadas concorrentes → contagem final ${max} (esperado 20, sem incrementos perdidos)`);

// --- ai_health_bump
const { data: modelo } = await sb.from("ai_models").select("id, display_name").eq("enabled", true).limit(1).single();
const janela = new Date(Math.floor(Date.now() / 300000) * 300000).toISOString();
const h1 = await sb.rpc("ai_health_bump", { p_model_id: modelo.id, p_window_start: janela, p_ok: true, p_status: 200, p_latency_ms: 900 });
const h2 = await sb.rpc("ai_health_bump", { p_model_id: modelo.id, p_window_start: janela, p_ok: false, p_status: 503 });
ok(!h1.error, `ai_health_bump sucesso → ${JSON.stringify(h1.data?.[0] ?? h1.error?.message)}`);
ok(!h2.error && h2.data?.[0]?.errors === 1, `ai_health_bump erro → taxa ${h2.data?.[0]?.error_rate ?? h2.error?.message}`);

// --- ai_budget_bump
const { data: orc } = await sb.from("ai_budgets").insert({
  assistant_id: null, org_id: null, daily_limit_usd: 5, monthly_limit_usd: 50,
}).select("id").single();
if (orc) {
  const b1 = await sb.rpc("ai_budget_bump", { p_budget_id: orc.id, p_period: "day", p_period_key: "2026-08-22", p_cost: 0.0125 });
  const b2 = await sb.rpc("ai_budget_bump", { p_budget_id: orc.id, p_period: "day", p_period_key: "2026-08-22", p_cost: 0.0075 });
  ok(!b2.error && Math.abs(Number(b2.data) - 0.02) < 1e-9, `ai_budget_bump soma → ${b2.data ?? b2.error?.message} (esperado 0.02)`);
  await sb.from("ai_budgets").delete().eq("id", orc.id);   // limpa
}

// --- anon NÃO pode executar as funções
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const a = await anon.rpc("ai_rate_bump", { p_scope: "ip", p_scope_key: "intruso", p_window_seconds: 60 });
ok(!!a.error, `anon bloqueado em ai_rate_bump ${a.error ? `(${a.error.code})` : "→ FUGA!"}`);

// limpeza
await sb.from("ai_rate_limits").delete().in("scope_key", [chave, kc]);
await sb.from("ai_model_health").delete().eq("model_id", modelo.id).eq("window_start", janela);

console.log(`\n${falhas === 0 ? "OK — contadores atómicos a funcionar." : `FALHAS: ${falhas}`}`);
process.exit(falhas === 0 ? 0 : 1);
