// Diz ao agendamento mensal do MicroSIR que zonas colher.
//
//   node scripts/imo-zonas-mensais.mjs --ver     mostra a lista, não escreve
//   node scripts/imo-zonas-mensais.mjs           escreve no agendamento
//
// PORQUE EXISTE
//
// Até 7 de Setembro de 2026 a colheita mensal varria as 142 zonas da AML.
// Das 140 que traziam dados, 119 nunca tinham sido consultadas por uma
// única avaliação: estávamos a pedir a um serviço alheio, todos os meses,
// o mercado de sítios onde a Terrae não trabalha.
//
// A varredura inteira passou a trimestral. O mês passa a pedir as zonas
// que se usam de facto, e esta lista sai dos dados em vez de ser escrita
// à mão: uma avaliação numa freguesia nova põe-na na lista sozinha, na
// corrida seguinte deste script. É o «vamos vendo se é preciso aumentar»
// a acontecer sem ninguém se lembrar de o fazer.
//
// A LISTA É: as zonas que as avaliações tocaram, os concelhos que lhes
// servem de rede quando a freguesia não tem amostra, e as zonas onde a
// Terrae vendeu de facto.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const ACTOR = "G5IYnCtBFAUDVk4Ve";
const AGENDAMENTO = "microsir-aml-mensal";
/** Uma zona sai da lista quando ninguém lhe toca há mais de isto. */
const MESES_DE_MEMORIA = 12;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const H = { authorization: `Bearer ${env.APIFY_TOKEN}`, "content-type": "application/json" };
const api = (caminho, opcoes) => fetch(`https://api.apify.com/v2${caminho}`, { headers: H, ...opcoes });

const soVer = process.argv.includes("--ver");

