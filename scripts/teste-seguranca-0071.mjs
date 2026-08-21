// Teste de regressão de segurança para as tabelas ai_*.
// Um cliente anónimo/externo NÃO pode ler operação nem dados de outra org.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
// Cliente ANÓNIMO — simula o browser de um visitante qualquer.
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const operacao = ["ai_providers","ai_models","ai_routing_policies","ai_routing_rules",
                  "ai_model_health","ai_probes","ai_rate_limits","ai_budget_counters","ai_incidents"];
const comOrg   = ["ai_assistants","ai_requests","ai_budgets"];

let falhas = 0;
const check = async (t) => {
  const { data, error } = await anon.from(t).select("*").limit(5);
  const bloqueado = !!error || (data?.length ?? 0) === 0;
  console.log(`  ${bloqueado ? "✓ bloqueado" : "✗ FUGA!!"}  ${t.padEnd(22)} ${error ? error.code : `${data?.length ?? 0} linhas`}`);
  if (!bloqueado) falhas++;
};

console.log("Leitura anónima de tabelas de OPERAÇÃO (só equipa):");
for (const t of operacao) await check(t);
console.log("\nLeitura anónima de tabelas com ORG_ID:");
for (const t of comOrg) await check(t);

// Escrita anónima tem de falhar sempre.
console.log("\nEscrita anónima:");
const { error: werr } = await anon.from("ai_models").insert({
  provider_id: "google", provider_model_id: "intruso-" + Date.now(), display_name: "intruso",
});
console.log(`  ${werr ? "✓ bloqueada" : "✗ FUGA!! escrita permitida"}  ai_models ${werr ? `(${werr.code})` : ""}`);
if (!werr) falhas++;

console.log(`\n${falhas === 0 ? "OK — isolamento confirmado, zero fugas." : `FALHAS DE SEGURANÇA: ${falhas}`}`);
process.exit(falhas === 0 ? 0 : 1);
