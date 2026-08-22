// Verifica a saúde dos dados de mercado.
//
//   npx tsx scripts/imo-qualidade.mts           # mostra
//   npx tsx scripts/imo-qualidade.mts --gravar  # mostra e regista a fila
//
// Nada nesta camada grita quando corre mal. Um benchmark com o preço por
// fogo na coluna do €/m², uma amostra fina de mais para servir, um número
// de há um ano — nenhum destes casos dá erro, e todos fazem as avaliações
// daquela zona ficarem silenciosamente erradas.
//
// NÃO CORRIGE NADA. Um corretor automático que decidisse qual dos dois
// números sobrevive faria em silêncio o mesmo mal que veio denunciar.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { verificar, type Benchmark, type Transacao, type Amostra } from "../lib/imo/qualidade-dados.ts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
const gravar = process.argv.includes("--gravar");

const { data: geo } = await sb.from("imo_geografias").select("id, nome, nivel");
const nomes = new Map((geo ?? []).map((g) => [g.id, g]));

const { data: bs, error: eB } = await sb.from("imo_benchmarks")
  .select("id, fonte_id, geografia_id, tipo_imovel, tipologia, eur_m2_medio, " +
          "n_transacoes, periodo, periodo_fim, desconto_medio, extra");
if (eB) { console.error("erro a ler benchmarks: " + eB.message); process.exit(1); }

const { data: ts } = await sb.from("imo_transacoes")
  .select("id, referencia, area, preco_transacao, data_transacao, geografia_id");

const { data: as } = await sb.from("imo_amostras")
  .select("id, chave, n_itens, valida_ate, geografia_id");

const benchmarks: Benchmark[] = (bs ?? []).map((b) => ({
  ...b,
  eur_m2_medio: b.eur_m2_medio == null ? null : Number(b.eur_m2_medio),
  desconto_medio: b.desconto_medio == null ? null : Number(b.desconto_medio),
  geografia_nome: nomes.get(b.geografia_id)?.nome ?? "?",
  geografia_nivel: nomes.get(b.geografia_id)?.nivel ?? "?",
})) as Benchmark[];

const transacoes: Transacao[] = (ts ?? []).map((t) => ({
  ...t,
  area: t.area == null ? null : Number(t.area),
  preco_transacao: t.preco_transacao == null ? null : Number(t.preco_transacao),
})) as Transacao[];

const amostras: Amostra[] = (as ?? []).map((a) => ({
  ...a, geografia_nome: nomes.get(a.geografia_id)?.nome ?? "?",
})) as Amostra[];

console.log(`${benchmarks.length} benchmarks · ${transacoes.length} vendas · ${amostras.length} amostras\n`);

const problemas = verificar({ benchmarks, transacoes, amostras }, new Date());

if (!problemas.length) {
  console.log("Nada a assinalar.");
  process.exit(0);
}

const marca = { grave: "GRAVE", aviso: "aviso", info: "info " };
for (const p of problemas) {
  const onde = String(p.detalhe.onde ?? "");
  console.log(`  ${marca[p.severidade]}  ${p.tipo.padEnd(24)}${onde}`);
  const resto = Object.entries(p.detalhe).filter(([k]) => k !== "onde");
  if (resto.length) {
    console.log(`         ${resto.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ")}`);
  }
}

const graves = problemas.filter((p) => p.severidade === "grave").length;
console.log(`\n${problemas.length}问 problema(s) · ${graves} grave(s)`.replace("问 ", " "));

if (!gravar) { console.log("\nNada foi registado. Para pôr na fila:  --gravar"); process.exit(graves ? 1 : 0); }

// Fecha-se o que já não se verifica, antes de abrir o que se verifica
// agora: uma fila que só cresce deixa de ser lida, e um problema
// resolvido a ocupar espaço esconde os que ainda existem.
await sb.from("imo_problemas_dados").update({ resolvido: true, resolvido_em: new Date().toISOString() })
  .eq("resolvido", false);

let n = 0;
for (const p of problemas) {
  const { error } = await sb.from("imo_problemas_dados").insert({
    tipo: p.tipo, severidade: p.severidade, tabela: p.tabela,
    registo_id: p.registo_id, detalhe: p.detalhe,
  });
  if (!error) n++;
}
console.log(`\n${n} registados em imo_problemas_dados.`);
process.exit(graves ? 1 : 0);
