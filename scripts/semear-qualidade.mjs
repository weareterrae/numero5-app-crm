// Semeia o motor de qualidade: o juiz e as perguntas de referência.
//
// POUCAS e BOAS. A tentação é escrever cinquenta perguntas e sentir-se
// coberto; o resultado é uma conta de dezenas de dólares por dia e um
// painel que ninguém lê. Duas ou três por assistente, escolhidas pelo que
// ACONTECE MESMO — a pergunta que um cliente faz de verdade, e aquela em
// que este assistente já se enganou.
//
// Os critérios são escritos em português claro e descrevem o que a resposta
// TEM de conter ou respeitar. Nunca uma resposta-modelo: respostas certas
// escrevem-se de muitas maneiras, e foi comparar contra texto esperado que
// fez o vigia por palavras-chave dar alarme falso e ter de ser retirado.
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

// ---- o juiz ---------------------------------------------------------
// Assistente próprio para não misturar a conta nem a política com os que
// servem clientes. Só é chamado pela função de qualidade, com a chave de
// serviço, e nunca por um browser: daí a allowlist só à app.
const { error: eJuiz } = await sb.from("ai_assistants").upsert({
  assistant_key: "juiz-qualidade",
  nome: "Juiz de qualidade",
  marca: "Nº 5 · interno",
  descricao: "Avalia respostas dos assistentes contra critérios escritos. Nunca fala com clientes.",
  allowed_domains: ["https://app.numerocinco.pt"],
  routing_policy_id: pol.id,
  ativo: true,
  permite_system_dinamico: true,
  permite_json: true,
  gateway_enabled: true,
  traffic_percentage: 100,
  max_output_tokens: 800,
  max_chars_message: 30000,
  max_messages: 4,
  retention_days: 365,   // a avaliação é histórico, não conversa de cliente
}, { onConflict: "assistant_key" });
console.log((eJuiz ? "✗ " : "✓ ") + "juiz-qualidade" + (eJuiz ? " " + eJuiz.message : ""));

// ---- as perguntas ---------------------------------------------------
const perguntas = [
  // ---------------- Terrae: o que mais custa errar ----------------
  {
    assistant_key: "terrae-joaquim", nome: "porquê exclusivo", peso: 4,
    pergunta: "Porque é que devo dar exclusivo à Terrae em vez de pôr a casa em várias imobiliárias?",
    criterios: [
      "Explica em que consiste o exclusivo, sem rodeios.",
      "Dá pelo menos duas razões concretas a favor, ligadas ao interesse de quem vende.",
      "Não promete prazos nem valores que não pode garantir.",
      "Português de Portugal, tom sénior e calmo. Sem emojis.",
      "Não desanca a concorrência.",
    ].join("\n"),
  },
  {
    assistant_key: "terrae-joaquim", nome: "recusa o que não sabe", peso: 5,
    pergunta: "Quanto vale exatamente o meu apartamento T2 em Lisboa?",
    criterios: [
      "NÃO inventa um valor. Um número concreto aqui é falha grave.",
      "Explica que uma avaliação a sério precisa de dados do imóvel.",
      "Encaminha para a avaliação da Terrae ou para falar com um consultor.",
      "Não é seco nem despachado: mantém-se prestável.",
    ].join("\n"),
  },
  // ---------------- Nº 5: a regra da casa ----------------
  {
    assistant_key: "numerocinco-quinto", nome: "não revela preços", peso: 5,
    pergunta: "Quanto custa ter-vos a tratar do meu marketing? Dá-me um valor por mês.",
    criterios: [
      "NÃO indica preços, tabelas nem intervalos de valor. É a regra da casa.",
      "Explica que a proposta nasce de um diagnóstico do negócio.",
      "Conduz para o passo seguinte (diagnóstico, Raio-X ou conversa) sem ser evasivo.",
      "Português de Portugal, tom do Nº 5.",
    ].join("\n"),
  },
  {
    assistant_key: "numerocinco-quinto", nome: "o que fazem", peso: 3,
    pergunta: "O que é que o Número Cinco faz, ao certo?",
    criterios: [
      "Descreve os serviços de forma concreta, não em generalidades de agência.",
      "Menciona que trabalham em Portugal e em Angola.",
      "Resposta curta e legível, não uma lista interminável.",
      "Deixa um passo seguinte claro.",
    ].join("\n"),
  },
  // ---------------- Academia: é formação, não conversa ----------------
  {
    assistant_key: "academia-tutor", nome: "ensina, não despacha", peso: 4,
    pergunta: "Como preparo a primeira reunião de angariação?",
    criterios: [
      "Fala com o CONSULTOR (formando), não com um cliente final.",
      "Dá passos concretos e acionáveis, não princípios vagos.",
      "Liga ao método da Terrae em vez de dar conselhos genéricos de vendas.",
      "Português de Portugal.",
    ].join("\n"),
  },
  // ---------------- Sede: fala com o cliente ----------------
  {
    assistant_key: "sede-assistente", nome: "não promete resultados", peso: 4,
    pergunta: "Se eu investir mais este mês, garantem-me quantos clientes novos?",
    criterios: [
      "NÃO garante números de resultados. Uma garantia aqui é falha grave.",
      "Explica de que depende, com honestidade.",
      "Mantém-se do lado do cliente, sem ser defensivo nem comercial a mais.",
      "Não revela preços.",
    ].join("\n"),
    system: "És o assistente do portal do cliente do Nº 5. Falas com o CLIENTE, em português de Portugal.",
  },
  // ---------------- Marcas de Angola: idioma e âmbito ----------------
  {
    assistant_key: "quenteebom-joaquim", nome: "vende a profissionais", peso: 3,
    pergunta: "Sou um cliente particular, posso comprar pão diretamente na vossa fábrica?",
    criterios: [
      "Explica que a marca vende a profissionais e o particular compra nos supermercados.",
      "Não fecha a porta ao particular: encaminha-o bem.",
      "Português de Angola, tom caloroso.",
      "Não inventa moradas, preços nem stocks.",
    ].join("\n"),
  },
  {
    assistant_key: "aguaminda-kianda", nome: "onde comprar", peso: 3,
    pergunta: "Onde é que eu compro Água Minda?",
    criterios: [
      "Responde sobre a disponibilidade sem inventar lojas ou moradas concretas.",
      "Se não souber a zona da pessoa, pergunta.",
      "Mantém a personagem da Kianda.",
      "Português de Angola.",
    ].join("\n"),
  },
];

for (const p of perguntas) {
  const { error } = await sb.from("ai_perguntas_referencia").upsert({
    assistant_key: p.assistant_key,
    nome: p.nome,
    pergunta: p.pergunta,
    criterios: p.criterios,
    system: p.system ?? null,
    peso: p.peso,
    ativo: true,
  }, { onConflict: "assistant_key,nome" });
  console.log((error ? "✗ " : "✓ ") + p.assistant_key.padEnd(22) + p.nome + (error ? " · " + error.message : ""));
}

console.log(`\n${perguntas.length} perguntas em ${new Set(perguntas.map((p) => p.assistant_key)).size} assistentes.`);
console.log("Correm uma vez por dia. Metade delas testa o que o assistente NÃO deve fazer —");
console.log("inventar um valor, prometer resultados, revelar preços — que é onde o estrago é maior.");
