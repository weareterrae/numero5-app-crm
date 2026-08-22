// Ensaia os dois assistentes da Terrae ANTES de lhes abrir tráfego.
//
// Usa `ensaio: true` com a chave de serviço: atravessa a fatia de rollout
// (que está a 0%) sem expor um único visitante. É a forma de responder à
// pergunta que interessa — "isto dá respostas sólidas?" — sem ter de pôr
// primeiro em produção para descobrir.
//
// Três provas, não uma:
//   1. o chat responde no tema e em português de Portugal;
//   2. o diagnóstico devolve JSON que faz parse (é o que rebenta no site);
//   3. o diagnóstico PESQUISOU mesmo — pedir pesquisa não é usá-la, e um
//      relatório com preços inventados é pior do que um erro visível.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const URL_GW = `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat`;

async function pedir(corpo) {
  const t0 = Date.now();
  const r = await fetch(URL_GW, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://terrae.pt",
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ ...corpo, ensaio: true }),
    signal: AbortSignal.timeout(180000),
  });
  const bruto = await r.text();
  let texto = "", erro = null, requestId = null;
  for (const l of bruto.split("\n")) {
    const s = l.trim();
    if (!s.startsWith("data:")) continue;
    try {
      const e = JSON.parse(s.slice(5).trim());
      if (e.type === "delta") texto += e.text;
      else if (e.type === "error") erro = e.code;
      else if (e.type === "start") requestId = e.request_id;
    } catch { /* fragmento */ }
  }
  return { http: r.status, ms: Date.now() - t0, texto, erro, requestId, bruto };
}

// ---- 1. o chat -------------------------------------------------------
const SYS_CHAT = `És o Joaquim, consultor imobiliário sénior da Terrae (Os Caetanos, Lda), em Portugal.
Falas SEMPRE em português de Portugal, nunca do Brasil. Respostas curtas e concretas.
A Terrae trabalha em angariação com contrato de exclusivo: um único consultor acompanha
o cliente do início à escritura. Nunca inventes valores nem prometes prazos.`;

const chat = await pedir({
  assistant_key: "terrae-joaquim",
  system: SYS_CHAT,
  messages: [{ role: "user", content: "Porque é que devo dar exclusivo à Terrae em vez de pôr a casa em várias imobiliárias?" }],
});
console.log(`CHAT   http ${chat.http} · ${chat.ms}ms · ${chat.texto.length} car${chat.erro ? " · ERRO " + chat.erro : ""}`);
if (chat.texto) console.log("   " + chat.texto.slice(0, 220).replace(/\n/g, " ") + "…");
// pt-BR deixa marcas: gerúndio de processo e "você" a toda a hora
const marcasBR = /\bvocê\b|estamos fazendo|vamos estar|imóvel seu|celular/i.test(chat.texto);
console.log(`   português de Portugal: ${marcasBR ? "DUVIDOSO — marcas de pt-BR" : "ok"}`);

// ---- 2 e 3. um diagnóstico ------------------------------------------
const SYS_DIAG = `És o motor de avaliação imobiliária da Terrae, em Portugal.
Pesquisa valores REAIS de mercado antes de responder — nunca uses valores de memória.
Responde SÓ com JSON válido, sem texto à volta, nesta forma exata:
{"zona":"...","valor_m2_min":0,"valor_m2_max":0,"confianca":"alta|media|baixa","fontes":["..."],"nota":"..."}`;

const diag = await pedir({
  assistant_key: "terrae-diagnosticos",
  system: SYS_DIAG,
  grounding: true,
  response_format: "json",
  max_output_tokens: 2000,
  messages: [{ role: "user", content: "Qual é o valor por metro quadrado de apartamentos usados em Oeiras, hoje?" }],
});
console.log(`\nDIAG   http ${diag.http} · ${diag.ms}ms · ${diag.texto.length} car${diag.erro ? " · ERRO " + diag.erro : ""}`);

let obj = null;
try { obj = JSON.parse(diag.texto.replace(/^```json\s*|\s*```$/g, "").trim()); } catch { /* falha abaixo */ }
console.log(`   JSON faz parse: ${obj ? "sim" : "NÃO — é isto que rebenta no site"}`);
if (obj) {
  console.log(`   zona=${obj.zona} · €/m² ${obj.valor_m2_min}–${obj.valor_m2_max} · confiança=${obj.confianca} · ${(obj.fontes || []).length} fontes`);
}
if (!obj && diag.texto) console.log("   " + diag.texto.slice(0, 200).replace(/\n/g, " "));

console.log("\n(request_id do diagnóstico: " + diag.requestId + " — para confirmar a pesquisa no registo)");
