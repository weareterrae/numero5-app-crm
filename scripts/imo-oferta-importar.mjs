// Lê uma exportação de imóveis à venda e mete-a na camada de dados.
//
//   node scripts/imo-oferta-importar.mjs export.xlsx                    (só mostra)
//   node scripts/imo-oferta-importar.mjs export.xlsx --gravar
//   node scripts/imo-oferta-importar.mjs export.csv --zona "Carnaxide e Queijas" --concelho Oeiras
//   node scripts/imo-oferta-importar.mjs export.xlsx --fonte infocasa --data 2026-09-07
//
// PORQUE EXISTE
//
// O motor sabe dizer quanto vale uma casa e não sabe dizer contra quantas
// ela vai competir. É a pergunta que o proprietário faz a seguir ao valor,
// e até 7 de Setembro de 2026 o relatório respondia-lhe com números que o
// modelo inventava. Foram removidos nesse dia.
//
// A informação existe: a Terrae tem subscrição de plataformas que a
// publicam. O que este script faz é ler a EXPORTAÇÃO que a Terrae tira da
// sua própria subscrição. Não vai buscar nada a lado nenhum: os termos do
// Infocasa (cláusula XIII) proíbem bots e scraping, e a cláusula V só
// permite obter informação pelos meios postos à disposição. Um export é
// um desses meios; um robot não é.
//
// DOIS ACTOS, como na importação de benchmarks. Mostra o que ia gravar e
// só grava com --gravar. Uma coluna mal mapeada num ficheiro de oferta
// não dá erro: dá um retrato competitivo errado, que é pior.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const args = process.argv.slice(2);
const opcao = (nome, omissao = null) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : omissao;
};
const ficheiro = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== `--${(args[args.indexOf(a) - 1] || "").replace(/^--/, "")}`
  && !["--zona", "--concelho", "--fonte", "--data", "--tipologia"].includes(args[args.indexOf(a) - 1]));
const gravar = args.includes("--gravar");
const fonte = opcao("fonte", "infocasa");
const dia = opcao("data", new Date().toISOString().slice(0, 10));
const zonaFixa = opcao("zona");
const concelhoFixo = opcao("concelho");

/** Sem acentos, sem pontuação, minúsculas: é assim que se comparam nomes de coluna. */
const chave = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// O vocabulário. O que não casar aqui aparece por mapear, que é uma
// pergunta a quem exportou, não um erro.
const SINONIMOS = {
  titulo: ["titulo", "título", "designacao", "designação", "descricao", "descrição", "nome", "imovel", "imóvel"],
  preco: ["preco", "preço", "valor", "preco pedido", "preço pedido", "preco atual", "preço atual", "asking price"],
  area: ["area", "área", "area bruta", "área bruta", "abp", "area bruta privativa", "m2", "metros"],
  tipologia: ["tipologia", "assoalhadas", "quartos", "t"],
  tipo: ["tipo", "tipo de imovel", "tipo de imóvel", "natureza", "segmento"],
  estado: ["estado", "estado de conservacao", "estado de conservação", "condicao", "condição"],
  dias_mercado: ["dias", "dias no mercado", "dias de mercado", "tempo no mercado", "tempo de divulgacao",
                 "tempo de divulgação", "dias ativo", "dias online", "antiguidade"],
  url: ["url", "link", "endereco", "endereço", "ligacao", "ligação"],
  referencia: ["referencia", "referência", "ref", "codigo", "código", "id"],
  publicado_em: ["data", "data de publicacao", "data de publicação", "publicado", "entrada", "data entrada"],
  freguesia: ["freguesia", "uniao de freguesias", "união de freguesias", "freg", "zona", "localizacao", "localização"],
  concelho: ["concelho", "municipio", "município", "conc"],
};

function proporMapeamento(colunas) {
  const mapa = {}, porMapear = [];
  for (const col of colunas) {
    const k = chave(col);
    let escolhido = null;
    for (const [campo, nomes] of Object.entries(SINONIMOS)) {
      if (nomes.some((n) => chave(n) === k)) { escolhido = campo; break; }
    }
    if (!escolhido) {
      for (const [campo, nomes] of Object.entries(SINONIMOS)) {
        if (nomes.some((n) => k.includes(chave(n)) || chave(n).includes(k))) { escolhido = campo; break; }
      }
    }
    if (escolhido && !mapa[escolhido]) mapa[escolhido] = col; else porMapear.push(col);
  }
  return { mapa, porMapear };
}

const numero = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // «430.000,00 €» e «430,000.00» na mesma função: o último separador manda.
  let s = String(v).replace(/[^\d.,-]/g, "");
  const virgula = s.lastIndexOf(","), ponto = s.lastIndexOf(".");
  if (virgula >= 0 && ponto >= 0) s = virgula > ponto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (virgula >= 0) s = s.split(",").length === 2 && s.split(",")[1].length <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const tipologiaDe = (v) => {
  const m = String(v ?? "").toUpperCase().match(/T\s?(\d)/);
  if (m) return "T" + m[1];
  const n = numero(v);
  return n !== null && n >= 0 && n <= 9 ? "T" + Math.round(n) : null;
};

function lerFicheiro(caminho) {
  const wb = XLSX.read(readFileSync(caminho), { type: "buffer", cellDates: true });
  const folha = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(folha, { defval: null });
}

