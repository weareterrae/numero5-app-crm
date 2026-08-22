// Regista os assistentes da Academia Terrae — onde os consultores da
// Terrae se formam. Entram a 0% de tráfego: nada muda até decidirmos.
//
// Domínio VERIFICADO em produção (academia.terrae.pt → 200;
// academia-terrae.netlify.app → 404). Não repetir o erro do Mestre, em
// que assumi o domínio e o gateway teria recusado tudo.
//
// Marcas especiais, e porquê:
//  · permite_system_dinamico — o Coach constrói o system NA HORA a
//    partir do cenário (personaSystem(sc), evalSystem(sc), hintSystem(sc)).
//    Não é um prompt fixo que caiba no registo.
//  · permite_json — a AVALIAÇÃO do consultor devolve JSON pontuado.
//    Sem isto vinha prosa e o JSON.parse do chamador rebentava.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: pol } = await sb.from("ai_routing_policies").select("id").eq("nome", "default").single();
const DOMINIOS = ["https://academia.terrae.pt"];

const assistentes = [
  {
    assistant_key: "academia-tutor",
    nome: "Tutor",
    marca: "Academia Terrae",
    descricao: "Tutor de formação dos consultores. System vem do currículo, montado pelo chamador.",
    permite_system_dinamico: true,
    permite_json: false,
    max_output_tokens: 1500,     // o tutor responde longo (explica matéria)
    max_messages: 20,
  },
  {
    assistant_key: "academia-coach",
    nome: "Coach",
    marca: "Academia Terrae",
    descricao: "Simulador de negociação: encarna personas, dá dicas e AVALIA o consultor em JSON.",
    permite_system_dinamico: true,
    permite_json: true,          // a avaliação pontuada
    max_output_tokens: 1000,
    max_messages: 30,            // conversa de simulação é longa
  },
];

for (const a of assistentes) {
  const { error } = await sb.from("ai_assistants").upsert({
    ...a,
    allowed_domains: DOMINIOS,
    routing_policy_id: pol.id,
    ativo: true,
    gateway_enabled: false,      // entra desligado
    traffic_percentage: 0,       // nada muda até decidirmos
    rollback_target: "/.netlify/functions/" + a.assistant_key.replace("academia-", ""),
    retention_days: 90,
  }, { onConflict: "assistant_key" });
  console.log((error ? "✗ " : "✓ ") + a.assistant_key.padEnd(18) + (error?.message ?? `${a.nome} · ${a.marca}`));
}

const { data } = await sb.from("ai_assistants")
  .select("assistant_key, nome, allowed_domains, permite_json, permite_system_dinamico, traffic_percentage")
  .order("assistant_key");
console.log("\nassistentes registados:");
for (const x of data ?? []) {
  const marcas = [x.permite_json && "json", x.permite_system_dinamico && "system-dinâmico"].filter(Boolean).join(" + ") || "—";
  console.log(`  ${x.assistant_key.padEnd(22)} ${String(x.nome).padEnd(8)} ${String(x.traffic_percentage).padStart(3)}%  ${marcas}`);
}
