// Fecha o ciclo: liga vendas reais a avaliações emitidas e mede o erro.
//
//   node scripts/imo-backtest.mjs                # liga o que conseguir e mostra as métricas
//   node scripts/imo-backtest.mjs --ver          # só mostra o que ligaria, sem escrever
//   node scripts/imo-backtest.mjs --metricas     # só as métricas (imo_backtest_metricas)
//   node scripts/imo-backtest.mjs --ligar <avaliacao_id> <preco_real> [data] [natureza] [fonte]
//
// COMO SE LIGA UMA VENDA A UMA AVALIAÇÃO
//
// Uma escritura em imo_transacoes (fonte terrae, natureza escritura) casa
// com uma avaliação em imo_avaliacoes quando: mesmo código postal (quando
// os dois o têm) ou mesma geografia; mesmo tipo e tipologia; área dentro
// de ±15%; e a avaliação é ANTERIOR à venda, até 18 meses antes. Só se
// conta uma avaliação por imóvel: a mais recente em modo profundo antes
// da venda (o teaser rápido do mesmo pedido não conta duas vezes).
//
// O QUE SE MEDE (vista imo_backtest_metricas, migração 0124): erro
// mediano absoluto (MdAPE), % dentro de ±5% e ±10%, cobertura do
// intervalo e viés, por versão do motor e por natureza do preço real.
// Publica-se só a partir de 30 casos de escritura ou CPCV. Com menos, é
// uma anedota; com 30, é uma afirmação que se defende.
//
// A avaliação original nunca muda. O que se grava é a comparação.
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

const chave = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
const classe = (t) => { const m = String(t ?? "").match(/(\d)/); if (!m) return ""; const d = Number(m[1]); return d <= 1 ? "T1" : d >= 4 ? "T4" : `T${d}`; };

async function metricas() {
  const { data, error } = await sb.from("imo_backtest_metricas").select("*");
  if (error) { console.error(error.message); return; }
  const linhas = (data ?? []).filter((r) => r.n > 0);
  if (!linhas.length) { console.log("\nMétricas: ainda sem nenhum par avaliação ↔ preço real."); return; }
  console.log("\nMÉTRICAS (imo_backtest_metricas):");
  for (const r of linhas) {
    console.log(`  motor=${String(r.motor_versao).padEnd(20)} preço=${String(r.natureza_preco).padEnd(18)} n=${String(r.n).padStart(3)} · MdAPE ${r.mdape_pct}% · ±5% ${r.pct_dentro_5}% · ±10% ${r.pct_dentro_10}% · no intervalo ${r.pct_dentro_intervalo}% · viés ${r.vies_mediano_pct}% · ${r.dias_medios} dias`);
  }
  const reais = linhas.find((r) => r.motor_versao === "todas" && r.natureza_preco === "todas");
  if (reais && reais.n < 30) console.log(`  (${reais.n} casos: abaixo de 30 não se publica)`);
}

async function ligar(avaliacaoId, preco, data, natureza, fonte, transacaoId) {
  const { data: r, error } = await sb.rpc("imo_backtest_registar", {
    p_avaliacao: avaliacaoId, p_preco_real: preco, p_data: data ?? new Date().toISOString().slice(0, 10),
    p_natureza: natureza ?? "escritura", p_fonte: fonte ?? null, p_transacao: transacaoId ?? null, p_notas: null,
  });
  if (error) throw new Error(error.message);
  const x = Array.isArray(r) ? r[0] : r;
  return x;
}

