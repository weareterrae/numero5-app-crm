// Regista os seis assistentes da app.numerocinco.pt.
//
// Três servem a equipa do Nº 5, três servem a Sede (o portal do cliente):
//
//   app-briefing-dia      o briefing da manhã
//   app-chat-equipa       assistente interno da equipa
//   app-guia-cliente      prepara a próxima conversa com um cliente (JSON)
//   sede-assistente       fala com o CLIENTE no portal dele
//   sede-guia-sugestao    sugestões curtas dentro da Sede
//   sede-resumo-mes       o resumo mensal que o cliente lê
//
// O `sede-assistente` é o único destes que fala com alguém de fora. Tem
// domínio próprio na allowlist e um teto de mensagem mais apertado.
//
// Os prompts continuam a ser construídos na app: dependem do cliente, do
// mês, do dossiê. Não há prefixo fixo que valha a pena mover para aqui —
// ao contrário do Quinto ou do Tutor, cujas personas são estáveis.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: pol } = await sb.from("ai_routing_policies")
  .select("id").eq("nome", "default").limit(1).single();

const dominios = ["https://app.numerocinco.pt", "https://numero5-app.netlify.app"];

const assistentes = [
  { assistant_key: "app-briefing-dia", nome: "Briefing do dia", marca: "Nº 5 · app",
    descricao: "Escreve o briefing da manhã para a equipa.",
    max_output_tokens: 900, max_chars_message: 20000, permite_json: false },

  { assistant_key: "app-chat-equipa", nome: "Assistente da equipa", marca: "Nº 5 · app",
    descricao: "Assistente interno: responde à equipa sobre clientes e trabalho em curso.",
    max_output_tokens: 1500, max_chars_message: 20000, permite_json: false },

  { assistant_key: "app-guia-cliente", nome: "Guia de cliente", marca: "Nº 5 · app",
    descricao: "Prepara a próxima conversa com um cliente a partir do dossiê. Devolve JSON.",
    max_output_tokens: 3072, max_chars_message: 30000, permite_json: true },

  { assistant_key: "sede-assistente", nome: "Assistente da Sede", marca: "Nº 5 · Sede",
    descricao: "Fala com o CLIENTE no portal dele. O único desta app virado para fora.",
    max_output_tokens: 1200, max_chars_message: 4000, permite_json: false },

  { assistant_key: "sede-guia-sugestao", nome: "Sugestões da Sede", marca: "Nº 5 · Sede",
    descricao: "Sugestões curtas dentro do portal do cliente.",
    max_output_tokens: 400, max_chars_message: 8000, permite_json: false },

  { assistant_key: "sede-resumo-mes", nome: "Resumo do mês", marca: "Nº 5 · Sede",
    descricao: "O resumo mensal que o cliente lê no portal.",
    max_output_tokens: 900, max_chars_message: 20000, permite_json: false },
];

for (const a of assistentes) {
  const { error } = await sb.from("ai_assistants").upsert({
    ...a,
    allowed_domains: dominios,
    routing_policy_id: pol.id,
    ativo: true,
    permite_system_dinamico: true,   // o prompt nasce dos dados do cliente
    gateway_enabled: true,
    traffic_percentage: 0,           // a zero até estar provado
    max_messages: 16,
    retention_days: 90,
  }, { onConflict: "assistant_key" });
  console.log((error ? "✗ " : "✓ ") + a.assistant_key.padEnd(22) + (error?.message ?? a.nome));
}
