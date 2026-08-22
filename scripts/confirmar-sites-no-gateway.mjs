// Prova que cada SITE está mesmo a passar pelo gateway.
//
// Não basta o gateway responder quando lhe falamos diretamente: isso só
// prova que o gateway funciona. O que interessa é se o site o CHAMA.
//
// Método: marca-se o instante, fala-se ao endpoint público do site como um
// visitante, e vê-se se apareceu um pedido em `ai_requests` depois da marca.
// Sem linha nova, o site respondeu pelo caminho antigo — mesmo que a
// resposta esteja perfeita.
//
// Foi assim que se apanhou o caso real: variável colocada no Netlify mas
// ainda sem deploy novo, com os três sites a responderem bem e o gateway
// a zero. Nada no painel dava esse sinal.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Cada site tem o SEU contrato — não há um formato comum. Confirmado a ler
// cada ficheiro: partir do princípio que era igual custou um teste falhado.
const sites = [
  { chave: "aguaminda-kianda",    url: "https://aguaminda.com/api/kianda",         corpo: (q) => ({ messages: [{ role: "user", content: q }] }),  campo: "reply" },
  // o Joaquim devolve texto simples, não JSON — campo a null
  { chave: "quenteebom-joaquim",  url: "https://quenteebom.com/api/joaquim",       corpo: (q) => ({ messages: [{ role: "user", content: q }] }),  campo: null },
  { chave: "massaprima-chef",     url: "https://massaprima.com/api/chef-prima",    corpo: (q) => ({ messages: [{ role: "user", content: q }] }),  campo: "reply" },
  { chave: "koolnature-chefkool", url: "https://koolnature.pt/api/chef-kool",      corpo: (q) => ({ historico: [{ role: "user", content: q }] }), campo: "resposta" },
];

const PERGUNTA = "Olá, o que me recomendas?";

for (const s of sites) {
  const marca = new Date().toISOString();
  const t0 = Date.now();
  let http = "—", texto = "";
  try {
    const r = await fetch(s.url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(s.url).origin },
      body: JSON.stringify(s.corpo(PERGUNTA)),
      signal: AbortSignal.timeout(60000),
    });
    http = String(r.status);
    const bruto = await r.text();
    if (s.campo === null) texto = bruto;
    else { try { texto = String(JSON.parse(bruto)?.[s.campo] ?? ""); } catch { texto = ""; } }
  } catch (e) {
    http = "rede";
    texto = String(e).slice(0, 60);
  }

  // dar tempo à escrita do registo (é feita depois de fechar o fluxo)
  await new Promise((r) => setTimeout(r, 3000));
  const { data } = await sb.from("ai_requests")
    .select("status, provider_model_id, ai_assistants!inner(assistant_key)")
    .eq("ai_assistants.assistant_key", s.chave)
    .gte("created_at", marca).limit(1);

  const passou = (data?.length ?? 0) > 0;
  console.log(
    (passou ? "GATEWAY " : "ANTIGO  ") + s.chave.padEnd(22) +
    ("http " + http).padEnd(10) + String(Date.now() - t0).padStart(6) + "ms  " +
    String(texto.length).padStart(4) + " car" +
    (passou ? "  via " + data[0].provider_model_id : ""),
  );
}

console.log("\nGATEWAY = o site chamou o N5. ANTIGO = respondeu pelo caminho de sempre");
console.log("(resposta boa, mas sem fallback entre fornecedores, sem custo medido).");
