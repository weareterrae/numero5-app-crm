// Leva os preços da habitação do INE para a camada de dados.
//
//   node scripts/imo-carregar-ine.mjs           # a série toda, para as zonas que temos
//   node scripts/imo-carregar-ine.mjs --ver     # só mostra, não grava
//
// O QUE É
//
// INE, «Preços da habitação ao nível local» (indicador 0012234): mediana
// do €/m² de alojamentos familiares transaccionados, por concelho e
// freguesia, trimestral, sobre área bruta privativa. Publica-se com 3 a
// 6 meses de atraso e só onde há 33 ou mais vendas no período.
//
// PORQUE VAI PARA A BASE
//
// O site tinha o INE cravado num ficheiro (4T2025) e usava-o como última
// rede quando o MicroSIR não chegava. Na base, o INE entra pela mesma
// regra que tudo o resto (imo_benchmark: tipologia > tipo > período mais
// recente > amostra), fica datado, acumula série, e a mesma regra que
// prefere o MicroSIR de Setembro ao PDF de Junho prefere-o ao INE de
// Dezembro. Onde o MicroSIR não tem linha, o INE serve, e diz que é INE.
//
// AMOSTRA: o INE não publica o número de vendas, mas garante que é 33 ou
// mais. Grava-se 33 como piso, com a marca em extra.n_minimo_publicacao,
// para a regra de amostra mínima (8) não deixar o INE de fora.
//
// Fonte: INE, I.P., Preços da habitação ao nível local. Dados abertos.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const soVer = process.argv.includes("--ver");

const VARCD = "0012234";
const API = `https://www.ine.pt/ine/json_indicador/pindica.jsp?op=1&varcd=${VARCD}&lang=PT`;
const CAT_TOTAL = "H1";          // dim_3: Total do alojamento familiar
const LEN_CONCELHO = 7, LEN_FREGUESIA = 9;

// Sem acentos, sem pontuação (o INE escreve «X, Y e Z» e a CAOP às vezes
// não), sem o prefixo «união das freguesias de/do».
const chave = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[-–—,.;:()]/g, " ").replace(/\s+/g, " ").trim()
  .replace(/^uniao das freguesias d[eao]s? /, "");
function periodoDe(label) {
  // «4.º Trimestre de 2025» → { periodo: '2025-Q4', fim: '2025-12-31' }
  const m = String(label).match(/(\d)\D+Trimestre de (\d{4})/i);
  if (!m) return null;
  const q = Number(m[1]), ano = Number(m[2]);
  const fim = new Date(Date.UTC(ano, q * 3, 0));
  return { periodo: `${ano}-Q${q}`, fim: fim.toISOString().slice(0, 10) };
}

