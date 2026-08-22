// Importa os números de um relatório Micro-SIR.
//
// O SIR não exporta tabelas — exporta um relatório em PDF, e o único
// sítio com valores exatos (em vez de gráficos) é a página do Micro-SIR.
// É de lá que vêm estes números.
//
// Não há aqui leitura automática de PDF de propósito. Os valores entram
// declarados, uma vez, e ficam versionados: um erro de leitura automática
// num benchmark não grita — só faz as avaliações daquela zona ficarem
// silenciosamente erradas durante meses. Para meia dúzia de números por
// zona, uma vez por trimestre, a transcrição verificada é mais segura.
//
//   node scripts/imo-importar-relatorio-sir.mjs
//
// TRÊS COISAS QUE AS NOTAS DO RELATÓRIO OBRIGAM A RESPEITAR:
//
// 1. O €/m² é sobre ÁREA BRUTA PRIVATIVA, não área útil. Comparar um
//    €/m² de área bruta com uma área útil sobrevaloriza 10-20%. Fica
//    declarado no benchmark para quem calcula saber.
//
// 2. `Desconto acumulado` e `Price gap` NÃO são a mesma coisa. O desconto
//    é do preço inicial ao final DO MESMO imóvel vendido; o price gap
//    compara o preço médio transacionado com o de oferta de TUDO o que
//    está à venda. O núcleo calcula o segundo — é esse que se guarda em
//    `desconto_medio`.
//
// 3. Os preços são atualizados a valor presente (PVA), homogeneizados por
//    índices locais. Já vêm comparáveis no tempo.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------
// Relatorio-SIR_20260822_1239.pdf · extraído em 22/08/2026
// ---------------------------------------------------------------------
const RELATORIO = {
  ficheiro: "Relatorio-SIR_20260822_1239.pdf",
  periodo: "2026-06",
  periodo_fim: "2026-06-30",
  concelho: "Cascais",
  freguesia: "UF Cascais e Estoril",
  // A micro-zona do SIR é um retângulo desenhado à mão no mapa, não uma
  // divisão oficial. O centróide identifica-a — sem ele, «micro-zona» não
  // quer dizer nada a quem lê o benchmark seis meses depois.
  centroide: { lat: 38.716446, lng: -9.373484 },   // 38°42'59.206"N 9°22'24.541"W
  amostra: 9866,

  // Página do concelho e da freguesia (indicadores de absorção)
  concelho_indicadores: {
    absorcao_meses: 5, desconto_acumulado: -0.074, price_gap: -0.211, yield_bruta: 0.044,
  },
  freguesia_indicadores: {
    absorcao_meses: 5, desconto_acumulado: -0.079, price_gap: -0.266, yield_bruta: 0.046,
  },

  // Página do Micro-SIR — os únicos valores EXATOS do relatório
  eur_m2: {
    p25: 3922, media: 5841, p75: 6857,
    por_tipologia: {
      "apartamento|T1": 6119,
      "apartamento|T2": 5481,
      "apartamento|T3": 5642,
      "apartamento|T4": 7044,   // ≥T4
      "moradia|T3": 5647,       // ≤T3
      "moradia|T4": 6333,       // ≥T4
    },
    novos: 8608, usados: 5050,
  },
};

// ---------------------------------------------------------------------
async function geografia(nivel, nome, paiId, lat, lng) {
  const { data } = await sb.rpc("imo_geo_upsert", {
    p_pai: paiId, p_nivel: nivel, p_nome: nome,
    p_lat: lat ?? null, p_lng: lng ?? null, p_manual: nivel === "microzona",
  });
  return data;
}

const R = RELATORIO;
console.log(`${R.ficheiro} · ${R.concelho} · ${R.periodo}\n`);

// concelho → freguesia → microzona
const { data: concelhoId } = await sb.rpc("imo_geo_por_nome", {
  p_zona: null, p_concelho: R.concelho,
});
if (!concelhoId) { console.error(`Concelho ${R.concelho} não existe na hierarquia.`); process.exit(1); }

const fregId = await geografia("freguesia", R.freguesia, concelhoId);
// O nome da microzona diz de onde veio: um retângulo desenhado, com data.
// Sem isso, daqui a seis meses ninguém sabe que área é esta.
const microNome = `Micro-SIR ${R.freguesia} (${R.periodo})`;
const microId = await geografia("microzona", microNome, fregId, R.centroide.lat, R.centroide.lng);

