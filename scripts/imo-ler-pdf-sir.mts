// Lê um relatório Micro-SIR e mostra o que conseguiu extrair.
//
//   npx tsx scripts/imo-ler-pdf-sir.mts "<caminho do pdf>"
//
// Mostra e NÃO grava. A gravação é um segundo ato, deliberado — um
// benchmark errado não grita, só faz as avaliações daquela zona ficarem
// silenciosamente erradas durante meses.
import { readFileSync } from "node:fs";
import { lerMicroSIR, lerIndicadores } from "../lib/imo/ler-relatorio-sir.ts";

const caminho = process.argv[2];
if (!caminho) { console.error("uso: imo-ler-pdf-sir.mts <ficheiro.pdf>"); process.exit(1); }

const mupdf: any = await import("mupdf");
const doc = mupdf.Document.openDocument(readFileSync(caminho), "application/pdf");

/** Texto com posição, para se poder emparelhar etiqueta e valor. */
function itensDaPagina(n: number) {
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

const nPaginas = doc.countPages();
console.log(`${caminho.split(/[\\/]/).pop()} · ${nPaginas} páginas\n`);

// A página do Micro-SIR é a que traz os valores exatos. Procura-se pelo
// título em vez de assumir que é sempre a quarta: o relatório pode mudar.
let pMicro = -1;
for (let i = 0; i < nPaginas; i++) {
  if (itensDaPagina(i).some((x) => /ESTAT[ÍI]STICAS DA MICRO-ZONA/i.test(x.t))) { pMicro = i; break; }
}
if (pMicro < 0) {
  console.error("Não encontrei a página do Micro-SIR. É dela que vêm os valores exatos —");
  console.error("as outras trazem gráficos, e de um gráfico não se lê um número.");
  process.exit(1);
}

const v = lerMicroSIR(itensDaPagina(pMicro));
const eur = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-PT") + " €");

console.log(`MICRO-SIR (página ${pMicro + 1})`);
console.log(`  ${v.concelho ?? "?"} · ${v.freguesia ?? "?"} · ${v.periodo ?? "?"}`);
console.log(`  amostra: ${v.amostra ?? "?"} imóveis` +
  (v.centroide ? ` · centróide ${v.centroide.lat}, ${v.centroide.lng}` : ""));

console.log(`\n  €/m²   P25 ${eur(v.eur_m2.p25)} · média ${eur(v.eur_m2.media)} · P75 ${eur(v.eur_m2.p75)}`);
console.log(`         novos ${eur(v.eur_m2.novos)} · usados ${eur(v.eur_m2.usados)}`);
for (const [k, n] of Object.entries(v.eur_m2.por_tipologia)) {
  console.log(`         ${k.replace("|", " ").padEnd(18)}${eur(n)}`);
}
console.log(`\n  fogo   P25 ${eur(v.preco_fogo.p25)} · média ${eur(v.preco_fogo.media)} · P75 ${eur(v.preco_fogo.p75)}`);

// Indicadores: estão nas páginas do concelho e da freguesia.
for (let i = 0; i < nPaginas; i++) {
  const it = itensDaPagina(i);
  if (!it.some((x) => /Indicadores de absor/i.test(x.t))) continue;
  const freg = it.find((x) => /^Freguesia:/i.test(x.t))?.t.split(":").slice(1).join(":").trim();
  const ind = lerIndicadores(it);
  const p = (x: number | null) => (x == null ? "—" : (x * 100).toFixed(1) + "%");
  console.log(`\nINDICADORES (página ${i + 1}) · ${freg || "concelho"}`);
  console.log(`  absorção ${ind.absorcao_meses ?? "—"} meses · desconto acumulado ${p(ind.desconto_acumulado)}` +
    ` · price gap ${p(ind.price_gap)} · yield ${p(ind.yield_bruta)}`);
}

if (v.em_falta.length) {
  console.log(`\nNÃO CONSEGUI LER (${v.em_falta.length}):`);
  for (const f of v.em_falta) console.log(`  · ${f}`);
  console.log("Se a plataforma mudou o relatório, é aqui que se vê — e corrige-se o leitor,");
  console.log("em vez de se importar metade dos números sem ninguém reparar.");
} else {
  console.log("\nLeu tudo.");
}
