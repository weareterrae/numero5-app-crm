// Junta freguesias duplicadas — a mesma freguesia com dois nomes.
//
//   npx tsx scripts/imo-juntar-freguesias-duplicadas.mts        # só mostra
//   npx tsx scripts/imo-juntar-freguesias-duplicadas.mts --juntar
//
// PORQUE É QUE ISTO EXISTE
//
// O SIR abrevia os nomes das uniões de freguesias. Um import antigo criou
// «UF Algés e Linda-a-Velha» ao lado da «União das Freguesias de Algés,
// Linda-a-Velha e Cruz Quebrada-Dafundo», que é a mesma. O resultado não
// foi um erro: foi tudo verde e nenhum dado alcançável. As microzonas de
// Algés continuaram penduradas na oficial e o benchmark ficou na órfã,
// onde ninguém o vai buscar.
//
// O importador já não faz isto (ver lib/imo/casar-freguesia.ts). Isto
// limpa o que ficou para trás — e serve para voltar a correr, porque uma
// duplicação também pode nascer de uma freguesia escrita à mão.
//
// QUEM SOBREVIVE: a que tem mais filhos. É por eles que o resto do
// sistema resolve a geografia, e mudá-los de sítio é o que mais arrisca.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { casarFreguesia, lugares } from "../lib/imo/casar-freguesia.ts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

const juntar = process.argv.includes("--juntar");

const { data: geo, error } = await sb
  .from("imo_geografias").select("id, nivel, nome, pai_id");
if (error || !geo) { console.error("não consegui ler a hierarquia:", error?.message); process.exit(1); }

const filhos = new Map<string, number>();
for (const g of geo) if (g.pai_id) filhos.set(g.pai_id, (filhos.get(g.pai_id) ?? 0) + 1);

const freguesias = geo.filter((g) => g.nivel === "freguesia");
const concelhos = geo.filter((g) => g.nivel === "concelho");

type Par = { fica: typeof freguesias[0]; sai: typeof freguesias[0]; concelho: string };
const pares: Par[] = [];

for (const c of concelhos) {
  const irmas = freguesias.filter((f) => f.pai_id === c.id);
  const jaVistas = new Set<string>();

  for (const f of irmas) {
    if (jaVistas.has(f.id)) continue;
    // Casa cada uma contra as OUTRAS. Se casar, são a mesma freguesia.
    const outras = irmas.filter((o) => o.id !== f.id && !jaVistas.has(o.id));
    const r = casarFreguesia(f.nome, outras);
    if (r.tipo !== "lugares" && r.tipo !== "exata") continue;

    const par = [f, outras.find((o) => o.id === r.id)!];
    // Sobrevive a que tem mais filhos; em empate, o nome mais completo.
    par.sort((a, b) =>
      (filhos.get(b.id) ?? 0) - (filhos.get(a.id) ?? 0) || b.nome.length - a.nome.length);
    pares.push({ fica: par[0], sai: par[1], concelho: c.nome });
    jaVistas.add(f.id); jaVistas.add(par[1].id);
  }
}

// ---------------------------------------------------------------------
// PARECIDAS — o que a máquina não pode decidir sozinha
//
// «UF Sintra (S P Penaf., S Maria e S Miguel)» e «União das Freguesias de
// Sintra (Santa Maria e São Miguel, São Martinho e São Pedro de
// Penaferrim)» são a mesma freguesia, e nenhum código honesto o conclui:
// expandir «S Maria» para Santa Maria é adivinhar.
//
// Então não se adivinha — assinala-se. Partilham um lugar e não casam:
// uma pessoa que conheça o concelho decide em três segundos.
// ---------------------------------------------------------------------
const parecidas: Array<[string, string, string]> = [];
for (const c of concelhos) {
  const irmas = freguesias.filter((f) => f.pai_id === c.id);
  const duplicada = new Set(pares.flatMap((p) => [p.fica.id, p.sai.id]));
  for (let i = 0; i < irmas.length; i++) {
    for (let j = i + 1; j < irmas.length; j++) {
      const [a, b] = [irmas[i], irmas[j]];
      if (duplicada.has(a.id) && duplicada.has(b.id)) continue;   // já é par
      const la = lugares(a.nome), lb = lugares(b.nome);
      if (la.some((x) => lb.includes(x))) parecidas.push([c.nome, a.nome, b.nome]);
    }
  }
}

function avisarParecidas() {
  if (!parecidas.length) return;
  console.log(`\n${parecidas.length} par(es) PARECIDOS — decida a olho, não são fundidos:`);
  for (const [c, a, b] of parecidas) {
    console.log(`  ${c}`);
    console.log(`    · ${a}`);
    console.log(`    · ${b}`);
  }
  console.log("  Se forem a mesma, apague a errada e volte a importar o relatório.");
}

if (!pares.length) { console.log("Nenhuma freguesia duplicada."); avisarParecidas(); process.exit(0); }

console.log(`${pares.length} duplicação(ões)\n`);
for (const p of pares) {
  console.log(`  ${p.concelho}`);
  console.log(`    fica  ${p.fica.nome}  (${filhos.get(p.fica.id) ?? 0} filhos)`);
  console.log(`    sai   ${p.sai.nome}  (${filhos.get(p.sai.id) ?? 0} filhos)`);

  if (!juntar) continue;

  // 1. Os filhos mudam de pai.
  const { error: eF } = await sb.from("imo_geografias")
    .update({ pai_id: p.fica.id }).eq("pai_id", p.sai.id);
  if (eF) { console.log(`    ✗ filhos: ${eF.message}`); continue; }

  // 2. Os benchmarks mudam de geografia. Um a um, porque a chave única
  //    (fonte, geografia, tipo, tipologia, período) pode já existir do
  //    outro lado — e aí o que vale é o que já lá estava, não o da órfã:
  //    um upsert em bloco escolheria por acaso.
  const { data: bs } = await sb.from("imo_benchmarks")
    .select("id, fonte_id, tipo_imovel, tipologia, periodo").eq("geografia_id", p.sai.id);

  let movidos = 0, jaLa = 0;
  for (const b of bs ?? []) {
    const { data: existe } = await sb.from("imo_benchmarks").select("id")
      .eq("geografia_id", p.fica.id).eq("fonte_id", b.fonte_id)
      .eq("tipo_imovel", b.tipo_imovel).eq("tipologia", b.tipologia)
      .eq("periodo", b.periodo).maybeSingle();

    if (existe) { await sb.from("imo_benchmarks").delete().eq("id", b.id); jaLa++; continue; }
    const { error } = await sb.from("imo_benchmarks")
      .update({ geografia_id: p.fica.id }).eq("id", b.id);
    if (!error) movidos++;
  }

  // 3. E só então a órfã desaparece — se ainda apontar alguma coisa para
  //    ela, a chave estrangeira recusa, e é isso que se quer.
  const { error: eD } = await sb.from("imo_geografias").delete().eq("id", p.sai.id);
  console.log(`    ✓ ${movidos} benchmarks movidos` +
    (jaLa ? `, ${jaLa} já lá estavam` : "") +
    (eD ? ` · órfã NÃO apagada: ${eD.message}` : " · órfã apagada"));
}

avisarParecidas();
if (!juntar) console.log("\nNada foi alterado. Para juntar:  --juntar");
