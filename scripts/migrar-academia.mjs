// Liga o lib/ai.js da Academia ao N5 AI Gateway.
//
// A Academia tem um ponto ÚNICO de passagem — ai.chat() — com 5 chamadas
// (tutor, coach persona, coach dica, coach avaliação, estado-motor). Por
// isso basta mexer neste ficheiro: os call sites não mudam.
//
// O assistente é escolhido pelo chamador via opts.assistant; sem isso,
// segue pelo caminho antigo. Assim o estado-motor (health check) não
// entra no gateway — não faz sentido gastar tráfego de produção a
// verificar saúde.
import { readFileSync, writeFileSync } from "node:fs";

const p = "C:/Dev/Terrae/academia-terrae/netlify/functions/lib/ai.js";
let s = readFileSync(p, "utf8");
const EOL = s.includes("\r\n") ? "\r\n" : "\n";

if (s.includes("n5Gateway")) { console.log("já migrado"); process.exit(0); }

const helper = [
"",
"/* ---------- N5 AI Gateway ----------",
"   A Academia passa a consultar o gateway do Nº 5 primeiro. É o gateway",
"   que decide se serve (percentagem no painel AI Operations, sem deploy).",
"   Se recusar ou falhar, seguimos pelo caminho antigo — os consultores",
"   nunca ficam sem o Tutor nem sem o Coach.",
"",
"   O system vai NO PEDIDO porque aqui é gerado a partir dos dados do",
"   cenário; o gateway só o aceita em assistentes marcados com",
"   permite_system_dinamico. */",
"const N5_GATEWAY_URL = process.env.N5_GATEWAY_URL;",
"",
"async function n5Gateway(assistantKey, system, messages, maxTokens, opts) {",
"  if (!N5_GATEWAY_URL || !assistantKey) return null;",
"  try {",
"    const r = await fetch(N5_GATEWAY_URL, {",
"      method: 'POST',",
"      headers: { 'content-type': 'application/json', origin: 'https://academia.terrae.pt' },",
"      body: JSON.stringify({",
"        assistant_key: assistantKey,",
"        system: system,",
"        messages: messages,",
"        max_output_tokens: maxTokens,",
"        response_format: (opts && opts.json) ? 'json' : 'text',",
"      }),",
"      signal: AbortSignal.timeout(60000),",
"    });",
"    if (!r.ok || !r.body) return null;",
"",
"    const reader = r.body.getReader();",
"    const dec = new TextDecoder();",
"    let buf = '', texto = '', erro = null;",
"    for (;;) {",
"      const step = await reader.read();",
"      if (step.done) break;",
"      buf += dec.decode(step.value, { stream: true });",
"      const linhas = buf.split(String.fromCharCode(10));",
"      buf = linhas.pop() || '';",
"      for (const l of linhas) {",
"        const t = l.trim();",
"        if (!t.startsWith('data:')) continue;",
"        try {",
"          const ev = JSON.parse(t.slice(5).trim());",
"          if (ev.type === 'delta') texto += ev.text;",
"          else if (ev.type === 'error') erro = ev.code;",
"        } catch (e) { /* fragmento incompleto */ }",
"      }",
"    }",
"    if (erro || !texto.trim()) return null;",
"    return texto;",
"  } catch (e) {",
"    return null;",
"  }",
"}",
"",
].join(EOL);

// 1) helper antes de chat()
const marcaChat = "async function chat(system, messages, maxTokens, opts) {";
if (!s.includes(marcaChat)) { console.error("não encontrei chat()"); process.exit(1); }
s = s.replace(marcaChat, helper + marcaChat);

// 2) o gateway primeiro, dentro de chat()
const corpoAntigo = [
"  if (GEMINI_KEY) return callGemini(system, messages, maxTokens, opts);",
].join(EOL);
const corpoNovo = [
"  // Gateway primeiro, se o chamador identificou o assistente.",
"  if (opts && opts.assistant) {",
"    const viaN5 = await n5Gateway(opts.assistant, system, messages, maxTokens, opts);",
"    if (viaN5) return viaN5;",
"  }",
"  if (GEMINI_KEY) return callGemini(system, messages, maxTokens, opts);",
].join(EOL);
if (!s.includes(corpoAntigo)) { console.error("não encontrei o corpo de chat()"); process.exit(1); }
s = s.replace(corpoAntigo, corpoNovo);

writeFileSync(p, s, "utf8");
console.log("helper inserido:", /async function n5Gateway/.test(s));
console.log("chamada inserida:", /const viaN5 = await n5Gateway/.test(s));
