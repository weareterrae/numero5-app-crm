// Vigia a pasta do SIR: lê, valida e importa tudo o que aparecer.
//
//   npx tsx scripts/imo-vigiar-pasta-sir.mts            # importa o que há de novo
//   npx tsx scripts/imo-vigiar-pasta-sir.mts --ver      # só mostra, não grava
//   npx tsx scripts/imo-vigiar-pasta-sir.mts --faltam   # que zonas gerar a seguir
//
// A DIVISÃO DE TRABALHO, e porque é assim
//
// Gerar o relatório no SIR é trabalho da pessoa: a plataforma é
// licenciada, as microzonas exigem desenhar no mapa, e automatizar a
// sessão seria construir um pipeline de extração sobre a plataforma de
// outrem. É a regra da casa e está certa.
//
// Tudo o resto — ler, validar, resolver a geografia, versionar, importar,
// avisar o que envelheceu — é trabalho repetitivo e sem juízo, e é o que
// esta rotina faz. Quem gera o relatório larga o ficheiro na pasta e não
// pensa mais nisso.
//
// NUNCA IMPORTA DUAS VEZES: cada ficheiro é identificado pelo seu hash.
// Voltar a correr isto é seguro; é para ser corrido sem se pensar.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { lerMicroSIR, lerIndicadores } from "../lib/imo/ler-relatorio-sir.ts";

const PASTA = process.env.IMO_PASTA_SIR
  ?? "C:/Users/sandr/OneDrive/Número Cinco/_Documentos-e-Assets/SIR";

/**
 * Ao fim de quantos meses um benchmark deixa de descrever o mercado.
 *
 * O SIR atualiza mensalmente e usa janelas até 24 meses. Seis meses é
 * quando vale a pena voltar a gerar: o mercado residencial move-se em
 * meses, e um número de há meio ano já não descreve o que se passa hoje.
 */
const MESES_ATE_ENVELHECER = 6;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

const soVer = process.argv.includes("--ver");
const soFaltam = process.argv.includes("--faltam");

// ---------------------------------------------------------------------
// O QUE FALTA GERAR — a lista de trabalho de quem tem acesso ao SIR
// ---------------------------------------------------------------------
if (soFaltam) {
  // Sem auto-join: o PostgREST não expõe a relação de uma tabela consigo
  // própria, e a consulta falhava em SILÊNCIO — devolvia zero zonas e a
  // lista de trabalho aparecia vazia, como se estivesse tudo feito.
  // Uma lista vazia por engano é pior do que um erro: parece uma boa
  // notícia.
  const { data: zonas, error: eZonas } = await sb
    .from("imo_geografias")
    .select("id, nivel, nome, pai_id")
    .in("nivel", ["concelho", "freguesia"])
    .eq("ativo", true);
  if (eZonas) { console.error("erro a ler as zonas: " + eZonas.message); process.exit(1); }
  if (!zonas?.length) { console.error("Nenhuma zona na hierarquia. Correr a migração 0087."); process.exit(1); }

  const limite = new Date();
  limite.setMonth(limite.getMonth() - MESES_ATE_ENVELHECER);

  const linhas: Array<{ nome: string; nivel: string; estado: string; ordem: number }> = [];
  for (const z of zonas ?? []) {
    const { data: b } = await sb.from("imo_benchmarks")
      .select("periodo, periodo_fim").eq("geografia_id", z.id).eq("fonte_id", "sir")
      .order("periodo_fim", { ascending: false }).limit(1);
    const ultimo = b?.[0];
    if (!ultimo) linhas.push({ nome: z.nome, nivel: z.nivel, estado: "SEM DADOS", ordem: 0 });
    else if (new Date(ultimo.periodo_fim) < limite) {
      linhas.push({ nome: z.nome, nivel: z.nivel, estado: `desatualizado (${ultimo.periodo})`, ordem: 1 });
    } else {
      linhas.push({ nome: z.nome, nivel: z.nivel, estado: `ok (${ultimo.periodo})`, ordem: 2 });
    }
  }
  linhas.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));

  console.log("ZONAS A GERAR NO SIR, por prioridade\n");
  for (const l of linhas) {
    console.log(`  ${l.estado.padEnd(24)}${l.nivel.padEnd(11)}${l.nome}`);
  }
  const porFazer = linhas.filter((l) => l.ordem < 2).length;
  console.log(`\n${porFazer} por gerar · ${linhas.length - porFazer} atualizadas`);
  if (porFazer) {
    console.log("\nGera o relatório de cada uma no SIR e larga o PDF na pasta.");
    console.log("O resto é automático — corre este guião outra vez e ele importa.");
  }
  process.exit(0);
}

