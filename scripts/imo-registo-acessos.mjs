// Exporta o registo completo dos acessos ao MicroSIR.
//
//   node scripts/imo-registo-acessos.mjs
//   node scripts/imo-registo-acessos.mjs --pasta "C:/caminho/qualquer"
//
// PORQUE EXISTE
//
// A 7 de Setembro de 2026 a Confidencial Imobiliário perguntou o que era
// a recolha automatizada que viu nos registos dela. A resposta honesta é
// mostrar os nossos, e os nossos estavam em quatro sítios: o histórico de
// corridas no Apify, a tabela imo_cp_areas, a tabela imo_benchmarks e um
// ficheiro de texto no portátil. Nenhum deles se abre à frente de alguém.
//
// Isto junta tudo em três ficheiros CSV e uma folha de resumo. Se voltarem
// a perguntar daqui a seis meses, corre-se outra vez e está feito.
//
// O QUE NÃO VAI NOS FICHEIROS
//
// Nenhum valor de mercado deles. A lista de zonas leva o nome, o nível e o
// período, nunca os €/m². Provar o âmbito não exige devolver-lhes os
// dados, e um ficheiro que circula por email não deve levar o que a
// licença protege.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ACTOR = "G5IYnCtBFAUDVk4Ve";
const AML = ["Alcochete", "Almada", "Amadora", "Barreiro", "Cascais", "Lisboa", "Loures", "Mafra",
  "Moita", "Montijo", "Odivelas", "Oeiras", "Palmela", "Seixal", "Sesimbra", "Setúbal",
  "Sintra", "Vila Franca de Xira"];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const H = { authorization: `Bearer ${env.APIFY_TOKEN}` };

const args = process.argv.slice(2);
const pasta = (args.find((a) => a.startsWith("--pasta=")) ?? "").split("=")[1]
  || args[args.indexOf("--pasta") + 1]
  || "C:/Users/sandr/OneDrive/Documentos/Claude/Terrae_Site_v2/microsir-registo";

/** Data e hora em Lisboa, que é o fuso em que estas coisas aconteceram. */
const lisboa = (iso) => iso
  ? new Date(iso).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
  : "";
