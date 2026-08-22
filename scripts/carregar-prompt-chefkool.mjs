// Carrega o prompt REAL do Chef Kool para o registo.
//
// Ao contrário do Chef Prima e do Chef Joaquim — que constroem o system a
// partir de bases de conhecimento do repositório — o Chef Kool tem um
// SYSTEM fixo no ficheiro. Logo não precisa de `permite_system_dinamico`:
// a fonte da verdade passa a ser o registo, e o site deixa de o enviar.
//
// Lido do ficheiro no momento (nunca de memória): foi assim que se
// apanhou, no Mestre, uma cópia desatualizada na base de dados.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const fonte = "C:/Dev/KoolNature/koolnature-site/netlify/functions/chef-kool.mjs";
const m = readFileSync(fonte, "utf8").match(/const SYSTEM = `([\s\S]*?)`;/);
if (!m) { console.error("não encontrei o SYSTEM em", fonte); process.exit(1); }

const { error } = await sb.from("ai_assistants").update({
  system_prompt: m[1],
  permite_system_dinamico: false,   // o system vive aqui, não no site
  max_output_tokens: 600,           // igual ao que o site já pedia
  max_chars_message: 1500,          // o site já corta aqui
}).eq("assistant_key", "koolnature-chefkool");

if (error) { console.error("erro:", error.message); process.exit(1); }
console.log(`✓ Chef Kool · prompt ${m[1].length} caracteres carregado no registo`);
