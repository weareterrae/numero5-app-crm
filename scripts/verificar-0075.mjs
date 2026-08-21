// Verifica as vistas do painel e, sobretudo, que o security_invoker
// está mesmo a funcionar — uma vista sem ele contorna o RLS das tabelas
// por baixo e fura o isolamento entre clientes.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const vistas = ["ai_resumo_assistente", "ai_resumo_modelo", "ai_resumo_fornecedor"];
let falhas = 0;

console.log("existência e conteúdo (service role):");
for (const v of vistas) {
  const { data, error } = await svc.from(v).select("*");
  if (error) { console.log(`  ✗ ${v.padEnd(24)} ${error.message}`); falhas++; }
  else console.log(`  ✓ ${v.padEnd(24)} ${data.length} linhas`);
}

console.log("\nsecurity_invoker (anónimo NÃO pode ler):");
for (const v of vistas) {
  const { data, error } = await anon.from(v).select("*").limit(3);
  const bloqueado = !!error || (data?.length ?? 0) === 0;
  console.log(`  ${bloqueado ? "✓ bloqueado" : "✗ FUGA!!"}  ${v.padEnd(24)} ${error ? error.code : `${data?.length} linhas`}`);
  if (!bloqueado) falhas++;
}

console.log("\ndados do painel:");
const { data: a } = await svc.from("ai_resumo_assistente").select("nome, pedidos_hoje, erros_hoje, fallbacks_hoje, custo_hoje, ttft_p95");
for (const x of a ?? []) {
  console.log(`  ${String(x.nome).padEnd(10)} hoje: ${x.pedidos_hoje} pedidos · ${x.erros_hoje} erros · ${x.fallbacks_hoje} fallbacks · $${Number(x.custo_hoje).toFixed(4)} · p95 ${x.ttft_p95 ?? "—"}ms`);
}
const { data: m } = await svc.from("ai_resumo_modelo").select("provider_id, provider_model_id, health_status, pedidos_24h, ttft_p95").order("pedidos_24h", { ascending: false }).limit(5);
console.log("\n  modelos com mais tráfego (24h):");
for (const x of m ?? []) {
  console.log(`    ${x.provider_id.padEnd(8)} ${x.provider_model_id.padEnd(26)} ${String(x.health_status).padEnd(9)} ${x.pedidos_24h} pedidos · p95 ${x.ttft_p95 ?? "—"}ms`);
}

console.log(`\n${falhas === 0 ? "OK — vistas a funcionar e isolamento intacto." : `FALHAS: ${falhas}`}`);
process.exit(falhas === 0 ? 0 : 1);
