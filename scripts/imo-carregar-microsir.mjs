// Leva a colheita do Actor microsir para o imo_benchmarks.
//
//   node scripts/imo-carregar-microsir.mjs                 # última corrida boa
//   node scripts/imo-carregar-microsir.mjs <datasetId>     # uma corrida à escolha
//   node scripts/imo-carregar-microsir.mjs ficheiro.json   # de um ficheiro local
//
// PORQUE É QUE ISTO NÃO LÊ O PDF NEM ESCREVE NÚMEROS À MÃO
//
// O `imo-importar-relatorio-sir.mjs` transcreve valores declarados, e faz
// bem: são meia dúzia de números por trimestre, e uma leitura automática
// de PDF que se engane não grita — deixa as avaliações daquela zona
// silenciosamente erradas durante meses.
//
// Aqui são 142 zonas por mês. À mão não é opção, e não é preciso: os
// números vêm da API, já normalizados e com os avisos da colheita
// agarrados a cada registo. O que se transcrevia é o que se arriscava.
//
// A ARITMÉTICA TODA ESTÁ NO SQL
//
// Este script não decide nada — não converte, não arredonda, não escolhe.
// Vai buscar o JSON e entrega-o ao `imo_sir_micro_carregar()`. Isso é de
// propósito: a regra de como um percentil vira um benchmark tem de estar
// num sítio só, versionada com a base, e não repartida entre uma migração
// e um script que alguém corre do portátil.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ACTOR = "diverting_cheer~microsir";
const arg = process.argv[2];

async function apify(caminho) {
  if (!env.APIFY_TOKEN) {
    throw new Error(
      "Falta APIFY_TOKEN no .env.local. Vai a Apify → Settings → API & Integrations,\n" +
      "cria um Personal API token e acrescenta a linha APIFY_TOKEN=... ao ficheiro.",
    );
  }
  const r = await fetch(`https://api.apify.com/v2/${caminho}`, {
    headers: { authorization: `Bearer ${env.APIFY_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Apify respondeu ${r.status} em /${caminho}`);
  return r.json();
}

async function obterRegistos() {
  // Ficheiro local: útil para recarregar uma colheita guardada sem depender
  // do Apify estar de pé.
  if (arg && existsSync(arg)) {
    console.log(`A ler de ${arg}`);
    return JSON.parse(readFileSync(arg, "utf8"));
  }

  let datasetId = arg;

  if (!datasetId) {
    datasetId = await datasetDaUltimaVarredura();
  }

  const itens = await apify(`datasets/${datasetId}/items?format=json&clean=true`);
  if (!Array.isArray(itens)) throw new Error("O dataset não devolveu um array.");
  console.log(`Dataset ${datasetId}: ${itens.length} registos`);
  return itens;
}

/**
 * A última VARREDURA bem sucedida — não a última corrida bem sucedida.
 *
 * O mesmo Actor corre em dois modos com dois formatos de saída: a
 * varredura da AML (target aml*, um registo por zona, com `geo` e `bbox`)
 * e a fila de códigos postais (target pontos, um registo por CP7, sem
 * geografia). Este script só sabe carregar o primeiro.
 *
 * Durante nove dias foi buscar «a última corrida boa» e apanhou uma fila
 * de três pontos que correu vinte minutos depois da varredura de 23-08.
 * Os três registos tinham €/m², passavam a verificação de «metade com
 * valores», e iam ao carregador como se fossem zonas — que os recusava.
 * O registo diário dizia só «ERRO», e a fila, que corre a seguir no mesmo
 * trabalho, ficou parada com ele.
 *
 * Por isso escolhe-se pelo INPUT da corrida, que é o único sítio onde o
 * modo está escrito, e não pela ordem no tempo.
 */
async function datasetDaUltimaVarredura() {
  const { data } = await apify(`acts/${ACTOR}/runs?status=SUCCEEDED&desc=true&limit=30`);
  const corridas = data?.items ?? [];
  if (!corridas.length) throw new Error("Não encontrei nenhuma corrida bem sucedida do Actor.");

  for (const corrida of corridas) {
    let input = null;
    try {
      input = await apify(`key-value-stores/${corrida.defaultKeyValueStoreId}/records/INPUT`);
    } catch {
      // Sem INPUT legível não se sabe o modo — salta-se, não se adivinha.
      continue;
    }
    const alvo = String(input?.target ?? "aml");
    if (alvo.startsWith("aml")) {
      console.log(`Última varredura boa: ${corrida.id} (${corrida.finishedAt}) · target=${alvo}`);
      return corrida.defaultDatasetId;
    }
  }
  throw new Error(
    `Nenhuma das últimas ${corridas.length} corridas bem sucedidas é uma varredura da AML (target aml*). ` +
    "Só há corridas de pontos/zona única — não há nada para carregar.",
  );
}

const registos = await obterRegistos();

if (registos.length === 0) {
  console.error("Dataset vazio. Não carrego nada.");
  process.exit(1);
}

// O FORMATO tem de ser o de uma varredura: registos de zona, com `geo` e
// `bbox`. Um dataset da fila de pontos (registos por CP7, sem geografia)
// também tem €/m² e passava a verificação de valores abaixo — foi assim
// que o carregador andou nove dias a tentar carregar três códigos postais
// como se fossem 142 zonas. Recusa-se aqui, com a razão escrita.
const comGeografia = registos.filter((r) => r?.geo && r?.bbox).length;
if (comGeografia < registos.length * 0.9) {
  console.error(
    `Só ${comGeografia} de ${registos.length} registos têm geografia e bbox. ` +
    "Isto não é uma varredura da AML (parece uma fila de pontos) — não carrego.",
  );
  process.exit(1);
}

// Uma verificação antes de escrever: se a colheita vier maioritariamente
// sem valores, é sinal de que alguma coisa correu mal do outro lado, e
// vale mais parar do que gravar um retrato pela metade por cima de um bom.
const comValores = registos.filter((r) => r?.price_m2?.average != null).length;
console.log(`Com valores: ${comValores} · sem valores: ${registos.length - comValores}`);

if (comValores < registos.length * 0.5) {
  console.error(
    `Só ${comValores} de ${registos.length} registos têm valores. ` +
    "Isto não parece uma colheita boa — não carrego. Veja a corrida no Apify.",
  );
  process.exit(1);
}

const { data, error } = await sb.rpc("imo_sir_micro_carregar", { p_payload: registos });

if (error) {
  console.error("Falhou:", error.message);
  process.exit(1);
}

const r = Array.isArray(data) ? data[0] : data;
console.log("");
console.log(`gravadas:       ${r.gravadas}`);
console.log(`sem valores:    ${r.sem_valores}`);
console.log(`sem geografia:  ${r.sem_geografia}`);

// OS AVISOS APARECEM SEMPRE.
//
// Estavam presos dentro do `if (sem_geografia > 0)`, e isso escondia tudo
// o resto: numa carga de 142 zonas o carregador recusou indicadores
// implausíveis e ninguém ficou a saber, porque nenhuma zona tinha
// falhado a geografia. Um aviso que só se mostra quando OUTRA coisa
// corre mal não é um aviso.
for (const a of r.avisos ?? []) console.log(`  aviso: ${a}`);

// Uma zona sem geografia é uma zona perdida em silêncio — o benchmark não
// entra. A saída é diferente de zero para o agendador saber que houve
// trabalho por rever.
if (r.sem_geografia > 0) {
  console.error(`\n${r.sem_geografia} zonas não encontraram geografia e não entraram.`);
  process.exit(2);
}

console.log("\nCarregado.");
