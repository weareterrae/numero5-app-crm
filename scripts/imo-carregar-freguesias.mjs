// Preenche a freguesia de cada código postal em `imo_codigos_postais`.
//
//   node scripts/imo-carregar-freguesias.mjs
//   node scripts/imo-carregar-freguesias.mjs C:/caminho/PCODE_PT_2024_4326.csv
//
// PORQUE ISTO EXISTE
//
// O ficheiro dos CTT não traz freguesia. Fora das cidades isso não fazia
// falta — a designação postal é o nome da localidade e a camada de
// mercado resolve-a. Dentro das cidades a designação é o nome do
// concelho, e a camada caía ao concelho: 6.144 €/m² de Lisboa inteira
// onde as Avenidas Novas dizem 7.121.
//
// Eram 19.620 de 42.611 códigos postais na área da Terrae — 46%.
//
// A FONTE, E PORQUE ESTA
//
// Eurostat GISCO, «Postal codes 2024». É a base de códigos postais da
// Comissão Europeia, e para Portugal traz 198.393 CP7 com o LAU_NAME —
// que em Portugal É a freguesia.
//
//   Licença: CC-BY-SA 4.0
//   Atribuição obrigatória: «© European Union - GISCO, 2024,
//   postal code point dataset, Licence CC-BY-SA 4.0»
//
// Foram consideradas duas alternativas e postas de lado:
//
//   · geoapi.pt — a chave é uma SUBSCRIÇÃO PAGA, e mesmo assim limitada
//     a 10.000 pedidos/dia. Sem chave são 5 por dia.
//   · dssg-pt/mp-mapeamento-cp7 — ficheiro certo e gratuito, mas o
//     repositório não declara licença nenhuma e a cadeia dele passa pela
//     Duminio, uma API comercial. Não entra numa casa que separa o INE
//     do SIR precisamente por isto.
//
// O QUE ESTA FONTE NÃO RESOLVE, E NINGUÉM RESOLVE
//
// Um código postal que assenta numa rua que É a fronteira entre duas
// freguesias não tem resposta única. Comparado com o mapeamento da DSSG,
// o GISCO concorda em 91,4% e discorda em 8,6% — quase tudo ruas de
// fronteira em Lisboa e no Porto. Verificadas sete discordâncias contra
// o nome real da rua, o GISCO acertou em cinco, a DSSG em uma, e uma era
// mesmo um empate (Rua Marquês da Fronteira, que faz de fronteira).
//
// Por isso a freguesia entra como SUGESTÃO: o formulário preenche-a e a
// pessoa pode escrever por cima. Quem mora lá sabe melhor do que
// qualquer ficheiro.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const FONTE = "https://gisco-services.ec.europa.eu/distribution/v2/pcode/csv/PCODE_PT_2024_4326.csv";
const ATRIBUICAO = "© European Union - GISCO, 2024, postal code point dataset, Licence CC-BY-SA 4.0";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Aspas respeitadas: os nomes das uniões de freguesias têm vírgulas lá
// dentro («União das freguesias de Algés, Linda-a-Velha e Cruz
// Quebrada-Dafundo») e parti-los à vírgula seca desalinha tudo a partir
// dali, em silêncio.
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

// ---- 1. o ficheiro
const local = process.argv[2] || new URL("../.cache-gisco-pcode.csv", import.meta.url);
let texto;
if (existsSync(local)) texto = readFileSync(local, "utf8");
else {
  process.stdout.write("a descarregar o GISCO (≈127 MB)… ");
  const r = await fetch(FONTE);
  if (!r.ok) { console.error(`HTTP ${r.status}`); process.exit(1); }
  texto = await r.text();
  writeFileSync(local, texto);
  console.log("feito");
}

const linhas = texto.split(/\r?\n/).filter(Boolean);
const cab = linhaCSV(linhas[0]);
const iCP = cab.indexOf("POSTCODE"), iPais = cab.indexOf("CNTR_ID"), iLau = cab.indexOf("LAU_NAME");
if (iCP < 0 || iPais < 0 || iLau < 0) { console.error("o ficheiro mudou de colunas"); process.exit(1); }

const freg = new Map();
for (let i = 1; i < linhas.length; i++) {
  const c = linhaCSV(linhas[i]);
  if (c[iPais] !== "PT") continue;
  const cp = (c[iCP] || "").trim();
  const f = (c[iLau] || "").trim();
  // Uma freguesia igual ao concelho não é uma freguesia — é a mesma
  // resposta grosseira com outro nome, e escrevê-la faria o campo
  // parecer resolvido. Fica nula, que quer dizer «não sabemos».
  if (/^\d{4}-\d{3}$/.test(cp) && f) freg.set(cp, f);
}
console.log(`GISCO      · ${freg.size.toLocaleString("pt-PT")} códigos postais portugueses com freguesia`);

// ---- 2. só os que temos, e só os que ainda não sabem
const nossos = [];
for (let de = 0; ; de += 1000) {
  // `designacao`, `concelho` e `distrito` vêm ao colo porque o upsert
  // grava a linha inteira e elas são NOT NULL. Não se alteram; só têm de
  // ir na bagagem.
  const { data, error } = await sb.from("imo_codigos_postais")
    .select("cp7,designacao,localidade,concelho,distrito,ruas,freguesia").range(de, de + 999);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data.length) break;
  nossos.push(...data);
  process.stdout.write(`\ra ler       · ${nossos.length.toLocaleString("pt-PT")}`);
}
console.log(`\nna base    · ${nossos.length.toLocaleString("pt-PT")} códigos postais`);

const agora = new Date().toISOString();
const mudar = [];
let semFonte = 0, iguaisAoConcelho = 0;
for (const r of nossos) {
  const f = freg.get(r.cp7);
  if (!f) { semFonte++; continue; }
  // Ver acima: freguesia == concelho não acrescenta nada.
  if (f.toLowerCase() === String(r.concelho || "").toLowerCase()) { iguaisAoConcelho++; continue; }
  if (r.freguesia === f) continue;
  mudar.push({ ...r, freguesia: f, freguesia_em: agora });
}
console.log(`a preencher· ${mudar.length.toLocaleString("pt-PT")}` +
  ` · ${semFonte.toLocaleString("pt-PT")} sem correspondência no GISCO` +
  ` · ${iguaisAoConcelho.toLocaleString("pt-PT")} em que a freguesia é o próprio concelho`);

// ---- 3. gravar
const LOTE = 2000;
let feitos = 0;
for (let i = 0; i < mudar.length; i += LOTE) {
  const lote = mudar.slice(i, i + LOTE);
  const { error } = await sb.from("imo_codigos_postais")
    .upsert(lote, { onConflict: "cp7", ignoreDuplicates: false });
  if (error) { console.error(`\nlote ${i}: ${error.message}`); process.exit(1); }
  feitos += lote.length;
  process.stdout.write(`\ra gravar   · ${feitos.toLocaleString("pt-PT")} / ${mudar.length.toLocaleString("pt-PT")}`);
}
console.log(`\n\n${ATRIBUICAO}\n`);

// ---- 4. a prova
const amostra = ["1050-121", "1200-109", "1500-001", "2790-008", "2795-229", "2950-701"];
const { data } = await sb.from("imo_codigos_postais")
  .select("cp7,concelho,freguesia").in("cp7", amostra);
for (const cp of amostra) {
  const r = (data || []).find((x) => x.cp7 === cp);
  console.log(r ? `${r.cp7}  ${r.concelho.padEnd(10)} ${r.freguesia || "— (fica ao concelho)"}` : `${cp}  não está`);
}
