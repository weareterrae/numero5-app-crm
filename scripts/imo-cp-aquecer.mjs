// Pré-aquece a área local: põe na fila os códigos postais de uma zona.
//
//   node scripts/imo-cp-aquecer.mjs "Carnaxide e Queijas"          # freguesia (ou parte do nome)
//   node scripts/imo-cp-aquecer.mjs "Carnaxide e Queijas" 300      # no máximo 300
//   node scripts/imo-cp-aquecer.mjs --concelho Oeiras 500
//   node scripts/imo-cp-aquecer.mjs --ver "Avenidas Novas"         # só conta, não enfileira
//
// PORQUE
//
// Em 25 das 30 primeiras avaliações a área a 300 m do código postal ainda
// não existia: a primeira avaliação num CP7 nunca a tem, porque a fila é
// diária. Com a área do vizinho (0124) muitos casos ficam resolvidos, mas
// só se houver vizinhos colhidos. Isto enche a fila com os códigos postais
// das freguesias onde a Terrae trabalha, para a área existir ANTES de
// alguém a pedir. A fila corre duas vezes por dia, 40 de cada vez.
//
// Só entram códigos postais com coordenadas (tabela dos CTT + GISCO) e que
// ainda não estejam em imo_cp_areas. Nada é colhido aqui: a colheita é da
// corrida agendada, um login por corrida, como sempre.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const args = process.argv.slice(2);
const soVer = args.includes("--ver");
const porConcelho = args.includes("--concelho");
const posicionais = args.filter((a) => !a.startsWith("--"));
const nome = posicionais.find((a) => !/^\d+$/.test(a));
const maximo = Number(posicionais.find((a) => /^\d+$/.test(a))) || 400;
// ESPAÇAMENTO. A área do vizinho (0124) serve qualquer CP7 a menos de
// 150 m de um já colhido, por isso não vale a pena colher todos: numa
// cidade os centroides dos códigos postais estão a 30 ou 50 m uns dos
// outros. Escolhem-se os que ficam a mais de 120 m de qualquer outro já
// escolhido ou já existente: cobre-se a mesma zona com 3 a 4 vezes menos
// logins. O resto fica coberto pelo vizinho.
const espacamento = Number((args.find((a) => a.startsWith("--espacamento=")) ?? "").split("=")[1]) || 120;
function distanciaM(a, b) {
  const R = 6371000, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function main() {
  // SUSPENSO A 7 DE SETEMBRO DE 2026.
  //
  // Nesse dia a Confidencial Imobiliário contactou a Terrae por causa de
  // acessos à conta do MicroSIR, e o pré-aquecimento tinha acabado de
  // fazer a colheita saltar de três a vinte e um códigos postais por dia
  // para 120. O âmbito nunca saiu da AML, mas encher a fila enquanto a
  // conversa está aberta é indefensável.
  //
  // A migração 0127 tirou o aquecimento da fila; isto impede que alguém
  // volte a enchê-la sem saber porquê. Para retomar, depois de fechada a
  // conversa: correr com --retomar e repor o default em imo_cp_fila.
  if (!args.includes("--retomar") && !soVer) {
    console.error("O pré-aquecimento está SUSPENSO desde 7 Set 2026 (conversa com a Confidencial Imobiliário).");
    console.error("As avaliações reais continuam a ser servidas normalmente; só o pedido por antecipação está parado.");
    console.error("Para ver o que aconteceria, sem enfileirar nada: --ver");
    console.error("Para retomar mesmo, depois de fechada a conversa: --retomar (e repor o default em imo_cp_fila, migração 0127).");
    process.exitCode = 1;
    return;
  }
  if (!nome) { console.error('Indica a zona. Ex: node scripts/imo-cp-aquecer.mjs "Carnaxide e Queijas" 300'); process.exitCode = 1; return; }

  // Os CP7 da zona, com coordenadas. A freguesia na tabela dos CTT é a do
  // GISCO («União das freguesias de Carnaxide e Queijas»); procura-se por
  // parte do nome, sem acentos.
  const limpo = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const chaves = limpo(nome).replace(/[,()]/g, " ").split(/\s+/).filter(Boolean);
  // Vírgulas e parênteses partem o filtro do PostgREST; procura-se por
  // cada palavra com curingas (com os acentos tal como estão na tabela,
  // porque o ilike não os ignora) e confirma-se em memória sem acentos.
  const palavrasRaw = String(nome).replace(/[,()]/g, " ").split(/\s+/).filter(Boolean);
  const padrao = `%${palavrasRaw.join("%")}%`;
  let q = sb.from("imo_codigos_postais").select("cp7, lat, lng, freguesia, designacao, concelho").not("lat", "is", null).limit(5000);
  q = porConcelho ? q.ilike("concelho", padrao) : q.or(`freguesia.ilike.${padrao},designacao.ilike.${padrao}`);
  const { data: cps, error } = await q;
  if (error) { console.error(error.message); process.exitCode = 1; return; }
  const candidatos = (cps ?? []).filter((c) =>
    porConcelho || chaves.every((k) => limpo(c.freguesia).includes(k)) || chaves.every((k) => limpo(c.designacao).includes(k)));
  if (!candidatos.length) { console.log(`Nenhum código postal com coordenadas para «${nome}».`); return; }

  // Os que já estão na fila ou já têm área ficam de fora, mas contam para
  // o espaçamento: não vale a pena pedir um CP7 a 40 m de um já colhido.
  const { data: jaTem, error: eJa } = await sb.from("imo_cp_areas").select("cp7, lat, lng").in("cp7", candidatos.map((c) => c.cp7));
  if (eJa) { console.error(`não consegui ler os já existentes: ${eJa.message}`); process.exitCode = 1; return; }
  const existentes = new Set((jaTem ?? []).map((r) => r.cp7));
  const escolhidos = (jaTem ?? []).filter((r) => r.lat != null).map((r) => ({ lat: Number(r.lat), lng: Number(r.lng) }));
  const novos = [];
  for (const c of candidatos.filter((c) => !existentes.has(c.cp7))) {
    const p = { lat: Number(c.lat), lng: Number(c.lng) };
    if (escolhidos.some((e) => distanciaM(e, p) < espacamento)) continue;
    escolhidos.push(p); novos.push(c);
  }
  const freguesias = [...new Set(candidatos.map((c) => c.freguesia ?? c.designacao))];
  console.log(`«${nome}»: ${candidatos.length} códigos postais com coordenadas (${freguesias.slice(0, 3).join("; ")}${freguesias.length > 3 ? "…" : ""})`);
  console.log(`  já na fila ou com área: ${existentes.size} · a mais de ${espacamento} m de outro: ${novos.length} · máximo agora: ${maximo}`);
  if (soVer) return;

  // origem 'aquecimento': a fila serve primeiro o que veio de avaliações
  // reais (0125); isto vai atrás.
  const lote = novos.slice(0, maximo).map((c) => ({
    cp7: c.cp7, lat: c.lat, lng: c.lng, coordenadas_em: new Date().toISOString(), estado: "pendente", origem: "aquecimento",
  }));
  if (!lote.length) { console.log("Nada a enfileirar."); return; }
  for (let i = 0; i < lote.length; i += 500) {
    const { error: eI } = await sb.from("imo_cp_areas").upsert(lote.slice(i, i + 500), { onConflict: "cp7", ignoreDuplicates: true });
    if (eI) { console.error(`lote ${i / 500 + 1}: ${eI.message}`); process.exitCode = 1; return; }
  }
  const dias = Math.ceil(lote.length / 120);
  console.log(`  ${lote.length} códigos postais na fila. A 120 por dia (duas corridas de 60), ficam colhidos em cerca de ${dias} dia${dias === 1 ? "" : "s"}.`);
}

await main().catch((e) => { console.error(e?.message ?? String(e)); process.exitCode = 1; });
