// Esvazia a fila de códigos postais à espera de área de mercado.
//
//   node scripts/imo-cp-fila.mjs                    # até 40 pontos
//   node scripts/imo-cp-fila.mjs 15                 # até 15
//   node scripts/imo-cp-fila.mjs 15 --so-coordenadas  # preenche coordenadas e lê a fila, não corre o Actor
//
// O CICLO
//
//   avaliação chega → CP7 sem área → fica «pendente», serve-se a freguesia
//   este script     → dá coordenadas ao CP7 → lê a fila → UMA corrida do Actor → grava as áreas
//   avaliação seguinte no mesmo CP7 → já encontra a área fina
//
// PORQUE EM LOTE
//
// Cada corrida do Actor paga um login de ~35 s ao MicroSIR. Uma corrida
// por avaliação seriam cinquenta logins num dia com cinquenta avaliações,
// caro para nós e indelicado para eles. Vinte pontos numa corrida pagam
// o login uma vez.
//
// NÃO CORRE SE A FILA ESTIVER VAZIA. Um login gasto para não fazer nada
// é um login a mais na conta de outra pessoa.
//
// AS COORDENADAS SÃO DADAS AQUI, NÃO PELO SITE
//
// O site só sabe o código postal. A avaliação regista-o «pendente» sem
// lat/lng, e a fila (imo_cp_fila) só devolve linhas COM coordenadas, que
// é o que o Actor precisa para desenhar a área. Entre 23-08 e 02-09
// ficaram 22 códigos postais parados por isto: a fila dizia «vazia» com
// 22 pendentes, e ninguém deu por nada. Agora, antes de ler a fila,
// preenchem-se as coordenadas a partir da cache local do GISCO
// (scripts/imo-cp7-coordenadas.mjs constrói-a). Um CP7 que não esteja no
// GISCO fica pendente com o motivo escrito em `ultimo_erro`.
//
// SEM process.exit(). No Windows, sair à força logo a seguir a um fetch
// rebenta com uma asserção do libuv (async.c) e o código de saída passa a
// ser -1073740791 em vez de 0, o que fazia o registo diário marcar
// «AVISO» num dia em que a fila estava simplesmente vazia. Define-se
// process.exitCode e deixa-se o processo acabar sozinho.
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ACTOR = "G5IYnCtBFAUDVk4Ve";
const CACHE = new URL("../.cache-cp7-coordenadas.csv", import.meta.url);
const argumentos = process.argv.slice(2);
const limite = Math.max(1, Math.min(Number(argumentos.find((a) => /^\d+$/.test(a))) || 40, 60));
const soCoordenadas = argumentos.includes("--so-coordenadas");

function falhar(mensagem) {
  console.error(mensagem);
  process.exitCode = 1;
}

// ---- 0. coordenadas para quem não as tem
//
// Pede-se a lista dos pendentes (ou em erro, ainda com tentativas) sem
// lat, e escreve-se só nesses. O `.is("lat", null)` no update é a rede:
// se entretanto alguém já lá pôs coordenadas melhores, não se pisa.
async function preencherCoordenadas() {
  const { data: sem, error } = await sb.from("imo_cp_areas")
    .select("cp7").is("lat", null).in("estado", ["pendente", "erro"]).lt("tentativas", 3).limit(200);
  if (error) throw new Error(`não consegui ler os pendentes sem coordenadas: ${error.message}`);
  if (!sem?.length) return null;

  if (!existsSync(CACHE)) {
    console.error(`${sem.length} códigos postais à espera de coordenadas e não há cache. Corre: node scripts/imo-cp7-coordenadas.mjs`);
    return { pedidos: sem.length, preenchidos: 0, semFonte: [] };
  }
  const mapa = new Map();
  for (const linha of readFileSync(CACHE, "utf8").split(/\r?\n/)) {
    const [cp7, lat, lng] = linha.split(",");
    if (/^\d{4}-\d{3}$/.test(cp7 ?? "")) mapa.set(cp7, [Number(lat), Number(lng)]);
  }

  let preenchidos = 0;
  const semFonte = [];
  for (const { cp7 } of sem) {
    const c = mapa.get(cp7);
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) { semFonte.push(cp7); continue; }
    const { error: eU } = await sb.from("imo_cp_areas")
      .update({ lat: c[0], lng: c[1], coordenadas_em: new Date().toISOString() })
      .eq("cp7", cp7).is("lat", null);
    if (eU) { console.error(`  ${cp7}: não gravei as coordenadas: ${eU.message}`); continue; }
    preenchidos++;
  }
  // Sem fonte, conta como tentativa falhada: ao fim de três, sai do lote
  // (imo_cp_fila e esta função só olham para tentativas < 3). Deixá-lo
  // «pendente» era ocupar um lugar na fila para sempre.
  for (const cp7 of semFonte) {
    const { data: linha } = await sb.from("imo_cp_areas").select("tentativas").eq("cp7", cp7).maybeSingle();
    await sb.from("imo_cp_areas")
      .update({ estado: "erro", tentativas: (linha?.tentativas ?? 0) + 1, ultimo_erro: "sem coordenadas no GISCO 2024" })
      .eq("cp7", cp7).is("lat", null);
  }
  return { pedidos: sem.length, preenchidos, semFonte };
}

