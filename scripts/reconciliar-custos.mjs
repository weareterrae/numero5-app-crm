// Confronta o custo que o gateway estima com o que o fornecedor cobra.
//
//   node scripts/reconciliar-custos.mjs 2026-08-01 2026-08-31 openai=12.40 google=3.15
//
// Porque isto existe: o custo em `ai_requests` é CALCULADO a partir dos
// preços do registo. Se um preço estiver errado, ou o fornecedor mudar
// tabela, o painel mente com total convicção — e ninguém repara, porque um
// número plausível não levanta suspeitas. Foi assim que dois modelos
// estiveram ACTIVE sem preço nenhum, a registar custo zero.
//
// Nenhum dos fornecedores expõe a fatura por API de forma utilizável, por
// isso os totais entram à mão, copiados do painel de faturação. É trabalho
// de cinco minutos por mês e é a única forma honesta de saber se o que se
// mostra corresponde ao que se paga.
//
// O que se faz com o resultado: um desvio pequeno (<5%) é normal — há
// arredondamentos e pedidos que falham a meio. Um desvio grande num só
// fornecedor aponta a um preço errado no registo; em todos ao mesmo tempo,
// a pedidos que não passam pelo gateway.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const [de, ate, ...faturas] = process.argv.slice(2);
if (!de || !ate) {
  console.error("uso: reconciliar-custos.mjs <de:YYYY-MM-DD> <ate:YYYY-MM-DD> [fornecedor=valor ...]");
  process.exit(1);
}
const cobrado = Object.fromEntries(
  faturas.map((f) => { const [k, v] = f.split("="); return [k, Number(v)]; }).filter(([, v]) => !Number.isNaN(v)),
);

const inicio = new Date(de + "T00:00:00Z").toISOString();
const fim = new Date(ate + "T23:59:59Z").toISOString();

// Página os resultados: um mês movimentado passa do limite de uma query.
const linhas = [];
for (let pagina = 0; ; pagina++) {
  const { data, error } = await sb.from("ai_requests")
    .select("provider_id, provider_model_id, input_tokens, output_tokens, cached_tokens, estimated_cost, status")
    .gte("created_at", inicio).lte("created_at", fim)
    .range(pagina * 1000, pagina * 1000 + 999);
  if (error) { console.error("erro:", error.message); process.exit(1); }
  linhas.push(...(data ?? []));
  if ((data?.length ?? 0) < 1000) break;
}

const porFornecedor = {};
const semPreco = new Map();
for (const r of linhas) {
  const f = r.provider_id ?? "?";
  (porFornecedor[f] ??= { pedidos: 0, entrada: 0, saida: 0, cache: 0, custo: 0, semCusto: 0 });
  const p = porFornecedor[f];
  p.pedidos++;
  p.entrada += r.input_tokens ?? 0;
  p.saida += r.output_tokens ?? 0;
  p.cache += r.cached_tokens ?? 0;
  p.custo += Number(r.estimated_cost ?? 0);
  // Um pedido que consumiu tokens mas não tem custo é um preço em falta —
  // é exatamente por aqui que o painel começa a mentir.
  if (!r.estimated_cost && (r.input_tokens || r.output_tokens)) {
    p.semCusto++;
    semPreco.set(r.provider_model_id, (semPreco.get(r.provider_model_id) ?? 0) + 1);
  }
}

const eur = (n) => "$" + n.toFixed(4);
console.log(`\nPeríodo ${de} a ${ate} · ${linhas.length} pedidos\n`);
console.log("fornecedor   pedidos     entrada      saída      cache      estimado" +
  (Object.keys(cobrado).length ? "      cobrado      desvio" : ""));

let totalEst = 0, totalCob = 0;
for (const [f, p] of Object.entries(porFornecedor).sort((a, b) => b[1].custo - a[1].custo)) {
  totalEst += p.custo;
  let extra = "";
  if (cobrado[f] != null) {
    totalCob += cobrado[f];
    const desvio = p.custo > 0 ? ((cobrado[f] - p.custo) / p.custo) * 100 : null;
    extra = "  " + ("$" + cobrado[f].toFixed(2)).padStart(11) +
      "  " + (desvio == null ? "—" : (desvio >= 0 ? "+" : "") + desvio.toFixed(1) + "%").padStart(10);
  }
  console.log(
    f.padEnd(12) + String(p.pedidos).padStart(7) +
    String(p.entrada).padStart(12) + String(p.saida).padStart(11) + String(p.cache).padStart(11) +
    eur(p.custo).padStart(14) + extra +
    (p.semCusto ? `   ⚠ ${p.semCusto} sem preço` : ""),
  );
}

console.log("\ntotal estimado: " + eur(totalEst));
if (totalCob) {
  const d = ((totalCob - totalEst) / totalEst) * 100;
  console.log("total cobrado:  $" + totalCob.toFixed(2) + `  ·  desvio ${d >= 0 ? "+" : ""}${d.toFixed(1)}%`);
  console.log(Math.abs(d) < 5
    ? "\nDentro do razoável. Arredondamentos e pedidos falhados a meio explicam alguns por cento."
    : "\nDESVIO A EXPLICAR. Num só fornecedor, é preço errado no registo. Em todos, são pedidos\n" +
      "que não passam pelo gateway — vale a pena correr confirmar-sites-no-gateway.mjs.");
}

if (semPreco.size) {
  console.log("\nModelos que serviram pedidos SEM preço no registo:");
  for (const [m, n] of [...semPreco].sort((a, b) => b[1] - a[1])) {
    console.log("   " + String(m ?? "(desconhecido)").padEnd(28) + n + " pedidos");
  }
  console.log("Enquanto isto existir, o painel mostra menos do que a realidade.");
}
