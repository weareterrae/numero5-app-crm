// Regista os três assistentes do site do Nº 5 (numerocinco.pt).
//
//   numerocinco-quinto     o Quinto, assistente do site. Conversa.
//   numerocinco-proposta   escreve o texto de uma proposta comercial. JSON.
//   numerocinco-raiox      ideias de IA no Raio-X gratuito. JSON.
//
// Os dois primeiros têm prompt fixo no repositório: vai para o registo, que
// passa a ser a fonte da verdade — e o prefixo estável faz o caching valer
// (medido: 8,7× mais barato quando o cache pega).
//
// O do Raio-X constrói o prompt a partir do relatório de presença digital de
// cada empresa; não há prefixo fixo, por isso continua a vir do site.
//
// REGRA DA CASA: o Nº 5 não publica preços. Nada aqui os introduz — o
// prompt da proposta é o que já estava no repositório e nasce do
// diagnóstico, como sempre.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/** Lê o SYSTEM real do ficheiro — nunca de memória. */
function systemDe(ficheiro) {
  const s = readFileSync(ficheiro, "utf8");
  const m = s.match(/const SYSTEM = ([`"])([\s\S]*?)\1;/);
  if (!m) { console.error("não encontrei o SYSTEM em", ficheiro); process.exit(1); }
  return m[2];
}

const BASE = "C:/Dev/numero5-site/netlify/functions/";
const dominios = [
  "https://numerocinco.pt", "https://www.numerocinco.pt",
  "https://numero5.netlify.app",
];

const { data: polChat } = await sb.from("ai_routing_policies")
  .select("id").eq("nome", "default").limit(1).single();
// Nenhum destes vai pela política dos relatórios. Essa força pesquisa em
// todas as regras e faz o percurso de dois passos — três minutos por
// resposta. Serve uma avaliação de imóvel; não serve uma ferramenta de
// captação, onde quem está do outro lado desiste ao fim de meio minuto.
// O dossiê do Raio-X e o da proposta já vêm apurados de outro sítio.

const assistentes = [
  {
    assistant_key: "numerocinco-quinto", nome: "Quinto", marca: "Nº 5",
    descricao: "Assistente do site do Nº 5. Marketing digital e IA para PMEs em Portugal e Angola.",
    system_prompt: systemDe(BASE + "chat.mjs"),
    permite_system_dinamico: true,   // o site acrescenta a nota de idioma
    permite_json: false,
    routing_policy_id: polChat.id,
    max_output_tokens: 1024, max_chars_message: 2000,
    rollback_target: "/api/chat",
  },
  {
    assistant_key: "numerocinco-proposta", nome: "Proposta", marca: "Nº 5",
    descricao: "Escreve o texto de uma proposta comercial a partir do dossiê de diagnóstico.",
    system_prompt: systemDe(BASE + "proposta.mjs"),
    permite_system_dinamico: true,
    permite_json: true,
    routing_policy_id: polChat.id,   // não precisa de pesquisa: o dossiê já vem feito
    max_output_tokens: 4096, max_chars_message: 20000,
    rollback_target: "/api/proposta",
  },
  {
    assistant_key: "numerocinco-raiox", nome: "Raio-X · ideias", marca: "Nº 5",
    descricao: "Ideias de IA para o relatório de presença digital gratuito.",
    // sem prompt fixo: é construído a partir do relatório de cada empresa
    permite_system_dinamico: true,
    permite_json: true,
    routing_policy_id: polChat.id,
    max_output_tokens: 4096, max_chars_message: 20000,
    rollback_target: "/api/raio-x-ideias",
  },
];

for (const a of assistentes) {
  const { error } = await sb.from("ai_assistants").upsert({
    ...a,
    allowed_domains: dominios,
    ativo: true,
    gateway_enabled: true,
    traffic_percentage: 0,     // a zero até estar provado com carga real
    max_messages: 16,
    retention_days: 90,
  }, { onConflict: "assistant_key" });
  console.log((error ? "✗ " : "✓ ") + a.assistant_key.padEnd(24) +
    (error?.message ?? `${a.nome}${a.system_prompt ? ` · prompt ${a.system_prompt.length} car` : " · prompt do site"}`));
}