async function main() {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - MESES_DE_MEMORIA);

  const { data: geos, error: eG } = await sb.from("imo_geografias").select("id, nome, nivel, pai_id, codigo_ine");
  if (eG) { console.error(eG.message); process.exitCode = 1; return; }
  const porId = Object.fromEntries((geos ?? []).map((g) => [g.id, g]));

  // ---- quem entra na lista
  const porque = new Map();
  const junta = (id, motivo) => {
    if (!id || !porId[id]) return;
    if (porId[id].nivel !== "freguesia" && porId[id].nivel !== "concelho") return;
    if (!porque.has(id)) porque.set(id, new Set());
    porque.get(id).add(motivo);
  };

  const { data: avs } = await sb.from("imo_avaliacoes")
    .select("geografia_id").gte("created_at", desde.toISOString());
  for (const a of avs ?? []) {
    junta(a.geografia_id, "avaliação");
    // O concelho é a rede da escada: quando a freguesia não tem amostra
    // que chegue, é dele que sai o rácio da tipologia. Sem ele fresco, o
    // degrau 2 deixa de existir e a avaliação perde precisão.
    // Só o pai de uma FREGUESIA, que é o concelho. O pai de um concelho
    // é o distrito, e distritos não são zonas que se colham.
    const g = porId[a.geografia_id];
    if (g?.nivel === "freguesia" && g.pai_id) junta(g.pai_id, "rede do concelho");
  }

  const { data: vendas } = await sb.from("imo_transacoes")
    .select("geografia_id").eq("fonte_id", "terrae").gte("data_transacao", desde.toISOString().slice(0, 10));
  for (const v of vendas ?? []) {
    junta(v.geografia_id, "venda da Terrae");
    const g = porId[v.geografia_id];
    if (g?.nivel === "freguesia" && g.pai_id) junta(g.pai_id, "rede do concelho");
  }

  // ---- o código com que o recolhedor as conhece
  //
  // Vem do próprio Dataset (extra.dicofre), que é a fonte que não pode
  // divergir. Só quando falta é que se recorre ao código guardado na
  // hierarquia.
  const linhas = [];
  const semCodigo = [];
  for (const [id, motivos] of porque) {
    const { data: bm } = await sb.from("imo_benchmarks")
      .select("extra").eq("fonte_id", "sir-micro").eq("geografia_id", id)
      .order("periodo_fim", { ascending: false }).limit(1);
    const dicofre = bm?.[0]?.extra?.dicofre || porId[id].codigo_ine || null;
    if (!dicofre) { semCodigo.push(porId[id].nome); continue; }
    linhas.push({ dicofre: String(dicofre), nome: porId[id].nome, nivel: porId[id].nivel, porque: [...motivos].join(", ") });
  }
  linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  const dicofres = [...new Set(linhas.map((l) => l.dicofre))];

  console.log(`${linhas.length} zonas para a colheita mensal:`);
  for (const l of linhas) console.log(`  ${l.dicofre.padEnd(7)} ${l.nome} (${l.nivel}) · ${l.porque}`);
  if (semCodigo.length) {
    console.log(`\n  ${semCodigo.length} sem código de zona, ficam de fora da mensal e vêm na trimestral: ${semCodigo.join(", ")}`);
    console.log("  (é o caso de um concelho que o MicroSIR não cobre e cujos dados vêm do PDF do SIR)");
  }

  // ---- guardas
  //
  // Uma lista vazia no agendamento fazia a corrida rebentar; uma lista
  // gigante seria um engano a chegar ao serviço deles. Em qualquer dos
  // casos vale mais deixar o que lá estava.
  if (dicofres.length === 0) {
    console.error("\nLista vazia. Não mexo no agendamento: fica o que lá estava.");
    process.exitCode = 1;
    return;
  }
  if (dicofres.length > 142) {
    console.error(`\n${dicofres.length} zonas é mais do que a AML tem. Não mexo no agendamento.`);
    process.exitCode = 1;
    return;
  }

  const agendamentos = (await (await api("/schedules?limit=50")).json()).data.items;
  const alvo = agendamentos.find((s) => s.name === AGENDAMENTO);
  if (!alvo) { console.error(`\nNão encontrei o agendamento ${AGENDAMENTO}.`); process.exitCode = 1; return; }
  const detalhe = (await (await api(`/schedules/${alvo.id}`)).json()).data;
  const antes = detalhe.actions?.[0] ? JSON.parse(detalhe.actions[0].runInput.body) : {};
  const anteriores = new Set(antes.zones ?? []);
  const novas = dicofres.filter((d) => !anteriores.has(d));
  const saidas = [...anteriores].filter((d) => !dicofres.includes(d));

  if (novas.length || saidas.length) {
    console.log("");
    for (const d of novas) console.log(`  + ${d} ${linhas.find((l) => l.dicofre === d)?.nome ?? ""}`);
    for (const d of saidas) console.log(`  - ${d} (ninguém lhe tocou nos últimos ${MESES_DE_MEMORIA} meses)`);
  } else if (antes.zones) {
    console.log("\nA lista não mudou.");
  }

  if (soVer) { console.log("\n(--ver: não escrevi nada)"); return; }
  if (!novas.length && !saidas.length && antes.target === "zonas") return;

  const r = await api(`/schedules/${alvo.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: detalhe.name,
      isEnabled: detalhe.isEnabled,
      isExclusive: true,
      cronExpression: detalhe.cronExpression,
      timezone: detalhe.timezone,
      description:
        `As ${dicofres.length} zonas que a Terrae usa de facto, actualizadas por ` +
        "scripts/imo-zonas-mensais.mjs. A varredura das 142 é trimestral.",
      // A acção vai SEM id: com id, a API guarda a que já lá estava.
      actions: [{
        type: "RUN_ACTOR",
        actorId: ACTOR,
        runInput: {
          body: JSON.stringify({ target: "zonas", zones: dicofres, months: antes.months ?? 24, collect: "completo" }),
          contentType: "application/json",
        },
      }],
    }),
  });
  console.log(r.ok ? `\nAgendamento actualizado com ${dicofres.length} zonas.` : `\nfalhou: HTTP ${r.status} ${await r.text()}`);
  if (!r.ok) process.exitCode = 1;
}

await main().catch((e) => { console.error(e?.message ?? String(e)); process.exitCode = 1; });
