// Substitui o bloco de autorização da função ai-descobrir.
// O ficheiro tinha ficado com um byte nulo onde devia estar um espaço,
// o que fazia `auth.includes("\0")` ser sempre falso → 401 em tudo.
import { readFileSync, writeFileSync } from "node:fs";

const p = "supabase/functions/ai-descobrir/index.ts";
let s = readFileSync(p, "utf8");

const NULO = String.fromCharCode(0);
const tinhaNulo = s.includes(NULO);
s = s.split(NULO).join(" ");

const novo = [
  "/**",
  " * Autorizacao: exige um JWT do projeto com a claim role='service_role'.",
  " * Comparar a string da chave nao serve — o gateway do Supabase pode",
  " * reescrever o cabecalho, e a chave anon tambem e um JWT valido. O que",
  " * distingue de facto e a claim dentro do token.",
  " */",
  "function ehServiceRole(auth: string): boolean {",
  "  const token = auth.replace(/^Bearer\\s+/i, '').trim();",
  "  const partes = token.split('.');",
  "  if (partes.length !== 3) return false;",
  "  try {",
  "    const b = partes[1].replace(/-/g, '+').replace(/_/g, '/');",
  "    const payload = JSON.parse(atob(b + '='.repeat((4 - b.length % 4) % 4)));",
  "    return payload?.role === 'service_role';",
  "  } catch {",
  "    return false;",
  "  }",
  "}",
  "",
  "Deno.serve(async (req) => {",
  "  if (!ehServiceRole(req.headers.get('authorization') ?? '')) {",
  "    return new Response(JSON.stringify({ erro: 'nao autorizado' }), { status: 401 });",
  "  }",
].join("\n");

const re = /Deno\.serve\(async \(req\) => \{[\s\S]*?\n  \}/;
if (!re.test(s)) { console.error("nao encontrei o bloco Deno.serve"); process.exit(1); }
s = s.replace(re, novo);
writeFileSync(p, s, "utf8");

console.log("byte nulo removido:", tinhaNulo);
console.log("ficheiro limpo:", !readFileSync(p, "utf8").includes(NULO));
console.log("ehServiceRole presente:", s.includes("ehServiceRole"));
