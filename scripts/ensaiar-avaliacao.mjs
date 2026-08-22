// Ensaia a AVALIAÇÃO de um imóvel — o diagnóstico mais delicado de todos.
//
// Aqui não se está a responder a uma curiosidade: está-se a dizer a alguém
// quanto vale a casa dele. Um número mal apurado ou perde-lhe dinheiro na
// venda, ou põe a casa meses no mercado sem uma visita.
//
// Compara 1 passagem contra 4 para se ver o que se ganha em rigor.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const SYS = `És o motor de avaliação da Terrae, imobiliária em Portugal.
Avalia com rigor defensável perante o proprietário. Nunca inventes valores.
Se a informação for insuficiente, baixa a confiança e diz o que falta.
Responde só com JSON:
{"valor_min":0,"valor_max":0,"valor_provavel":0,"eur_m2":0,"confianca":"alta|media|baixa",
 "fundamentacao":"...","o_que_falta":["..."],"fontes":["..."]}`;

const IMOVEL = `Apartamento T3, 118 m² de área útil, em Linda-a-Velha (Oeiras).
Prédio de 1998, 4.º andar com elevador, 2 lugares de garagem, varanda,
estado de conservação bom mas cozinha e casas de banho originais.
O proprietário quer vender nos próximos 6 meses.`;

async function avaliar(passos) {
  const t0 = Date.now();
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://terrae.pt",
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      assistant_key: "terrae-diagnosticos",
      ensaio: true,
      system: SYS,
      grounding: true,
      response_format: "json",
      max_output_tokens: 3000,
      passos_investigacao: passos,
      messages: [{ role: "user", content: IMOVEL }],
    }),
    signal: AbortSignal.timeout(560000),
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
  let obj = null;
  try { obj = JSON.parse(texto.replace(/^```json\s*|\s*```$/g, "").trim()); } catch { /* abaixo */ }
  return { ms: Date.now() - t0, obj, erro, requestId, texto };
}

for (const passos of [1, 4]) {
  const r = await avaliar(passos);
  const eur = (v) => (v ? Number(v).toLocaleString("pt-PT") + " €" : "—");
  console.log(`\n${"=".repeat(58)}\n${passos} PASSAGEM${passos > 1 ? "NS" : ""} · ${Math.round(r.ms / 1000)}s${r.erro ? " · ERRO " + r.erro : ""}`);
  if (!r.obj) { console.log("   JSON falhou: " + r.texto.slice(0, 160)); continue; }
  const o = r.obj;
  console.log(`   ${eur(o.valor_min)} – ${eur(o.valor_max)}  (provável ${eur(o.valor_provavel)})`);
  console.log(`   €/m²: ${o.eur_m2 ?? "—"} · confiança: ${o.confianca} · fontes: ${(o.fontes || []).length}`);
  console.log(`   fundamentação: ${String(o.fundamentacao || "").slice(0, 260)}`);
  if ((o.o_que_falta || []).length) console.log(`   por confirmar: ${o.o_que_falta.join(" · ").slice(0, 200)}`);
  console.log(`   request_id: ${r.requestId}`);
}
