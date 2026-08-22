// Passa a persona do Tutor da Academia para o registo.
//
// Duas razões, e nenhuma é arrumação:
//
// 1. DERIVA. O prompt vivia só no repositório da Academia. Já aconteceu com
//    o Mestre: alguém mudou o prompt no repositório e a cópia na base de
//    dados ficou velha sem ninguém dar por isso. Uma fonte da verdade.
//
// 2. O VIGIA. Sem prompt no registo, o vigia falava ao Tutor sem persona
//    nenhuma — 18 tokens de entrada. Provava que o cano estava aberto, não
//    que o Joaquim é o Joaquim. É a mesma falsa segurança do `estado-motor`.
//
// O site continua a enviar a parte VARIÁVEL (audiência + currículo do
// módulo). O gateway compõe: registo primeiro, chamador depois — nessa
// ordem, porque os fornecedores cacheiam prefixos byte a byte e a parte
// que muda não pode envenenar o prefixo.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Lido do ficheiro no momento, nunca de memória.
const fonte = "C:/Dev/Terrae/academia-terrae/netlify/functions/tutor.js";
const src = readFileSync(fonte, "utf8");
const m = src.match(/const BASE = \[([\s\S]*?)\]\.join\((.*?)\);/);
if (!m) { console.error("não encontrei o BASE em", fonte); process.exit(1); }

// eval sobre um literal do nosso próprio repositório: é a forma de obter o
// texto exato que o site monta, em vez de o reconstruir com regex e errar.
const base = eval("[" + m[1] + "]").join(eval(m[2]));
if (base.length < 2000) { console.error("BASE demasiado curto — algo mudou:", base.length); process.exit(1); }

const { error } = await sb.from("ai_assistants").update({
  system_prompt: base,
  // continua a aceitar o do site: é lá que vive o currículo do módulo
  permite_system_dinamico: true,
}).eq("assistant_key", "academia-tutor");

if (error) { console.error("erro:", error.message); process.exit(1); }
console.log(`✓ Tutor · persona de ${base.length} caracteres no registo`);
console.log("  o site passa a enviar só a audiência e o currículo");
