// Leva as coordenadas dos códigos postais (cache do GISCO) para a base.
//
//   node scripts/imo-cp7-coordenadas-carregar.mjs
//
// Lê .cache-cp7-coordenadas.csv (construído por imo-cp7-coordenadas.mjs a
// partir do GeoPackage Eurostat GISCO 2024, CC-BY-SA 4.0) e actualiza
// lat/lng em imo_codigos_postais, em lotes de 2 000, pela RPC
// imo_cp7_coordenadas_carregar (0124). Só toca em CP7 que já existam na
// tabela; não inventa códigos postais.
//
// PORQUE VAI PARA A BASE
//
// A fila do MicroSIR só andava porque este portátil tinha a cache. Com as
// coordenadas na base, imo_cp_area preenche-as ao inserir o pendente e
// consegue servir a área de um CP7 vizinho já colhido a menos de 150 m,
// no momento da avaliação, sem esperar pela corrida do dia seguinte.
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const CACHE = new URL("../.cache-cp7-coordenadas.csv", import.meta.url);

async function main() {
  if (!existsSync(CACHE)) {
    console.error("Não há .cache-cp7-coordenadas.csv. Corre primeiro: node scripts/imo-cp7-coordenadas.mjs");
    process.exitCode = 1; return;
  }
  const linhas = readFileSync(CACHE, "utf8").split(/\r?\n/);
  const todos = [];
  for (const l of linhas) {
    const [cp7, lat, lng] = l.split(",");
    if (/^\d{4}-\d{3}$/.test(cp7 ?? "") && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      todos.push({ cp7, lat: Number(lat), lng: Number(lng) });
    }
  }
  console.log(`${todos.length.toLocaleString("pt-PT")} coordenadas na cache`);

  let actualizados = 0, lotes = 0;
  for (let i = 0; i < todos.length; i += 2000) {
    const lote = todos.slice(i, i + 2000);
    const { data, error } = await sb.rpc("imo_cp7_coordenadas_carregar", { p_payload: lote });
    if (error) { console.error(`lote ${lotes + 1}: ${error.message}`); process.exitCode = 1; return; }
    actualizados += Number(data) || 0; lotes++;
    if (lotes % 20 === 0) process.stdout.write(`  ${lotes} lotes · ${actualizados.toLocaleString("pt-PT")} CP7 actualizados\n`);
  }
  console.log(`\n${actualizados.toLocaleString("pt-PT")} códigos postais com coordenadas na base (${lotes} lotes).`);

  const { count: sem } = await sb.from("imo_codigos_postais").select("cp7", { count: "exact", head: true }).is("lat", null);
  console.log(`sem coordenadas na tabela dos CTT: ${sem} (códigos postais que o GISCO não tem)`);
  console.log("© European Union - GISCO, 2024, postal code point dataset, Licence CC-BY-SA 4.0");
}

await main().catch((e) => { console.error(e?.message ?? String(e)); process.exitCode = 1; });
