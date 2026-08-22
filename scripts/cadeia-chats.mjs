// Corrige a cadeia dos chats: uma falha não pode baixar a qualidade.
//
// Como estava, com o gpt-5.4-mini em baixo os assistentes caíam para o
// gemini-flash-lite e depois para o gpt-5.4-nano — os dois modelos mais
// fracos que temos. Provado a 22/08/2026 desligando o principal: as quatro
// marcas responderam em 1,8s, mas pelo pior modelo disponível.
//
// Isso é o contrário do que se quer. A rede existe para o cliente não notar
// nada; se notar que as respostas pioraram, a rede falhou na mesma.
//
// Nova cadeia, escolhida pelas avarias que realmente acontecem:
//
//   PRIMARY     gpt-5.4-mini       barato, rápido, com cache (8,7× mais barato)
//   FALLBACK_1  gemini-3.5-flash   OUTRO fornecedor, e capaz
//   FALLBACK_2  gpt-5.6-terra      volta à OpenAI, num modelo melhor
//   EMERGENCY   gemini-flash-lite  último recurso: mau é melhor que nada
//
// Cobertura:
//   · gpt-5.4-mini retirado/degradado → FALLBACK_1 (Google) responde
//   · OpenAI em baixo                 → FALLBACK_1 (Google) responde
//   · Google em baixo                 → FALLBACK_2 (OpenAI) responde
//   · os dois em baixo                → nada ajuda, e nenhuma cadeia salva
//
// O custo só sobe no caminho raro: 2 a 2,7× o do principal, e só enquanto
// durar a avaria. Uma resposta fraca a um cliente custa mais.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: modelos } = await sb.from("ai_models").select("id, provider_model_id, status, input_cost");
const porNome = Object.fromEntries(modelos.map((m) => [m.provider_model_id, m]));

const cadeia = [
  ["PRIMARY", "gpt-5.4-mini"],
  ["FALLBACK_1", "gemini-3.5-flash"],
  ["FALLBACK_2", "gpt-5.6-terra"],
  ["EMERGENCY", "gemini-flash-lite-latest"],
];

// Um modelo sem preço no registo daria custo NULO no painel — silenciosamente.
for (const [papel, nome] of cadeia) {
  const m = porNome[nome];
  if (!m) { console.error(`✗ modelo desconhecido: ${nome}`); process.exit(1); }
  if (m.status !== "ACTIVE") { console.error(`✗ ${nome} está ${m.status}`); process.exit(1); }
  if (m.input_cost == null) { console.error(`✗ ${nome} não tem preço — daria custo nulo`); process.exit(1); }
}

const { data: pol } = await sb.from("ai_routing_policies")
  .select("id").eq("nome", "default").limit(1).single();

// Só as classes de conversa. COMPLEX e HIGH_VALUE_COMMERCIAL já vão de
// gemini-pro primeiro e não se tocam.
for (const cls of ["FAQ", "SIMPLE", "STANDARD"]) {
  for (const [papel, nome] of cadeia) {
    const { error } = await sb.from("ai_routing_rules").upsert({
      policy_id: pol.id, request_class: cls, role: papel, model_id: porNome[nome].id,
    }, { onConflict: "policy_id,request_class,role" });
    if (error) { console.error(`✗ ${cls}/${papel}: ${error.message}`); process.exit(1); }
  }
}
console.log("✓ cadeia dos chats: " + cadeia.map(([p, n]) => n).join(" → "));

// ---------------------------------------------------------------------
// Modelos ACTIVE sem preço são uma armadilha: servem pedidos e registam
// custo nulo. O painel diria que estão a sair de graça. Enquanto não
// tiverem preço confirmado na documentação do fornecedor, ficam DISABLED —
// não estão em nenhuma cadeia, por isso não muda nada em produção.
const semPreco = modelos.filter((m) => m.status === "ACTIVE" && m.input_cost == null);
for (const m of semPreco) {
  await sb.from("ai_models").update({ status: "DISABLED" }).eq("id", m.id);
  console.log(`✓ ${m.provider_model_id} → DISABLED (sem preço no registo)`);
}
if (!semPreco.length) console.log("✓ nenhum modelo ACTIVE sem preço");
