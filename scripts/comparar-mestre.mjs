// Compara o Mestre pelo caminho ANTIGO (site, Gemini) e pelo NOVO
// (gateway, gpt-5.4-mini) nas mesmas perguntas.
//
// O risco de subir o tráfego não é disponibilidade — isso está coberto
// pelo fallback automático para o legacy. O risco é a VOZ: modelo
// diferente, mesma marca. Isto põe as duas respostas lado a lado para
// se decidir com os olhos, não com fé.
const GATEWAY = "https://rycgekqszxyudmchpqvs.supabase.co/functions/v1/ai-chat";
const LEGACY = "https://linhasgerais.pt/api/mestre";

const PERGUNTAS = [
  "Bom dia. Fazem reabilitacao de predios inteiros?",
  "Quanto custa remodelar um T2 em Lisboa?",
  "Trabalham em Cascais?",
  "Preciso so de pintar uma sala. Fazem?",
];

async function viaGateway(pergunta) {
  const t0 = Date.now();
  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://linhasgerais.pt" },
    body: JSON.stringify({
      assistant_key: "mestre-linhas-gerais",
      messages: [{ role: "user", content: pergunta }],
    }),
  });
  const t = await r.text();
  let texto = "", ttft = null;
  for (const m of t.matchAll(/data: (\{.*\})/g)) {
    try {
      const e = JSON.parse(m[1]);
      if (e.type === "delta") texto += e.text;
      if (e.type === "metadata") ttft = e.data?.ttft_ms;
    } catch { /* */ }
  }
  return { texto: texto.trim(), ttft, total: Date.now() - t0 };
}

async function viaLegacy(pergunta) {
  const t0 = Date.now();
  const r = await fetch(LEGACY, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://linhasgerais.pt" },
    body: JSON.stringify({ messages: [{ role: "user", content: pergunta }] }),
  });
  const j = await r.json().catch(() => ({}));
  return { texto: (j.reply ?? j.error ?? "(sem resposta)").trim(), total: Date.now() - t0, via: j.via };
}

for (const p of PERGUNTAS) {
  console.log("\n" + "═".repeat(74));
  console.log("PERGUNTA: " + p);
  console.log("═".repeat(74));

  const [novo, antigo] = await Promise.all([viaGateway(p), viaLegacy(p)]);

  console.log(`\n── ANTIGO (site · Gemini) ── ${antigo.total}ms${antigo.via ? ` [via ${antigo.via}]` : ""}`);
  console.log(antigo.texto.slice(0, 700));
  console.log(`\n── NOVO (gateway · gpt-5.4-mini) ── TTFT ${novo.ttft ?? "?"}ms · total ${novo.total}ms`);
  console.log(novo.texto.slice(0, 700));
}
console.log("\n" + "═".repeat(74));
