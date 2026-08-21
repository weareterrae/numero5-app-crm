// Carrega no registo o prompt REAL do Mestre, extraído do código antigo
// (linhasgerais-site/netlify/functions/mestre.mjs). Assim o piloto é uma
// comparação honesta: mesmo prompt, mesma marca — só muda a infraestrutura.
// Correr DEPOIS da migração 0074.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const fonte = "C:/Dev/linhasgerais-site/netlify/functions/mestre.mjs";
const src = readFileSync(fonte, "utf8");
const m = src.match(/const SYSTEM_PROMPT\s*=\s*`([\s\S]*?)`;/);
if (!m) { console.error("Não encontrei SYSTEM_PROMPT em", fonte); process.exit(1); }
const prompt = m[1];

const { error } = await sb.from("ai_assistants")
  .update({ system_prompt: prompt })
  .eq("assistant_key", "mestre-linhas-gerais");

if (error) {
  console.error("Erro:", error.message);
  if (error.message.includes("system_prompt")) console.error("→ falta correr a migração 0074.");
  process.exit(1);
}

const { data } = await sb.from("ai_assistants")
  .select("nome, marca, system_prompt").eq("assistant_key", "mestre-linhas-gerais").single();
console.log(`✓ ${data.nome} (${data.marca}) — prompt com ${data.system_prompt.length} caracteres, igual ao do site antigo.`);
console.log(`  início: ${data.system_prompt.slice(0, 90)}…`);