async function main() {
  const c = await preencherCoordenadas();
  if (c) {
    console.log(`coordenadas: ${c.preenchidos} de ${c.pedidos} preenchidas` +
      (c.semFonte.length ? ` · sem fonte: ${c.semFonte.join(", ")}` : ""));
  }

  // ---- 1. a fila
  const { data: fila, error: eF } = await sb.rpc("imo_cp_fila", { p_limite: limite });
  if (eF) return falhar(`não consegui ler a fila: ${eF.message}`);

  if (!fila?.length) { console.log("Fila vazia. Não corro nada."); return; }
  console.log(`${fila.length} códigos postais na fila`);
  if (soCoordenadas) { console.log("(--so-coordenadas: não corro o Actor)"); return; }

  if (!env.APIFY_TOKEN) return falhar("Falta APIFY_TOKEN no .env.local.");
  const H = { authorization: `Bearer ${env.APIFY_TOKEN}`, "content-type": "application/json" };

  // ---- 2. uma corrida, síncrona
  //
  // `run-sync-get-dataset-items` devolve os itens direto: sem polling, sem
  // guardar um runId para consultar depois. A corrida de sessenta pontos
  // leva uns minutos e o timeout do Actor está em 3600 s.
  const r = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=1800`,
    {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        target: "pontos",
        months: 24,
        minSample: 30,
        points: fila.map((f) => ({ cp7: f.cp7, lat: Number(f.lat), lng: Number(f.lng) })),
      }),
    },
  );

  if (!r.ok) {
    const txt = (await r.text()).slice(0, 300);
    // Conta a tentativa mesmo quando falha: sem isso, um ponto que faz a
    // corrida rebentar volta à fila para sempre e bloqueia os outros.
    await sb.from("imo_cp_areas")
      .update({ estado: "erro", tentativas: 1, ultimo_erro: `corrida HTTP ${r.status}` })
      .in("cp7", fila.map((f) => f.cp7)).eq("estado", "pendente");
    return falhar(`A corrida falhou: HTTP ${r.status} ${txt}`);
  }

  const itens = await r.json();
  if (!Array.isArray(itens)) return falhar("A corrida não devolveu uma lista.");
  console.log(`${itens.length} resultados`);

  // ---- 3. gravar
  const { data, error } = await sb.rpc("imo_cp_area_gravar", { p_payload: itens });
  if (error) return falhar(`não consegui gravar: ${error.message}`);

  const g = Array.isArray(data) ? data[0] : data;
  console.log(`\ncom área: ${g.gravadas} · sem área: ${g.sem_area} · erros: ${g.erros}`);

  for (const i of itens) {
    const e = i.escolhido;
    console.log(
      `  ${i.cp7}  ${e ? `${String(e.raio_m).padStart(4)} m · n=${String(e.amostra).padStart(4)} · ${Math.round(i.price_m2?.average ?? 0)} €/m²` : "sem área"}`,
    );
  }

  // Um ponto que ficou na fila depois de ser processado é um ponto que o
  // gravar não reconheceu. Vale mais gritar do que deixar a fila a crescer.
  const devolvidos = itens.filter((i) => !i.cp7).length;
  if (devolvidos) console.error(`\n${devolvidos} resultados vieram sem cp7 e não puderam ser gravados.`);
}

await main().catch((e) => falhar(e?.message ?? String(e)));
