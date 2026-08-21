// Pergunta à OpenAI que modelos ESTA conta tem mesmo acesso, em vez de
// assumir a partir de conhecimento histórico — o erro que cometi com o
// Bedrock e que o Sandro me mandou corrigir.
//
// Corre DENTRO da Edge Function (que é onde a OPENAI_API_KEY vive como
// secret). O script só invoca a função; a chave nunca passa por aqui.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb.functions.invoke("ai-descobrir", { body: { provider: "openai" } });
if (error) { console.error("erro:", error.message); process.exit(1); }
if (data?.erro) { console.error("erro:", data.erro); process.exit(1); }

console.log(`conta OpenAI: ${data.total} modelos acessíveis\n`);
console.log("candidatos a chat (filtrados):");
for (const m of data.chat ?? []) console.log("  " + m);
