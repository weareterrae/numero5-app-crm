// Corre o Mapa de Oportunidade como um visitante, do princípio ao fim.
//
// Dispara o cálculo em 2.º plano e consulta o resultado como a página faz,
// de 3 em 3 segundos, até 4,5 minutos. É o teste que faltava: os vigias
// provam que o motor responde, não que ESTE fluxo chega ao fim.
//
// Não envia email — sem `email` nos dados, o worker só calcula e guarda em
// cache, que é o passo do ecrã. Nenhum lead falso entra no CRM.
const BASE = "https://terrae.pt/.netlify/functions";

// O caso real que falhou: moradia T4 em Carnaxide.
const evento = "prova-" + Math.random().toString(36).slice(2, 10);
const dados = {
  event_id: evento,
  "imovel-tipo": "Moradia",
  tipologia: "T4",
  area: "210",
  lote: "400",
  "ano-construcao": "2004",
  estado: "Bom",
  extras: "garagem para 2 carros, jardim, lareira",
  morada: "Carnaxide",
  zona: "Carnaxide",
  concelho: "Oeiras",
  // sem email: só o cálculo para o ecrã
};

const t0 = Date.now();
const r = await fetch(`${BASE}/avaliacao-report-background`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://terrae.pt" },
  body: JSON.stringify(dados),
});
console.log(`disparado: http ${r.status} · id ${evento}`);

let tentativas = 0;
const MAX = 95;   // igual ao da página
await new Promise((s) => setTimeout(s, 2500));

while (tentativas < MAX) {
  const j = await fetch(`${BASE}/avaliacao-result?id=${encodeURIComponent(evento)}`, {
    cache: "no-store",
  }).then((x) => x.json()).catch(() => ({}));

  if (j?.ready && j.report) {
    const s = Math.round((Date.now() - t0) / 1000);
    const rep = j.report;
    const eur = (v) => (v ? Number(v).toLocaleString("pt-PT") + " €" : "—");
    console.log(`\nRELATÓRIO PRONTO em ${s}s (a página espera até 285s)\n`);
    // Nomes REAIS dos campos, lidos do site (min/max/eur_m, não
    // valor_provavel/valor_otimista, que não existem). Um teste que lê
    // campos errados diz "—" e parece uma avaria que não há.
    console.log(`   intervalo ${eur(rep.min)} – ${eur(rep.max)} · conservador ${eur(rep.valor_conservador)}`);
    console.log(`   orientação de venda ${eur(rep.orientacao_min)} – ${eur(rep.orientacao_max)} · €/m² ${rep.eur_m ?? "—"}`);
    console.log(`   confiança: ${rep.confianca_label ?? rep.confianca ?? "—"} · liquidez: ${rep.liquidez ?? "—"}`);
    const comp = rep.comparaveis || [];
    console.log(`   comparáveis: ${comp.length}`);
    for (const c of comp.slice(0, 3)) {
      console.log(`      · ${String(c.titulo || c.descricao || "").slice(0, 55)} — ${eur(c.preco_eur ?? c.preco)}`);
    }
    const campos = Object.keys(rep).length;
    console.log(`   campos no relatório: ${campos}`);
    process.exit(0);
  }
  if (j?.unavailable) { console.log("\ncache indisponível: " + j.error); process.exit(1); }

  tentativas++;
  if (tentativas % 10 === 0) console.log(`   ...${Math.round((Date.now() - t0) / 1000)}s`);
  await new Promise((s) => setTimeout(s, 3000));
}
console.log(`\nDESISTIU ao fim de ${Math.round((Date.now() - t0) / 1000)}s — é o que o visitante vê.`);
// O rasto do worker: é aqui que ele diz PORQUE não produziu relatório.
// Sem isto restava adivinhar, porque o console.log desta função não chega
// aos registos do Netlify.
const porque = await fetch(`${BASE}/avaliacao-result?id=${encodeURIComponent(evento + "-porque")}`, {
  cache: "no-store",
}).then((x) => x.json()).catch(() => ({}));
console.log(porque?.ready
  ? "motivo registado pelo worker: " + JSON.stringify(porque.report)
  : "o worker não registou motivo — ou ainda está a trabalhar, ou morreu sem chegar lá.");
process.exit(1);