console.log(`geografia: ${R.concelho} → ${R.freguesia} → ${microNome}`);

// ---------------------------------------------------------------------
// Benchmarks. Um por tipologia, mais o geral.
//
// O `desconto_medio` leva o PRICE GAP, não o desconto acumulado: é o
// price gap que descreve a diferença entre o que se pede no mercado e o
// que se transaciona, que é a correção de que o cálculo precisa.
// ---------------------------------------------------------------------
const base = {
  fonte_id: "sir",
  geografia_id: microId,
  periodo: R.periodo,
  periodo_fim: R.periodo_fim,
  n_transacoes: R.amostra,
  desconto_medio: R.freguesia_indicadores.price_gap,
  tempo_absorcao_dias: R.freguesia_indicadores.absorcao_meses * 30,
  extra: {
    // Tudo o que a avaliação precisa de saber sobre ESTES números para
    // não os usar mal.
    area: "bruta_privativa",
    precos: "atualizados_a_valor_presente",
    desconto_acumulado: R.freguesia_indicadores.desconto_acumulado,
    yield_bruta: R.freguesia_indicadores.yield_bruta,
    eur_m2_novos: R.eur_m2.novos,
    eur_m2_usados: R.eur_m2.usados,
    centroide: R.centroide,
    ficheiro: R.ficheiro,
  },
};

const linhas = [
  // geral da microzona
  {
    ...base, tipo_imovel: "", tipologia: "",
    eur_m2_medio: R.eur_m2.media, eur_m2_p25: R.eur_m2.p25, eur_m2_p75: R.eur_m2.p75,
    // A dispersão sai dos quartis: é a medida que o núcleo usa para a
    // largura da banda, e aqui vem de dados reais em vez de estimada.
    dispersao: Number((((R.eur_m2.p75 - R.eur_m2.p25) / 2) / R.eur_m2.media).toFixed(4)),
  },
  // por tipologia
  ...Object.entries(R.eur_m2.por_tipologia).map(([chave, valor]) => {
    const [tipo, tipologia] = chave.split("|");
    return { ...base, tipo_imovel: tipo, tipologia, eur_m2_medio: valor };
  }),
];

let ok = 0;
for (const l of linhas) {
  const { error } = await sb.from("imo_benchmarks").upsert(l, {
    onConflict: "fonte_id,geografia_id,tipo_imovel,tipologia,periodo",
  });
  const nome = l.tipologia ? `${l.tipo_imovel} ${l.tipologia}` : "geral";
  console.log((error ? "✗ " : "✓ ") + nome.padEnd(18) +
    (error ? error.message : `${l.eur_m2_medio} €/m²`));
  if (!error) ok++;
}

// ---------------------------------------------------------------------
// Também ao nível da freguesia, com os indicadores dela. É o degrau de
// recurso: quando a microzona não servir, é aqui que a hierarquia pousa.
// ---------------------------------------------------------------------
await sb.from("imo_benchmarks").upsert({
  ...base,
  geografia_id: fregId,
  tipo_imovel: "", tipologia: "",
  eur_m2_medio: R.eur_m2.media, eur_m2_p25: R.eur_m2.p25, eur_m2_p75: R.eur_m2.p75,
  dispersao: Number((((R.eur_m2.p75 - R.eur_m2.p25) / 2) / R.eur_m2.media).toFixed(4)),
}, { onConflict: "fonte_id,geografia_id,tipo_imovel,tipologia,periodo" });

console.log(`\n${ok + 1} benchmarks · amostra ${R.amostra} imóveis`);
console.log(`price gap ${(R.freguesia_indicadores.price_gap * 100).toFixed(1)}% · ` +
  `desconto acumulado ${(R.freguesia_indicadores.desconto_acumulado * 100).toFixed(1)}% · ` +
  `absorção ${R.freguesia_indicadores.absorcao_meses} meses`);
console.log("\nATENÇÃO: estes €/m² são sobre ÁREA BRUTA PRIVATIVA.");
console.log("Uma área útil comparada com eles sobrevaloriza 10-20%.");
