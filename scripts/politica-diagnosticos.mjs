// Política de encaminhamento dos DIAGNÓSTICOS da Terrae.
//
// Existe porque a política do chat serve mal um relatório. Ao exigir
// pesquisa, a cadeia do chat encolhia ao único modelo com pesquisa que lá
// estava — o `flash-lite`, o mais fraco de todos. Exatamente ao contrário
// do que um relatório precisa.
//
// Aqui a ordem é por QUALIDADE, não por preço:
//
//   PRIMARY      gemini-pro-latest      o melhor com pesquisa
//   FALLBACK_1   gemini-3.5-flash       rápido e capaz, se o Pro falhar
//   FALLBACK_2   gemini-flash-lite      último recurso, melhor que nada
//
// Só modelos do Google: a pesquisa no Google Search é condição do
// diagnóstico, e nenhum modelo da OpenAI a tem. Um relatório sem factos
// frescos não é um relatório mais barato — é um risco para a marca.
//
// Folga de tokens generosa: o JSON dos relatórios é grande e o raciocínio
// do Pro consome orçamento. maxOutputTokens é um TETO, não um gasto.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: modelos } = await sb.from("ai_models")
  .select("id, provider_model_id, status, supports_grounding");
const porNome = Object.fromEntries(modelos.map((m) => [m.provider_model_id, m]));

const cadeia = [
  ["PRIMARY", "gemini-pro-latest"],
  ["FALLBACK_1", "gemini-3.5-flash"],
  ["FALLBACK_2", "gemini-flash-lite-latest"],
];

// Recusa montar a política com um modelo que não sabe pesquisar ou que não
// está de pé — um erro aqui só se veria num relatório errado semanas depois.
for (const [papel, nome] of cadeia) {
  const m = porNome[nome];
  if (!m) { console.error(`✗ modelo desconhecido: ${nome}`); process.exit(1); }
  if (!m.supports_grounding) { console.error(`✗ ${nome} não sabe pesquisar`); process.exit(1); }
  if (m.status !== "ACTIVE") { console.error(`✗ ${nome} está ${m.status}`); process.exit(1); }
}

// `nome` não tem restrição de unicidade na tabela — por isso procura-se
// primeiro em vez de fazer upsert, senão correr o script duas vezes criava
// duas políticas com o mesmo nome e a segunda ficaria órfã.
const { data: existente } = await sb.from("ai_routing_policies")
  .select("id").eq("nome", "diagnosticos").limit(1).maybeSingle();

let pol = existente;
if (!pol) {
  const { data, error } = await sb.from("ai_routing_policies")
    .insert({ nome: "diagnosticos", descricao: "Relatórios da Terrae: qualidade primeiro, pesquisa obrigatória." })
    .select("id").single();
  if (error) { console.error("erro na política:", error.message); process.exit(1); }
  pol = data;
}

// As mesmas regras para todas as classes: um relatório é sempre um
// relatório, venha o pedido curto ou longo.
const classes = ["SIMPLE", "STANDARD", "COMPLEX"];
for (const cls of classes) {
  for (const [papel, nome] of cadeia) {
    const { error } = await sb.from("ai_routing_rules").upsert({
      policy_id: pol.id,
      request_class: cls,
      role: papel,
      model_id: porNome[nome].id,
      grounding: true,
      max_output_tokens: 8000,
      temperature: 0.4,        // factual, não criativo
      token_headroom: 8000,    // o raciocínio do Pro não pode truncar o JSON
    }, { onConflict: "policy_id,request_class,role" });
    if (error) { console.error(`✗ ${cls}/${papel}: ${error.message}`); process.exit(1); }
  }
}
console.log(`✓ política "diagnosticos" · ${classes.length} classes × ${cadeia.length} modelos`);
console.log("  " + cadeia.map(([p, n]) => `${p}=${n}`).join("  →  "));

const { error: eAtr } = await sb.from("ai_assistants")
  .update({ routing_policy_id: pol.id }).eq("assistant_key", "terrae-diagnosticos");
console.log(eAtr ? "✗ " + eAtr.message : "✓ terrae-diagnosticos passa a usar esta política");
