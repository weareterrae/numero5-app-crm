// Regista os dois assistentes da terrae.pt.
//
// Dois, e não um, porque têm necessidades opostas e o encaminhamento tem
// de as distinguir:
//
//   terrae-joaquim       chat do site. Resposta curta, rápida, sem pesquisa.
//   terrae-diagnosticos  avaliação, radar, bússola, porque-não-vende.
//                        Precisam do Google Search (grounding) e de muito
//                        espaço de saída — devolvem JSON grande.
//
// A distinção importa porque só o Google tem grounding: quando um pedido
// pede pesquisa, o router já filtra os modelos por essa capacidade. Um
// assistente único obrigaria os dois casos ao mesmo caminho.
//
// `permite_system_dinamico`: o system é construído no site a partir do
// conteúdo das páginas e da base de conhecimento imobiliária. Passá-lo para
// o registo é trabalho de P1.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: pol } = await sb.from("ai_routing_policies").select("id").eq("nome", "default").single();

const dominios = ["https://terrae.pt", "https://www.terrae.pt", "https://terraesite.netlify.app"];

const assistentes = [
  {
    assistant_key: "terrae-joaquim", nome: "Joaquim", marca: "Terrae",
    descricao: "Assistente do site da Terrae. Imobiliário em Portugal, angariação em exclusivo.",
    allowed_domains: dominios,
    rollback_target: "/.netlify/functions/chat",
    max_output_tokens: 600,      // igual ao que o site já pede
    max_chars_message: 2000,
  },
  {
    assistant_key: "terrae-diagnosticos", nome: "Diagnósticos", marca: "Terrae",
    descricao: "Avaliação, Radar, Bússola e Porque-Não-Vende. Pesquisa no Google e devolve JSON.",
    allowed_domains: dominios,
    rollback_target: "/.netlify/functions/avaliacao-engine",
    max_output_tokens: 8000,     // o JSON dos relatórios é grande
    max_chars_message: 20000,    // recebem contexto extenso do formulário
  },
];

for (const a of assistentes) {
  const { error } = await sb.from("ai_assistants").upsert({
    ...a,
    routing_policy_id: pol.id,
    ativo: true,
    permite_system_dinamico: true,
    permite_json: true,          // os diagnósticos pedem JSON; o chat não usa
    gateway_enabled: true,
    traffic_percentage: 0,       // a zero até estar provado com carga real
    max_messages: 16,
    retention_days: 90,
  }, { onConflict: "assistant_key" });
  console.log((error ? "✗ " : "✓ ") + a.assistant_key.padEnd(22) + (error?.message ?? `${a.nome} · 0% (por provar)`));
}