async function main() {
  console.log("a pedir a série ao INE…");
  const r = await fetch(API, { signal: AbortSignal.timeout(60000), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`INE HTTP ${r.status}`);
  const arr = await r.json();
  const ind = Array.isArray(arr) ? arr[0] : arr;
  if (!ind?.Pref) throw new Error("série indisponível: " + JSON.stringify(ind?.Sucesso ?? ind).slice(0, 200));
  const periodos = Object.keys(ind.Pref);
  console.log(`${periodos.length} períodos: ${periodos[0]} … ${periodos[periodos.length - 1]}`);

  // As nossas geografias: concelhos e freguesias da AML.
  const { data: geos } = await sb.from("imo_geografias").select("id, nivel, nome, pai_id").in("nivel", ["concelho", "freguesia"]).eq("ativo", true);
  const concelhos = (geos ?? []).filter((g) => g.nivel === "concelho");
  const porConcelho = Object.fromEntries(concelhos.map((c) => [chave(c.nome), c]));
  const freguesias = (geos ?? []).filter((g) => g.nivel === "freguesia");
  const fregPorChave = {};
  for (const f of freguesias) {
    const pai = concelhos.find((c) => c.id === f.pai_id);
    fregPorChave[`${chave(pai?.nome)}|${chave(f.nome)}`] = f;
  }

  const linhas = []; const semGeo = new Set();
  for (const label of periodos) {
    const p = periodoDe(label); if (!p) continue;
    const rows = (ind.Pref[label] ?? []).filter((x) => x.dim_3 === CAT_TOTAL);
    const nomeConc = {};
    for (const x of rows) if (x.geocod.length === LEN_CONCELHO) nomeConc[x.geocod] = x.geodsg;
    for (const x of rows) {
      const val = x.valor != null && String(x.valor).trim() !== "" ? Number(x.valor) : null;
      if (!(val > 0)) continue;
      let geo = null;
      if (x.geocod.length === LEN_CONCELHO) geo = porConcelho[chave(x.geodsg)] ?? null;
      else if (x.geocod.length === LEN_FREGUESIA) {
        const conc = nomeConc[x.geocod.slice(0, LEN_CONCELHO)]; if (!conc) continue;
        const kc = chave(conc);
        if (!porConcelho[kc]) continue;             // fora da AML
        geo = fregPorChave[`${kc}|${chave(x.geodsg)}`] ?? null;
        if (!geo) {
          // UNIÕES DE FREGUESIAS. O INE publica «União das freguesias de
          // Queluz e Belas»; a nossa hierarquia (a do SIR) tem Queluz e
          // Belas separadas. O valor da união é o melhor que o INE tem
          // para cada parte: grava-se uma linha por parte, com a união em
          // extra.uniao_ine para nunca passar por medição própria da
          // freguesia. Sintra (3 uniões) e Seixal (1) a 7 Set 2026.
          const partes = String(x.geodsg).replace(/^Uni[ãa]o das freguesias d[eao]s? /i, "").split(/,| e /).map(chave).filter(Boolean);
          const achadas = [];
          for (const parte of partes) {
            let f = fregPorChave[`${kc}|${parte}`] ?? null;
            if (!f) {
              // «Aldeia de Paio Pires» vs «Paio Pires»: uma contém a outra.
              const cands = Object.entries(fregPorChave).filter(([k]) => k.startsWith(`${kc}|`))
                .map(([k, g]) => ({ k: k.split("|")[1], g }))
                .filter(({ k }) => k.length >= 5 && parte.length >= 5 && (parte.includes(k) || k.includes(parte)));
              if (cands.length === 1) f = cands[0].g;
            }
            if (f && !achadas.includes(f)) achadas.push(f);
          }
          if (!achadas.length) { semGeo.add(`${conc} · ${x.geodsg}`); continue; }
          for (const f of achadas) {
            linhas.push({
              fonte_id: "ine", geografia_id: f.id, tipo_imovel: "", tipologia: "",
              periodo: p.periodo, periodo_fim: p.fim,
              eur_m2_mediano: val, n_transacoes: 33,
              extra: { natureza: "transacao", area_base: "bruta privativa", n_minimo_publicacao: true,
                       indicador: VARCD, categoria: "Total", trimestre_label: label,
                       uniao_ine: x.geodsg, nota: "valor publicado pelo INE para a união de freguesias, aplicado a esta parte",
                       atribuicao: "Instituto Nacional de Estatística" },
            });
          }
          continue;
        }
      } else continue;
      if (!geo) continue;
      linhas.push({
        fonte_id: "ine", geografia_id: geo.id, tipo_imovel: "", tipologia: "",
        periodo: p.periodo, periodo_fim: p.fim,
        eur_m2_mediano: val, n_transacoes: 33,
        extra: { natureza: "transacao", area_base: "bruta privativa", n_minimo_publicacao: true,
                 indicador: VARCD, categoria: "Total", trimestre_label: label,
                 atribuicao: "Instituto Nacional de Estatística" },
      });
    }
  }
  const zonas = new Set(linhas.map((l) => l.geografia_id));
  console.log(`${linhas.length} linhas INE para ${zonas.size} zonas da AML (${linhas.filter((l) => l.periodo === periodoDe(periodos[periodos.length - 1])?.periodo).length} no último trimestre)`);
  if (semGeo.size) console.log(`  ${semGeo.size} freguesias do INE sem correspondência (ex.: ${[...semGeo].slice(0, 4).join("; ")})`);
  if (soVer) { console.log("(--ver: nada gravado)"); return; }

  let gravadas = 0;
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await sb.from("imo_benchmarks").upsert(linhas.slice(i, i + 500), { onConflict: "fonte_id,geografia_id,tipo_imovel,tipologia,periodo" });
    if (error) { console.error(`lote ${i / 500 + 1}: ${error.message}`); process.exitCode = 1; return; }
    gravadas += Math.min(500, linhas.length - i);
  }
  console.log(`${gravadas} linhas gravadas em imo_benchmarks (fonte ine).`);
  console.log("Fonte: INE, I.P., Preços da habitação ao nível local (indicador 0012234).");
}

await main().catch((e) => { console.error(e?.message ?? String(e)); process.exitCode = 1; });
