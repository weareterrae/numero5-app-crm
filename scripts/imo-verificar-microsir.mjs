// Prova que os benchmarks do MicroSIR entraram E que servem para alguma coisa.
//
//   node scripts/imo-verificar-microsir.mjs
//
// «Gravou 733 linhas» não é a mesma coisa que «funciona». Uma tabela cheia
// com uma consulta que não a alcança é trabalho perdido que parece feito.
//
// A primeira versão deste script testava o `imo_benchmark_oferta()`, e
// ficou obsoleta no dia seguinte: confirmou-se que o MicroSIR publica
// preços de TRANSAÇÃO e a fonte mudou para escalão 1 (migração 0103). O
// script continuou a passar «SEM BENCHMARK» em tudo — não porque algo
// estivesse partido, mas porque estava a bater à porta errada.
//
// Fica a lição no ficheiro: um teste que não acompanha a mudança do
// sistema deixa de ser um teste e passa a ser ruído tranquilizador ao
// contrário.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { count: total } = await sb.from("imo_benchmarks")
  .select("*", { count: "exact", head: true }).eq("fonte_id", "sir-micro");
const { count: gerais } = await sb.from("imo_benchmarks")
  .select("*", { count: "exact", head: true }).eq("fonte_id", "sir-micro").eq("tipologia", "");
console.log(`sir-micro: ${total} linhas · ${gerais} gerais · ${total - gerais} por tipologia\n`);

// As perguntas que interessam, e o que cada uma prova.
const CASOS = [
  ["União das freguesias de Carnaxide e Queijas", "Oeiras", "Apartamento", "T3",
    "zona com dados de sobra — devia usar a linha do T3"],
  ["Fanhões", "Loures", "Apartamento", "T3",
    "22 observações — a fina; ver de onde vem"],
  ["Costa da Caparica", "Almada", "Apartamento", "T2",
    "cobertura 0,14 — o retângulo é mau, e tem de se ver"],
  ["Avenidas Novas", "Lisboa", "Apartamento", "T2",
    "a mais rica em dados"],
  ["União das freguesias de Cascais e Estoril", "Cascais", "Apartamento", "T2",
    "freguesia que estava partida em dois nós até 23-08"],
];

let falhas = 0;
for (const [zona, concelho, tipo, tipologia, porque] of CASOS) {
  const { data: geo, error: e1 } = await sb.rpc("imo_geo_por_nome",
    { p_zona: zona, p_concelho: concelho });
  if (e1) { console.log(`${zona}: erro na geografia — ${e1.message}\n`); falhas++; continue; }

  const { data, error } = await sb.rpc("imo_benchmark",
    { p_geografia: geo, p_tipo: tipo, p_tipologia: tipologia });
  if (error) { console.log(`${zona}: erro — ${error.message}\n`); falhas++; continue; }

  const b = Array.isArray(data) ? data[0] : data;
  console.log(`${concelho} · ${zona.slice(0, 40)} · ${tipologia}   (${porque})`);
  if (!b) { console.log("  SEM BENCHMARK\n"); falhas++; continue; }
  console.log(`  ${b.fonte_id} · ${b.nivel} · ${Math.round(b.eur_m2)} €/m² (${b.medida}) · n=${b.n_transacoes}`);
  console.log(`  natureza=${b.natureza} · área=${b.area_base} · gap=${b.desconto} · ${b.periodo}\n`);

  // A NATUREZA é o campo de que tudo depende. Sem ela o ancoraSIR() trata
  // o valor como preço pedido e aplica o gap — 21-27% a menos, sem erro.
  if (b.natureza !== "transacao" && b.natureza !== "oferta") {
    console.log(`  ✗ natureza em falta ou desconhecida: ${b.natureza}`);
    falhas++;
  }
}

// Nenhuma freguesia deve estar duplicada: os dados da mesma zona partidos
// em dois nós dão meia avaliação a quem calhar o nó errado.
const { data: semCodigo } = await sb.from("imo_geografias")
  .select("nome").eq("nivel", "freguesia").is("codigo_ine", null);
if (semCodigo?.length) {
  console.log(`⚠ ${semCodigo.length} freguesia(s) sem DICOFRE — possíveis duplicados:`);
  for (const g of semCodigo) console.log(`    ${g.nome}`);
  console.log("  Ver scripts/imo-juntar-freguesias-duplicadas.mts");
} else {
  console.log("Freguesias sem DICOFRE: nenhuma.");
}

process.exit(falhas ? 1 : 0);