// ---------------------------------------------------------------------
// IMPORTAR O QUE HÁ DE NOVO
// ---------------------------------------------------------------------
const mupdf: any = await import("mupdf");

function itensDaPagina(doc: any, n: number) {
  const st = JSON.parse(doc.loadPage(n).toStructuredText("preserve-whitespace").asJSON());
  const out: Array<{ t: string; x: number; y: number }> = [];
  for (const b of st.blocks ?? []) {
    for (const l of b.lines ?? []) {
      const t = (l.text ?? (l.spans ?? []).map((s: any) => s.text).join("")).trim();
      if (t && l.bbox) out.push({ t, x: Math.round(l.bbox.x), y: Math.round(l.bbox.y) });
    }
  }
  return out;
}

let pdfs: string[] = [];
try {
  pdfs = readdirSync(PASTA).filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => statSync(join(PASTA, b)).mtimeMs - statSync(join(PASTA, a)).mtimeMs);
} catch {
  console.error(`Não consegui abrir ${PASTA}`);
  process.exit(1);
}

console.log(`${PASTA}\n${pdfs.length} ficheiros\n`);

let novos = 0, repetidos = 0, falhados = 0;

for (const nome of pdfs) {
  const bytes = readFileSync(join(PASTA, nome));
  const hash = createHash("sha256").update(bytes).digest("hex");

  // Já entrou? O hash é a identidade do ficheiro — o nome não é, porque
  // dois exports diferentes podem sair com o mesmo nome.
  const { data: ja } = await sb.from("imo_importacoes")
    .select("id, created_at, periodo").eq("fonte_id", "sir").eq("ficheiro_hash", hash)
    .neq("estado", "REJEITADO").maybeSingle();
  if (ja) {
    repetidos++;
    console.log(`  já importado   ${nome}`);
    continue;
  }

  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const n = doc.countPages();

  // Procura-se a página do Micro-SIR pelo título, não pela posição: o
  // relatório pode mudar de estrutura e a quarta página deixar de ser ela.
  let pMicro = -1;
  for (let i = 0; i < n; i++) {
    if (itensDaPagina(doc, i).some((x) => /ESTAT[ÍI]STICAS DA MICRO-ZONA/i.test(x.t))) { pMicro = i; break; }
  }
  if (pMicro < 0) {
    falhados++;
    console.log(`  SEM MICRO-SIR  ${nome}  (só tem gráficos — de um gráfico não se lê um número)`);
    continue;
  }

  const v = lerMicroSIR(itensDaPagina(doc, pMicro));

  // Indicadores da página mais específica que os traga (a freguesia, se
  // houver; senão o concelho).
  let ind = { absorcao_meses: null as number | null, desconto_acumulado: null as number | null,
    price_gap: null as number | null, yield_bruta: null as number | null };
  for (let i = 0; i < n; i++) {
    const it = itensDaPagina(doc, i);
    if (!it.some((x) => /Indicadores de absor/i.test(x.t))) continue;
    const freg = it.find((x) => /^Freguesia:/i.test(x.t))?.t.split(":").slice(1).join(":").trim();
    const lido = lerIndicadores(it);
    if (freg && freg.toLowerCase() !== "total") { ind = lido; break; }
    ind = lido;   // guarda o do concelho, caso não venha nenhum de freguesia
  }

  if (v.em_falta.length > 3 || !v.eur_m2.media) {
    falhados++;
    console.log(`  NÃO LEU        ${nome}`);
    for (const f of v.em_falta.slice(0, 4)) console.log(`                   · ${f}`);
    continue;
  }

  console.log(`  ${soVer ? "leria" : "NOVO "}          ${nome}`);
  console.log(`                   ${v.concelho} · ${v.freguesia ?? "—"} · ${v.periodo} · ` +
    `${v.eur_m2.media} €/m² · ${v.amostra ?? "?"} imóveis` +
    (ind.price_gap != null ? ` · gap ${(ind.price_gap * 100).toFixed(1)}%` : ""));
  if (soVer) { novos++; continue; }

  // ---- geografia
  const { data: concelhoId } = await sb.rpc("imo_geo_por_nome", { p_zona: null, p_concelho: v.concelho });
  if (!concelhoId) {
    falhados++;
    console.log(`                   ✗ concelho "${v.concelho}" não existe na hierarquia — acrescentar e repetir`);
    continue;
  }
  let alvoId = concelhoId;
  if (v.freguesia && v.freguesia.toLowerCase() !== "total") {
    const { data: fid } = await sb.rpc("imo_geo_upsert", {
      p_pai: concelhoId, p_nivel: "freguesia", p_nome: v.freguesia,
      p_lat: null, p_lng: null, p_manual: false,
    });
    alvoId = fid ?? concelhoId;
  }
  // A microzona é um retângulo desenhado: guarda-se com o centróide, que
  // é a única coisa que a identifica de forma reproduzível.
  if (v.centroide) {
    await sb.rpc("imo_geo_upsert", {
      p_pai: alvoId, p_nivel: "microzona",
      p_nome: `Micro-SIR ${v.freguesia ?? v.concelho} (${v.periodo})`,
      p_lat: v.centroide.lat, p_lng: v.centroide.lng, p_manual: true,
    });
  }

  // ---- importação versionada
  const { data: imp } = await sb.from("imo_importacoes").insert({
    fonte_id: "sir", periodo: v.periodo, ficheiro_nome: nome, ficheiro_hash: hash,
    linhas_total: 1 + Object.keys(v.eur_m2.por_tipologia).length,
    linhas_validas: 1 + Object.keys(v.eur_m2.por_tipologia).length,
    linhas_avisos: v.em_falta.length, linhas_rejeitadas: 0,
    mapeamento: { leitor: "pdf-microsir", pagina: pMicro + 1 },
    estado: "PUBLICADO", publicado_em: new Date().toISOString(),
  }).select("id").single();

  const fim = (() => {
    const [a, m] = (v.periodo ?? "").split("-").map(Number);
    return a && m ? new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10) : null;
  })();

  const base = {
    fonte_id: "sir", importacao_id: imp?.id, geografia_id: alvoId,
    periodo: v.periodo!, periodo_fim: fim, n_transacoes: v.amostra,
    // O PRICE GAP, não o desconto acumulado: é o gap que descreve a
    // diferença entre o que se pede no mercado e o que se transaciona,
    // que é a correção de que o cálculo precisa.
    desconto_medio: ind.price_gap,
    tempo_absorcao_dias: ind.absorcao_meses != null ? ind.absorcao_meses * 30 : null,
    extra: {
      area: "bruta_privativa", precos: "atualizados_a_valor_presente",
      desconto_acumulado: ind.desconto_acumulado, yield_bruta: ind.yield_bruta,
      eur_m2_novos: v.eur_m2.novos, eur_m2_usados: v.eur_m2.usados,
      centroide: v.centroide, ficheiro: nome,
    },
  };

  const dispersao = (v.eur_m2.p25 && v.eur_m2.p75 && v.eur_m2.media)
    ? Number((((v.eur_m2.p75 - v.eur_m2.p25) / 2) / v.eur_m2.media).toFixed(4)) : null;

  const linhas = [
    { ...base, tipo_imovel: "", tipologia: "", eur_m2_medio: v.eur_m2.media,
      eur_m2_p25: v.eur_m2.p25, eur_m2_p75: v.eur_m2.p75, dispersao },
    ...Object.entries(v.eur_m2.por_tipologia).map(([k, valor]) => {
      const [tipo, tipologia] = k.split("|");
      return { ...base, tipo_imovel: tipo, tipologia, eur_m2_medio: valor };
    }),
  ];

  let ok = 0;
  for (const l of linhas) {
    const { error } = await sb.from("imo_benchmarks").upsert(l, {
      onConflict: "fonte_id,geografia_id,tipo_imovel,tipologia,periodo",
    });
    if (!error) ok++;
  }
  console.log(`                   ✓ ${ok} benchmarks`);
  novos++;
}

console.log(`\n${novos} ${soVer ? "por importar" : "importados"} · ${repetidos} já lá estavam · ${falhados} não deram`);

if (!soVer && novos) {
  const { data: cob } = await sb.from("imo_cobertura")
    .select("nome, nivel, benchmarks, cobertura").gt("benchmarks", 0)
    .order("cobertura", { ascending: false }).limit(8);
  console.log("\nCOBERTURA");
  for (const c of cob ?? []) {
    console.log(`  ${String(c.cobertura).padStart(3)}  ${String(c.nivel).padEnd(11)}${c.nome}`);
  }
}
