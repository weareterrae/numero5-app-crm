// Regista Chef Prima, Chef Joaquim e Chef Kool.
//
// Os três constroem o system a partir das bases de conhecimento que
// vivem nos respetivos repositórios (catálogos, receitas, manuais). Não
// são prompts fixos que caibam já no registo — por isso entram com
// `permite_system_dinamico`, tal como a Academia.
//
// Mover essas bases para o registo é trabalho de P1 (prompt management)
// e resolve de vez a deriva entre repositório e base de dados. Até lá,
// o site envia o system e o gateway trata de modelo, fallback, custo e
// medição — que é o que estava a faltar.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: pol } = await sb.from("ai_routing_policies").select("id").eq("nome", "default").single();

// Domínios confirmados: são os que os vigias já usam com sucesso em produção.
const marcas = [
  {
    assistant_key: "massaprima-chef", nome: "Chef Prima", marca: "Massa Prima",
    descricao: "Mestre padeiro digital da Massa Prima (Angola). Mixes, receitas e food cost.",
    allowed_domains: ["https://massaprima.com", "https://www.massaprima.com"],
    rollback_target: "/api/chef-prima", max_output_tokens: 1024,
  },
  {
    assistant_key: "quenteebom-joaquim", nome: "Chef Joaquim", marca: "Quente e Bom",
    descricao: "Chef da Quente e Bom (Angola). Padaria e pastelaria, venda a profissionais.",
    allowed_domains: ["https://quenteebom.com", "https://www.quenteebom.com"],
    rollback_target: "/api/joaquim", max_output_tokens: 1024,
  },
  {
    assistant_key: "koolnature-chefkool", nome: "Chef Kool", marca: "KoolNature",
    descricao: "Chef de brasa da EKOOLOGY (biocarvão, Penacova). Manual do grelhador.",
    allowed_domains: ["https://koolnature.pt", "https://www.koolnature.pt"],
    rollback_target: "/api/chef-kool", max_output_tokens: 1024,
  },
];

for (const m of marcas) {
  const { error } = await sb.from("ai_assistants").upsert({
    ...m,
    routing_policy_id: pol.id,
    ativo: true,
    permite_system_dinamico: true,   // o system vem do site (base de conhecimento)
    permite_json: false,
    gateway_enabled: true,
    traffic_percentage: 100,
    max_messages: 16,
    max_chars_message: 2000,
    retention_days: 90,
  }, { onConflict: "assistant_key" });
  console.log((error ? "✗ " : "✓ ") + m.assistant_key.padEnd(24) + (error?.message ?? `${m.nome} · ${m.marca}`));
}

const { data } = await sb.from("ai_assistants")
  .select("assistant_key, nome, marca, traffic_percentage, permite_system_dinamico, permite_json")
  .order("marca");
console.log("\ntodos os assistentes registados:");
for (const a of data ?? []) {
  const marcasTxt = [a.permite_system_dinamico && "sys", a.permite_json && "json"].filter(Boolean).join("+") || "—";
  console.log(`  ${String(a.marca).padEnd(16)} ${String(a.nome).padEnd(14)} ${String(a.traffic_percentage).padStart(3)}%  ${marcasTxt}`);
}
