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
    console.log(`   conservador ${eur(rep.valor_conservador)} · provável ${eur(rep.valor_provavel)} · otimista ${eur(rep.valor_otimista)}`);
    console.log(`   €/m²: ${rep.eur_m2 ?? rep.valor_m2 ?? "—"} · confiança: ${rep.confianca ?? "—"}`);
    const comp = rep.comparaveis || [];
    console.log(`   comparáveis: ${comp.length}`);
    for (const c of comp.slice(0, 3)) {
      console.log(`      · ${String(c.titulo || c.descricao || "").slice(0, 60)} — ${eur(c.preco)}`);
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
process.exit(1);
