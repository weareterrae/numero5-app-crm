// Fecha os buracos na vigilância: Chef Kool, Tutor e Coach.
//
// Dois casos diferentes, de propósito:
//
// 1. Chef Kool — fala-se ao endpoint REAL do site (koolnature.pt/api/chef-kool),
//    como um visitante. É o teste bom: cobre a função, o gateway e o modelo.
//    A frase de contingência ("Estou a afiar as brasas") devolve HTTP 200 e
//    parece uma resposta — por isso entra em `nao_pode_conter`.
//
// 2. Tutor e Coach — a Academia exige sessão iniciada (Netlify Identity), e um
//    vigia não tem credenciais. Fala-se então ao GATEWAY com a chave do
//    assistente, que é onde as avarias realmente aconteceram: quando o modelo
//    cai, a Academia devolve o texto de manutenção com HTTP 200 e o painel
//    fica verde.
//
//    O que isto NÃO cobre: a camada de autenticação e o embrulho da função.
//    Fica registado aqui para não se confundir cobertura parcial com total —
//    foi exatamente essa confusão (o `estado-motor` a passar por teste do
//    Joaquim) que deixou os dois assistentes mais críticos sem vigilância.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const GATEWAY = `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat`;

// Um vigia que fala ao gateway: a resposta vem em SSE, não em JSON com campo.
// O `campo_resposta` fica a null — o vigia lê o corpo inteiro, e as linhas
// `data:` contêm sempre o texto gerado, logo o teste de comprimento serve.
const viaGateway = (chave, origem, pergunta) => ({
  url: GATEWAY,
  metodo: "POST",
  cabecalhos: { origin: origem },
  corpo: { assistant_key: chave, messages: [{ role: "user", content: pergunta }] },
  campo_resposta: null,
  min_caracteres: 200,   // o SSE traz sobrecarga de protocolo; 200 é o piso real
  nao_pode_conter: ["\"type\":\"error\""],
  timeout_ms: 60000,
});

const vigias = [
  {
    chave: "koolnature-chefkool", nome: "Chef Kool", marca: "KoolNature",
    url: "https://koolnature.pt/api/chef-kool",
    metodo: "POST",
    corpo: { historico: [{ role: "user", content: "Quanto tempo dura o biocarvão a grelhar?" }] },
    campo_resposta: "resposta",
    min_caracteres: 80,
    nao_pode_conter: ["afiar as brasas", "em manutenção", "indisponível"],
    timeout_ms: 45000,
    critico: true, ativo: true,
  },
  {
    chave: "academia-tutor", nome: "Tutor (Joaquim)", marca: "Academia Terrae",
    ...viaGateway("academia-tutor", "https://academia.terrae.pt", "O que é a angariação em exclusivo?"),
    critico: true, ativo: true,
  },
  {
    chave: "academia-coach", nome: "Coach", marca: "Academia Terrae",
    ...viaGateway("academia-coach", "https://academia.terrae.pt", "Dá-me uma dica para a primeira visita ao imóvel."),
    critico: true, ativo: true,
  },
];

for (const v of vigias) {
  const { error } = await sb.from("ai_vigias").upsert(v, { onConflict: "chave" });
  console.log((error ? "✗ " : "✓ ") + v.chave.padEnd(22) + (error?.message ?? `${v.nome} · ${v.marca}`));
}

const { data } = await sb.from("ai_vigias").select("chave, marca, ativo").order("marca");
console.log(`\n${data?.length ?? 0} vigias ativos — um por assistente registado.`);
