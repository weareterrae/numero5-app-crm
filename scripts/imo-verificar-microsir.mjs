// Prova que os benchmarks do MicroSIR entraram E que servem para alguma coisa.
//
//   node scripts/imo-verificar-microsir.mjs
//
// «Gravou 140 linhas» não é a mesma coisa que «funciona». Uma tabela cheia
// com uma consulta que não a alcança é trabalho perdido que parece feito.
// Este script faz as três perguntas que interessam:
//
//   1. A zona com dados devolve os SEUS números?
//   2. A zona SEM dados suficientes sobe para o concelho? — era esta que
//      justificava colher os dois níveis, e é a que se tem de ver a
//      funcionar, não a que se assume.
//   3. A oferta consegue entrar pela porta das transações? Não pode. Se um
//      dia conseguir, o motor passa a tratar preços pedidos como escrituras
//      e sobrevaloriza tudo sem dar um erro.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { count } = await sb.from("imo_benchmarks")
  .select("*", { count: "exact", head: true }).eq("fonte_id", "sir-micro");
console.log(`benchmarks sir-micro na base: ${count}\n`);

const CASOS = [
  ["União das freguesias de Carnaxide e Queijas", "Oeiras", "dados de sobra"],
  ["Fanhões", "Loures", "22 observações — TEM de subir para o concelho"],
  ["Costa da Caparica", "Almada", "cobertura 0,14 — o retângulo é mau"],
  ["Avenidas Novas", "Lisboa", "a mais rica em dados"],
];

for (const [zona, concelho, porque] of CASOS) {
  const { data: geo, error: e1 } = await sb.rpc("imo_geo_por_nome",
    { p_zona: zona, p_concelho: concelho });
  if (e1) { console.log(`${zona}: erro na geografia — ${e1.message}\n`); continue; }

  const { data, error } = await sb.rpc("imo_benchmark_oferta",
    { p_geografia: geo, p_tipo: "", p_tipologia: "", p_min_amostra: 30 });
  if (error) { console.log(`${zona}: erro — ${error.message}\n`); continue; }

  const b = Array.isArray(data) ? data[0] : data;
  console.log(`${concelho} · ${zona}   (${porque})`);
  if (!b) {
    console.log("  SEM BENCHMARK\n");
  } else {
    console.log(`  -> ${b.nivel}: ${b.nome}`);
    console.log(`     ${Math.round(b.eur_m2)} €/m²   P25 ${Math.round(b.eur_m2_p25)} · P75 ${Math.round(b.eur_m2_p75)}`);
    console.log(`     n=${b.n_observacoes} · dispersão ${b.dispersao} · cobertura ${b.cobertura ?? "—"}`);
    console.log(`     ${b.periodo} · ${b.atribuicao}\n`);
  }
}

// A porta das transações tem de continuar fechada à oferta.
const { data: geoC } = await sb.rpc("imo_geo_por_nome",
  { p_zona: "União das freguesias de Carnaxide e Queijas", p_concelho: "Oeiras" });
const { data: trans } = await sb.rpc("imo_benchmark",
  { p_geografia: geoC, p_tipo: "", p_tipologia: "", p_min_transacoes: 8 });
const t = Array.isArray(trans) ? trans[0] : trans;

console.log("imo_benchmark() — só escalão 1 — em Carnaxide:");
console.log(t ? `  ${t.fonte_id} · ${t.nivel} · ${Math.round(t.eur_m2)} €/m² · n=${t.n_transacoes}` : "  nada");
if (t && t.fonte_id === "sir-micro") {
  console.error("  FALHA: oferta a entrar pela porta das transações.");
  process.exit(1);
}
console.log("  ok — a oferta não entra por aqui.");