const csv = (linhas) => linhas.map((l) => l.map((c) => {
  const s = String(c ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(";")).join("\r\n");

async function main() {
  mkdirSync(pasta, { recursive: true });

  // ---- 1. as sessões: uma corrida do Actor é um login no MicroSIR -----
  const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/runs?limit=500&desc=1`, { headers: H });
  if (!r.ok) { console.error(`Apify respondeu HTTP ${r.status}`); process.exitCode = 1; return; }
  const corridas = (await r.json()).data.items.reverse();

  const sessoes = [["inicio_lisboa", "fim_lisboa", "duracao_min", "estado", "tipo", "zonas", "pontos",
                    "paginas_relatorio", "pedidos_graficos", "run_id"]];
  let totRel = 0, totGraf = 0, totSeg = 0, totPontos = 0;

  for (const c of corridas) {
    let alvo = "", colhe = "completo", pontos = 0;
    try {
      const kv = await fetch(`https://api.apify.com/v2/key-value-stores/${c.defaultKeyValueStoreId}/records/INPUT`, { headers: H });
      if (kv.ok) { const i = await kv.json(); alvo = i.target ?? ""; colhe = i.collect ?? "completo"; pontos = (i.points ?? []).length; }
    } catch { /* uma corrida sem input é uma corrida que nem chegou a começar */ }
    let itens = 0;
    try {
      const d = await fetch(`https://api.apify.com/v2/datasets/${c.defaultDatasetId}`, { headers: H });
      if (d.ok) itens = (await d.json()).data.itemCount ?? 0;
    } catch { /* idem */ }

    const seg = Math.round((new Date(c.finishedAt ?? c.startedAt) - new Date(c.startedAt)) / 1000);
    const min = Math.round(seg / 60);

    // TRÊS TIPOS DE CORRIDA, e cada um custa uma coisa diferente a quem
    // serve os pedidos.
    //
    // Zonas: por zona, um pedido de percentis, um por tipologia, um por
    // estado, e a página de relatório. Quatro, ou um só em modo percentis.
    //
    // Códigos postais: cada ponto sobe a escada até encontrar amostra, um
    // a quatro pedidos, e nenhum lê relatório. O número exacto está
    // guardado em cada linha de imo_cp_areas e conta-se lá, não aqui, para
    // não somar a mesma coisa duas vezes.
    const porZonas = alvo.startsWith("aml") || alvo === "single";
    const porPontos = alvo === "pontos" || alvo === "ponto";
    const relatorio = porZonas && colhe === "completo" ? itens : 0;
    const graficos = porZonas ? (colhe === "completo" ? itens * 3 : itens) : 0;
    const tipo = alvo.startsWith("aml") ? "varredura da AML"
      : alvo === "single" ? "uma zona"
        : porPontos ? "consulta de códigos postais"
          : (alvo || "arranque, sem pedidos");

    sessoes.push([lisboa(c.startedAt), lisboa(c.finishedAt), min, c.status, tipo,
                  porZonas ? itens : "", porPontos ? (pontos || itens || "") : "",
                  relatorio || "", porZonas ? graficos : "ver ficheiro 2", c.id]);
    // Conta-se o que BATEU NOS SERVIDORES DELES, e não só o que ficou
    // guardado: uma corrida que expirou a meio leu na mesma o que leu.
    totRel += relatorio; totGraf += graficos;
    if (porPontos) totPontos += pontos || itens;
    totSeg += seg;
  }
  writeFileSync(join(pasta, "1-sessoes.csv"), "\uFEFF" + csv(sessoes), "utf8");

  // ---- 2. os códigos postais consultados ------------------------------
  const { data: areas, error: eA } = await sb.from("imo_cp_areas")
    .select("cp7, colhido_em, raio_m, amostra, escada, origem, estado").not("colhido_em", "is", null);
  if (eA) { console.error(eA.message); process.exitCode = 1; return; }
  const { data: cps } = await sb.from("imo_codigos_postais")
    .select("cp7, concelho, freguesia, localidade").in("cp7", areas.map((a) => a.cp7));
  const sitio = Object.fromEntries((cps ?? []).map((c) => [c.cp7, c]));

  const foraDaAml = [];
  const linhasCp = [["codigo_postal", "concelho", "freguesia", "consultado_em_lisboa",
                     "raio_escolhido_m", "pedidos_nesta_consulta", "resultado"]];
  for (const a of areas.sort((x, y) => String(x.colhido_em).localeCompare(String(y.colhido_em)))) {
    const s = sitio[a.cp7] ?? {};
    if (s.concelho && !AML.includes(s.concelho)) foraDaAml.push(`${a.cp7} (${s.concelho})`);
    linhasCp.push([a.cp7, s.concelho ?? "", s.freguesia ?? s.localidade ?? "", lisboa(a.colhido_em),
                   a.raio_m ?? "", Array.isArray(a.escada) ? a.escada.length : 1,
                   a.estado === "ok" ? "com área de mercado" : a.estado]);
  }
  writeFileSync(join(pasta, "2-codigos-postais.csv"), "\uFEFF" + csv(linhasCp), "utf8");

  // ---- 3. as zonas colhidas, SEM os valores ---------------------------
  const { data: bms } = await sb.from("imo_benchmarks")
    .select("geografia_id, periodo, created_at").eq("fonte_id", "sir-micro");
  const { data: geos } = await sb.from("imo_geografias").select("id, nome, nivel, pai_id");
  const porId = Object.fromEntries((geos ?? []).map((g) => [g.id, g]));
  const vistas = new Map();
  for (const b of bms ?? []) {
    const g = porId[b.geografia_id]; if (!g) continue;
    const chave = `${b.geografia_id}|${b.periodo}`;
    if (!vistas.has(chave)) vistas.set(chave, { g, periodo: b.periodo, em: b.created_at });
  }
  const linhasZ = [["zona", "nivel", "concelho", "periodo_da_janela", "colhida_em_lisboa"]];
  for (const v of [...vistas.values()].sort((a, b) => a.g.nome.localeCompare(b.g.nome))) {
    const pai = v.g.pai_id ? porId[v.g.pai_id] : null;
    linhasZ.push([v.g.nome, v.g.nivel, v.g.nivel === "concelho" ? v.g.nome : (pai?.nome ?? ""), v.periodo, lisboa(v.em)]);
  }
  writeFileSync(join(pasta, "3-zonas.csv"), "\uFEFF" + csv(linhasZ), "utf8");

  // ---- 4. o resumo, para quem não abre um CSV --------------------------
  const sessoesOk = corridas.filter((c) => c.status === "SUCCEEDED").length;
  // Cada código postal custa entre um e quatro pedidos, conforme a escada
  // tenha de alargar o raio até encontrar amostra. O número real está
  // guardado em cada linha.
  const pedidosPontos = areas.reduce((t, a) => t + (Array.isArray(a.escada) ? a.escada.length : 1), 0);
  const concelhos = {};
  for (const a of areas) { const c = sitio[a.cp7]?.concelho; if (c) concelhos[c] = (concelhos[c] ?? 0) + 1; }
  const porConcelho = Object.entries(concelhos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
  const primeira = lisboa(corridas[0]?.startedAt), ultima = lisboa(corridas[corridas.length - 1]?.startedAt);

  const resumo = [
    "REGISTO DE ACESSOS AO MICROSIR",
    `Terrae · Os Caetanos, Lda · exportado a ${lisboa(new Date().toISOString())}`,
    "",
    `Período coberto: ${primeira} a ${ultima}`,
    `Sessões abertas na plataforma: ${corridas.length} (${sessoesOk} concluídas com êxito)`,
    `Tempo total de ligação: ${Math.round(totSeg / 60)} minutos`,
    "",
    `Varreduras das zonas da Área Metropolitana de Lisboa: ${sessoes.slice(1).filter((l) => l[4] === "varredura da AML").length}`,
    `Páginas de relatório lidas, ao todo: ${totRel}`,
    `Pedidos aos gráficos de percentis: ${totGraf} nas varreduras e ${pedidosPontos} nas consultas de códigos postais, ${totGraf + pedidosPontos} ao todo`,
    `Códigos postais consultados: ${areas.length}`,
    `Repartição por concelho: ${porConcelho}`,
    `Consultas fora dos 18 concelhos da subscrição: ${foraDaAml.length === 0 ? "nenhuma" : foraDaAml.join(", ")}`,
    "",
    "O QUE É LIDO",
    "Percentis de €/m² por área e por janela de tempo, repartidos por tipologia e por estado de",
    "conservação, e quatro indicadores da página de relatório de cada zona: price gap, tempo de",
    "absorção, desconto acumulado e yield bruta.",
    "",
    "O QUE NUNCA É LIDO NEM GUARDADO",
    "Transações individuais, moradas, identificação de proprietários ou de compradores. Só agregados.",
    "Nada é revendido nem cedido a terceiros. A menção «© IMOESTATÍSTICA, TODOS OS DIREITOS",
    "RESERVADOS» acompanha os valores em todos os documentos que saem para um cliente.",
    "",
    "COMO SE COMPORTA A RECOLHA",
    "Uma sessão por corrida, com as credenciais da subscrição da Terrae. Um pedido de cada vez, com",
    "um segundo de espera entre pedidos. Perante uma resposta de serviço ocupado, espera e repete;",
    "perante uma recusa de acesso, pára e não repete. Sem servidor intermediário e sem identidade",
    "alterada.",
    "",
    "FICHEIROS",
    "1-sessoes.csv          uma linha por sessão, com data, duração e volume",
    "2-codigos-postais.csv  uma linha por código postal consultado, com data e concelho",
    "3-zonas.csv            as zonas colhidas, com nível e período (sem valores de mercado)",
  ].join("\r\n");
  writeFileSync(join(pasta, "0-resumo.txt"), "\uFEFF" + resumo, "utf8");

  console.log(resumo);
  console.log(`\nGravado em ${pasta}`);
}

await main().catch((e) => { console.error(e?.message ?? String(e)); process.exitCode = 1; });