async function automatico() {
  const { data: vendas, error } = await sb.from("imo_transacoes")
    .select("id, geografia_id, referencia, tipo, tipologia, area, preco_transacao, data_transacao, natureza, notas")
    .eq("fonte_id", "terrae").eq("natureza", "escritura").not("preco_transacao", "is", null).order("data_transacao", { ascending: false }).limit(500);
  if (error) { console.error(error.message); return; }
  const { data: jaLigadas } = await sb.from("imo_backtests").select("avaliacao_id, transacao_id");
  const ligadas = new Set((jaLigadas ?? []).map((b) => b.transacao_id).filter(Boolean));
  const avaliacoesLigadas = new Set((jaLigadas ?? []).map((b) => b.avaliacao_id));

  const { data: avals } = await sb.from("imo_avaliacoes")
    .select("id, created_at, geografia_id, cp7, modo, imovel, valor_base, valor_min, valor_max, motor_versao")
    .order("created_at", { ascending: false }).limit(2000);
  console.log(`${(vendas ?? []).length} escrituras da Terrae · ${(avals ?? []).length} avaliações registadas · ${ligadas.size} já ligadas`);

  let novas = 0;
  for (const v of vendas ?? []) {
    if (ligadas.has(v.id)) continue;
    const dataVenda = v.data_transacao ? new Date(v.data_transacao) : null;
    const cpVenda = (String(v.referencia ?? "") + " " + String(v.notas ?? "")).match(/\b\d{4}-\d{3}\b/)?.[0] ?? null;
    const candidatas = (avals ?? []).filter((a) => {
      if (avaliacoesLigadas.has(a.id)) return false;
      if ((a.modo ?? "profundo") !== "profundo") return false;
      const im = a.imovel ?? {};
      if (chave(im.tipo) !== chave(v.tipo)) return false;
      if (classe(im.tipologia) !== classe(v.tipologia)) return false;
      const area = Number(im.area) || 0; if (!(area > 0) || !(v.area > 0)) return false;
      if (Math.abs(area - v.area) / v.area > 0.15) return false;
      if (cpVenda && a.cp7 && a.cp7 !== cpVenda) return false;
      if (!(cpVenda && a.cp7) && a.geografia_id !== v.geografia_id) return false;
      if (dataVenda) {
        const dias = (dataVenda - new Date(a.created_at)) / 86400000;
        if (dias < 0 || dias > 548) return false;
      }
      return true;
    }).sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
    if (!candidatas.length) continue;
    const a = candidatas[0];
    const erro = (a.valor_base - v.preco_transacao) / v.preco_transacao;
    console.log(`  venda ${v.referencia ?? v.id.slice(0, 8)} (${v.tipo} ${v.tipologia} ${v.area} m², ${Number(v.preco_transacao).toLocaleString("pt-PT")} €, ${v.data_transacao}) ↔ avaliação ${a.created_at.slice(0, 10)} ${Number(a.valor_base).toLocaleString("pt-PT")} € [${a.motor_versao}] · erro ${(erro * 100).toFixed(1)}%${cpVenda && a.cp7 ? " · mesmo CP7" : " · mesma geografia"}`);
    if (!soVer) {
      try { await ligar(a.id, v.preco_transacao, v.data_transacao, "escritura", "imo_transacoes", v.id); novas++; avaliacoesLigadas.add(a.id); }
      catch (e) { console.error(`    não liguei: ${e.message}`); }
    }
  }
  console.log(soVer ? "(--ver: nada foi escrito)" : `${novas} pares novos registados.`);
}

async function main() {
  if (args.includes("--metricas")) return metricas();
  const i = args.indexOf("--ligar");
  if (i >= 0) {
    const [id, preco, data, natureza, fonte] = args.slice(i + 1);
    if (!id || !(Number(preco) > 0)) { console.error("Uso: --ligar <avaliacao_id> <preco_real> [data AAAA-MM-DD] [escritura|cpcv|declaracao_cliente|avaliacao_bancaria|proxy] [fonte]"); process.exitCode = 1; return; }
    const r = await ligar(id, Number(preco), data, natureza, fonte, null);
    console.log(`ligado: erro ${(Number(r.erro_percentual) * 100).toFixed(1)}% · dentro do intervalo: ${r.dentro_intervalo ? "sim" : "não"} · ${r.dias} dias depois da avaliação`);
    return metricas();
  }
  await automatico();
  await metricas();
}

await main().catch((e) => { console.error(e?.message ?? String(e)); process.exitCode = 1; });
