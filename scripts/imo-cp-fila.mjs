// Esvazia a fila de códigos postais à espera de área de mercado.
//
//   node scripts/imo-cp-fila.mjs           # até 40 pontos
//   node scripts/imo-cp-fila.mjs 15        # até 15
//
// O CICLO
//
//   avaliação chega → CP7 sem área → fica «pendente», serve-se a freguesia
//   este script     → lê a fila → UMA corrida do Actor → grava as áreas
//   avaliação seguinte no mesmo CP7 → já encontra a área fina
//
// PORQUE EM LOTE
//
// Cada corrida do Actor paga um login de ~35 s ao MicroSIR. Uma corrida
// por avaliação seriam cinquenta logins num dia com cinquenta avaliações
// — caro para nós e indelicado para eles. Vinte pontos numa corrida
// pagam o login uma vez.
//
// NÃO CORRE SE A FILA ESTIVER VAZIA. Um login gasto para não fazer nada
// é um login a mais na conta de outra pessoa.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ACTOR = "G5IYnCtBFAUDVk4Ve";
const limite = Math.max(1, Math.min(Number(process.argv[2]) || 40, 60));

// ---- 1. a fila
const { data: fila, error: eF } = await sb.rpc("imo_cp_fila", { p_limite: limite });
if (eF) { console.error("não consegui ler a fila:", eF.message); process.exit(1); }

if (!fila?.length) {
  console.log("Fila vazia. Não corro nada.");
  process.exit(0);
}
console.log(`${fila.length} códigos postais na fila`);

if (!env.APIFY_TOKEN) { console.error("Falta APIFY_TOKEN no .env.local."); process.exit(1); }
const H = { authorization: `Bearer ${env.APIFY_TOKEN}`, "content-type": "application/json" };

// ---- 2. uma corrida, sincrona
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
  console.error(`A corrida falhou: HTTP ${r.status} ${txt}`);
  // Conta a tentativa mesmo quando falha: sem isso, um ponto que faz a
  // corrida rebentar volta à fila para sempre e bloqueia os outros.
  await sb.from("imo_cp_areas")
    .update({ estado: "erro", tentativas: 1, ultimo_erro: `corrida HTTP ${r.status}` })
    .in("cp7", fila.map((f) => f.cp7)).eq("estado", "pendente");
  process.exit(1);
}

const itens = await r.json();
if (!Array.isArray(itens)) { console.error("A corrida não devolveu uma lista."); process.exit(1); }
console.log(`${itens.length} resultados`);

// ---- 3. gravar
const { data, error } = await sb.rpc("imo_cp_area_gravar", { p_payload: itens });
if (error) { console.error("não consegui gravar:", error.message); process.exit(1); }

const g = Array.isArray(data) ? data[0] : data;
console.log(`\ncom área: ${g.gravadas} · sem área: ${g.sem_area} · erros: ${g.erros}`);

for (const i of itens) {
  const e = i.escolhido;
  console.log(
    `  ${i.cp7}  ${e ? `${String(e.raio_m).padStart(4)} m · n=${String(e.amostra).padStart(4)} · ${Math.round(i.price_m2?.average ?? 0)} €/m²` : "sem área"}`,
  );
}

// Um ponto que ficou na fila depois de ser processado é um ponto que o
// gravar não reconheceu — vale mais gritar do que deixar a fila a crescer.
const devolvidos = itens.filter((i) => !i.cp7).length;
if (devolvidos) console.error(`\n${devolvidos} resultados vieram sem cp7 e não puderam ser gravados.`);
