// Passa as vendas reais da Terrae do ficheiro JSON para a camada de dados.
//
// Hoje são três linhas em `terrae-transacoes.json`. Não é um dataset — é
// uma anedota. Mas é a anedota mais valiosa que existe: preço a que se
// ESCRITUROU, de um imóvel que a Terrae conhece por dentro, sem o desconto
// entre o que se pede e o que se fecha.
//
// Entra na Fase 1 e não numa fase seguinte por uma razão simples: o valor
// disto é cumulativo. Três linhas hoje; se cada venda passar por aqui, são
// dezenas dentro de um ano — e é aí que uma avaliação da Terrae passa a
// assentar em algo que mais ninguém tem.
//
// Um ficheiro JSON num repositório não aguenta isso. Uma tabela aguenta.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const FONTE = "C:/Dev/Terrae/terraesite/netlify/functions/terrae-transacoes.json";
const vendas = JSON.parse(readFileSync(FONTE, "utf8"));

console.log(`${vendas.length} vendas no ficheiro\n`);

let entraram = 0, semGeo = 0;

for (const v of vendas) {
  if (!v.preco_vendido) {
    console.log(`  ignorada  ${v.ref} — sem preço de venda`);
    continue;
  }

  // A geografia é o que liga esta venda a tudo o resto. Sem ela, a venda
  // existe mas nunca é encontrada por uma avaliação da mesma zona.
  const { data: geo } = await sb.rpc("imo_geo_por_nome", {
    p_zona: v.zona ?? null,
    p_concelho: v.concelho ?? null,
  });
  if (!geo) semGeo++;

  const { error } = await sb.from("imo_transacoes").upsert({
    fonte_id: "terrae",
    geografia_id: geo ?? null,
    referencia: v.ref,
    tipo: v.tipo,
    tipologia: v.tipologia,
    area: v.area ?? null,
    lote: v.lote ?? null,
    ano: v.ano ?? null,
    estado: v.estado ?? null,
    caracteristicas: v.caracteristicas ?? null,
    preco_inicial: v.preco_anunciado ?? null,
    preco_transacao: v.preco_vendido,
    // O ficheiro guarda só o ano. Melhor um ano certo do que uma data
    // inventada: 31 de dezembro seria uma precisão falsa.
    data_transacao: /^\d{4}$/.test(String(v.data ?? "")) ? `${v.data}-06-30` : (v.data ?? null),
    dias_mercado: v.dias_venda ?? null,
    notas: v.notas ?? null,
  }, { onConflict: "id" });

  if (error) {
    console.log(`  ✗ ${v.ref}: ${error.message}`);
  } else {
    entraram++;
    const m2 = v.area ? Math.round(v.preco_vendido / v.area) : null;
    console.log(`  ✓ ${String(v.ref).padEnd(28)}${String(v.zona).padEnd(16)}` +
      `${(v.preco_vendido / 1000).toFixed(0)}k${m2 ? `  ${m2} €/m²` : ""}` +
      `${geo ? "" : "   ← sem geografia"}`);
  }
}

console.log(`\n${entraram} vendas na camada de dados.`);
if (semGeo) {
  console.log(`${semGeo} sem geografia reconhecida — acrescentar a microzona e voltar a correr.`);
}

// A métrica que interessa agora não é erro de avaliação: com três vendas,
// qualquer calibração é auto-engano. É COBERTURA — quantas zonas têm
// dados, com que idade e com que amostra. É isso que se pode medir hoje e
// que diz se o motor está a melhorar.
const { count: nGeo } = await sb.from("imo_geografias")
  .select("id", { count: "exact", head: true }).eq("ativo", true);
const { count: nBench } = await sb.from("imo_benchmarks")
  .select("id", { count: "exact", head: true });

console.log(`\nCOBERTURA · ${nGeo} geografias · ${nBench} benchmarks · ${entraram} vendas próprias`);
console.log("Marcos até haver validação a sério: 10 debug · 30 primeira leitura ·");
console.log("50 sinal útil · 100+ validação · 500+ calibração por segmento.");