async function main() {
  if (!ficheiro) {
    console.error("Indica o ficheiro. Ex: node scripts/imo-oferta-importar.mjs export.xlsx --zona \"Carnaxide e Queijas\" --concelho Oeiras");
    process.exitCode = 1; return;
  }

  let linhas;
  try { linhas = lerFicheiro(ficheiro); }
  catch (e) { console.error(`não consegui ler ${ficheiro}: ${e.message}`); process.exitCode = 1; return; }
  if (!linhas.length) { console.error("O ficheiro não tem linhas."); process.exitCode = 1; return; }

  const colunas = Object.keys(linhas[0]);
  const { mapa, porMapear } = proporMapeamento(colunas);
  console.log(`${linhas.length} linhas · ${colunas.length} colunas\n`);
  console.log("MAPEAMENTO PROPOSTO");
  for (const campo of Object.keys(SINONIMOS)) {
    console.log(`  ${campo.padEnd(13)} ${mapa[campo] ? "← " + mapa[campo] : "(não encontrado)"}`);
  }
  if (porMapear.length) console.log(`\n  colunas por usar: ${porMapear.join(", ")}`);

  if (!mapa.preco || !mapa.area) {
    console.error("\nSem preço e sem área não há €/m², e sem €/m² isto não serve para comparar nada.");
    console.error("Diz-me como se chamam essas colunas no teu ficheiro e eu acrescento-as ao vocabulário.");
    process.exitCode = 1; return;
  }

  // ---- agrupar por zona
  const porZona = new Map();
  let semZona = 0;
  for (const l of linhas) {
    const freg = zonaFixa ?? (mapa.freguesia ? String(l[mapa.freguesia] ?? "").trim() : "");
    const conc = concelhoFixo ?? (mapa.concelho ? String(l[mapa.concelho] ?? "").trim() : "");
    if (!freg && !conc) { semZona++; continue; }
    const k = `${freg}|${conc}`;
    if (!porZona.has(k)) porZona.set(k, { freg, conc, itens: [] });
    porZona.get(k).itens.push({
      titulo: mapa.titulo ? String(l[mapa.titulo] ?? "").slice(0, 200) : null,
      preco: numero(l[mapa.preco]),
      area: numero(l[mapa.area]),
      tipologia: mapa.tipologia ? tipologiaDe(l[mapa.tipologia]) : null,
      tipo: mapa.tipo ? String(l[mapa.tipo] ?? "").trim() || null : null,
      estado: mapa.estado ? String(l[mapa.estado] ?? "").trim() || null : null,
      dias_mercado: mapa.dias_mercado ? numero(l[mapa.dias_mercado]) : null,
      url: mapa.url ? String(l[mapa.url] ?? "").trim() || null : null,
      referencia: mapa.referencia ? String(l[mapa.referencia] ?? "").trim() || null : null,
      publicado_em: mapa.publicado_em && l[mapa.publicado_em]
        ? new Date(l[mapa.publicado_em]).toISOString().slice(0, 10) : null,
    });
  }
  if (semZona) console.log(`\n  ${semZona} linhas sem zona. Usa --zona e --concelho se o ficheiro é de uma freguesia só.`);

  console.log("\nO QUE IA GRAVAR");
  const resultados = [];
  for (const [, z] of porZona) {
    const { data: geoId } = await sb.rpc("imo_geo_por_nome", { p_zona: z.freg || z.conc, p_concelho: z.conc || z.freg });
    const uteis = z.itens.filter((i) => i.preco > 0 && i.area > 0);
    const m2 = uteis.map((i) => i.preco / i.area).sort((a, b) => a - b);
    const mediana = m2.length ? m2[Math.floor(m2.length / 2)] : null;
    const dias = uteis.map((i) => i.dias_mercado).filter((d) => d != null).sort((a, b) => a - b);
    console.log(`  ${(z.freg || z.conc).padEnd(46)} ${String(uteis.length).padStart(4)} úteis de ${String(z.itens.length).padStart(4)}` +
      (mediana ? ` · mediana ${Math.round(mediana).toLocaleString("pt-PT")} €/m²` : " · sem €/m²") +
      (dias.length ? ` · ${dias[Math.floor(dias.length / 2)]} dias de mediana` : "") +
      (geoId ? "" : "  ⚠ SEM GEOGRAFIA, não grava"));
    if (geoId) resultados.push({ geoId, nome: z.freg || z.conc, itens: z.itens });
  }

  if (!gravar) { console.log("\n(sem --gravar: não escrevi nada)"); return; }
  if (!resultados.length) { console.error("\nNenhuma zona reconhecida na hierarquia. Não gravei."); process.exitCode = 1; return; }

  console.log("");
  for (const r of resultados) {
    const { data, error } = await sb.rpc("imo_oferta_carregar", {
      p_payload: { geografia_id: r.geoId, fonte_id: fonte, colhida_em: dia, origem: "ficheiro", itens: r.itens },
    });
    if (error) { console.error(`  ${r.nome}: ${error.message}`); process.exitCode = 1; continue; }
    const x = Array.isArray(data) ? data[0] : data;
    console.log(`  ${r.nome}: ${x.itens} imóveis gravados, ${x.ignorados} ignorados por falta de preço ou área`);
  }
  console.log("\nOs valores ficam a informar o cálculo. Para aparecerem num relatório de cliente falta");
  console.log(`a confirmação escrita da fonte (imo_fontes.saida_para_cliente do «${fonte}» está a false).`);
}

await main().catch((e) => { console.error(e?.message ?? String(e)); process.exitCode = 1; });
