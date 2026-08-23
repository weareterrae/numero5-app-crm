// Carrega os códigos postais de Portugal para `imo_codigos_postais`.
//
//   node scripts/imo-carregar-codigos-postais.mjs
//   node scripts/imo-carregar-codigos-postais.mjs C:/caminho/cp.csv
//
// PORQUE ISTO EXISTE
//
// Para o formulário deixar de perguntar o concelho. O código postal é uma
// chave exacta; a morada escrita à mão não é. Ver a migração 0114.
//
// A FONTE
//
// Ficheiro aberto dos CTT, espelhado pelo projecto Central de Dados. São
// 326 mil linhas — uma por artéria — que aqui se juntam em ~197 mil
// códigos postais, cada um com a sua lista de ruas.
//
// CORRE-SE UMA VEZ, E DEPOIS DE VEZ EM QUANDO. Os CTT publicam
// trimestralmente. Repetir é seguro: é tudo upsert pela chave cp7, e a
// coluna `freguesia` NÃO é tocada — o que se aprendeu sobre Lisboa não se
// perde numa reimportação.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const BASE = "https://raw.githubusercontent.com/centraldedados/codigos_postais/master/data";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/* -------------------------------------------------------------------
   Um leitor de CSV que respeita aspas. O ficheiro dos CTT tem vírgulas
   dentro de nomes de artérias («Rua Dr. António, o Velho») e parti-lo à
   vírgula seca desalinha as colunas a partir daí — em silêncio, que é o
   pior modo de falhar.
   ------------------------------------------------------------------- */
function linhaCSV(linha) {
  const campos = [];
  let campo = "", aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"') { if (linha[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { campos.push(campo); campo = ""; }
    else campo += c;
  }
  campos.push(campo);
  return campos;
}

async function csv(nome, local) {
  const caminho = local || new URL(`../.cache-${nome}.csv`, import.meta.url);
  let texto;
  if (local && existsSync(local)) texto = readFileSync(local, "utf8");
  else if (existsSync(caminho)) texto = readFileSync(caminho, "utf8");
  else {
    process.stdout.write(`a descarregar ${nome}… `);
    const r = await fetch(`${BASE}/${nome}.csv`);
    if (!r.ok) throw new Error(`${nome}: HTTP ${r.status}`);
    texto = await r.text();
    writeFileSync(caminho, texto);
    console.log(`${(texto.length / 1048576).toFixed(1)} MB`);
  }
  const linhas = texto.split(/\r?\n/).filter(Boolean);
  const cab = linhaCSV(linhas[0]);
  return linhas.slice(1).map((l) => {
    const c = linhaCSV(l);
    return Object.fromEntries(cab.map((k, i) => [k, (c[i] || "").trim()]));
  });
}

/* Capitaliza como se escreve um nome próprio, não como o Postgres o faz.
   «RUA DE SANTO ANTÓNIO» → «Rua de Santo António»: as preposições ficam
   em minúscula, e um «Dr.» continua «Dr.». */
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "no", "na"]);
function nomeProprio(s) {
  if (!s) return s;
  return s.toLowerCase().split(/\s+/).map((p, i) => {
    if (i > 0 && MINUSCULAS.has(p)) return p;
    // hífenes contam como fronteira de palavra: «Linda-a-Velha»
    return p.split("-").map((q, j) =>
      j > 0 && MINUSCULAS.has(q) ? q : q.charAt(0).toUpperCase() + q.slice(1)
    ).join("-");
  }).join(" ");
}

// ---- 1. os dicionários de geografia
const distritos = new Map((await csv("distritos")).map((d) => [d.cod_distrito, d.nome_distrito]));
const concelhos = new Map((await csv("concelhos")).map((c) => [`${c.cod_distrito}${c.cod_concelho}`, c.nome_concelho]));
console.log(`geografia · ${distritos.size} distritos · ${concelhos.size} concelhos`);

// ---- 2. o ficheiro grande, agregado por CP7
const linhas = await csv("codigos_postais", process.argv[2]);
console.log(`ficheiro   · ${linhas.length.toLocaleString("pt-PT")} artérias`);

const porCP = new Map();
let semGeografia = 0;
for (const l of linhas) {
  if (!l.num_cod_postal || !l.ext_cod_postal) continue;
  const cp7 = `${l.num_cod_postal}-${l.ext_cod_postal}`;
  const concelho = concelhos.get(`${l.cod_distrito}${l.cod_concelho}`);
  const distrito = distritos.get(l.cod_distrito);
  // Sem concelho não entra. Uma linha com geografia a meio é pior do que
  // linha nenhuma: o formulário preencheria um campo e deixaria o outro
  // vazio, e ninguém perceberia porquê.
  if (!concelho || !distrito) { semGeografia++; continue; }

  let r = porCP.get(cp7);
  if (!r) {
    r = {
      cp7,
      // Escrita como se escreve, não como os CTT a gravam. A camada de
      // mercado foi verificada com «Cruz Quebrada-Dafundo» e «Linda a
      // Velha»; mandar-lhe «CRUZ QUEBRADA-DAFUNDO» é pedir para falhar
      // por causa de maiúsculas.
      designacao: nomeProprio(l.desig_postal || l.nome_localidade || ""),
      localidade: nomeProprio(l.nome_localidade || l.desig_postal || ""),
      concelho, distrito,
      ruas: new Set(),
    };
    porCP.set(cp7, r);
  }
  // A artéria vem em pedaços: tipo, preposição, título, preposição, nome.
  // «Rua» + «de» + «São» + «» + «Bento» → «Rua de São Bento».
  const rua = [l.tipo_arteria, l.prep1, l.titulo_arteria, l.prep2, l.nome_arteria]
    .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (rua) r.ruas.add(nomeProprio(rua));
}
console.log(`agregado   · ${porCP.size.toLocaleString("pt-PT")} códigos postais` +
  (semGeografia ? ` · ${semGeografia} linhas sem concelho, ignoradas` : ""));

// ---- 3. para a base, aos lotes
const registos = [...porCP.values()].map((r) => ({
  cp7: r.cp7, designacao: r.designacao, localidade: r.localidade,
  concelho: r.concelho, distrito: r.distrito,
  ruas: [...r.ruas].sort((a, b) => a.localeCompare(b, "pt")),
}));

const LOTE = 2000;
let feitos = 0;
for (let i = 0; i < registos.length; i += LOTE) {
  const lote = registos.slice(i, i + LOTE);
  // `freguesia` fica de fora do update: quem a souber já a escreveu, e uma
  // reimportação dos CTT não tem nada de novo a dizer sobre ela.
  const { error } = await sb.from("imo_codigos_postais").upsert(lote, { onConflict: "cp7" });
  if (error) { console.error(`\nlote ${i}: ${error.message}`); process.exit(1); }
  feitos += lote.length;
  process.stdout.write(`\ra gravar   · ${feitos.toLocaleString("pt-PT")} / ${registos.length.toLocaleString("pt-PT")}`);
}
console.log("\n");

// ---- 4. a prova
const amostra = ["2790-008", "1495-718", "2795-229", "2950-701", "1050-121", "8000-100"];
const { data } = await sb.from("imo_codigos_postais")
  .select("cp7,concelho,designacao,localidade,ruas").in("cp7", amostra);
for (const cp of amostra) {
  const r = (data || []).find((x) => x.cp7 === cp);
  console.log(r
    ? `${r.cp7}  ${r.concelho.padEnd(14)} ${r.localidade.padEnd(18)} ${r.ruas.length} rua(s)  ex.: ${r.ruas[0] || "—"}`
    : `${cp}  não encontrado`);
}
