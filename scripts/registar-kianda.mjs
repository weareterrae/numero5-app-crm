// Regista a Kianda (Água Minda) e carrega o prompt REAL do repositório.
//
// É a que está pior: apanhada pelo vigia com "estou em manutenção" —
// HTTP 200, painel verde, mas sem servir ninguém. A causa é a lista de
// modelos dela depender do gemini-flash-latest, que anda a oscilar com
// 503. No gateway ganha fallback entre fornecedores diferentes.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// prompt real, extraído no momento da migração (não de memória)
const fonte = "C:/Dev/AguaMinda/aguaminda.com/netlify/functions/kianda.mjs";
const m = readFileSync(fonte, "utf8").match(/const SYSTEM = `([\s\S]*?)`;/);
if (!m) { console.error("não encontrei o SYSTEM em", fonte); process.exit(1); }

const { data: pol } = await sb.from("ai_routing_policies").select("id").eq("nome", "default").single();

const { error } = await sb.from("ai_assistants").upsert({
  assistant_key: "aguaminda-kianda",
  nome: "Kianda",
  marca: "Água Minda",
  descricao: "Assistente do site da Água Minda (Angola). Espírito das águas na cultura angolana.",
  system_prompt: m[1],
  // domínio VERIFICADO: o vigia já lhe fala em produção por aqui
  allowed_domains: ["https://aguaminda.com", "https://www.aguaminda.com"],
  routing_policy_id: pol.id,
  ativo: true,
  gateway_enabled: true,
  traffic_percentage: 100,
  rollback_target: "/api/kianda",
  max_output_tokens: 1024,
  max_messages: 16,
  max_chars_message: 600,     // igual ao limite que o site já impõe
  retention_days: 90,
}, { onConflict: "assistant_key" });

if (error) { console.error("erro:", error.message); process.exit(1); }
console.log(`✓ Kianda registada · prompt ${m[1].length} caracteres · 100% de tráfego`);
