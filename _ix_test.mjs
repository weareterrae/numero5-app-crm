const acc = (process.env.IX_ACC || "").trim();
const key = (process.env.IX_KEY || "").trim();
if (!acc || !key) { console.log("❌ Variáveis não encontradas no Netlify (ACCOUNT: " + (acc?"ok":"falta") + ", KEY: " + (key?"ok":"falta") + ")"); process.exit(0); }
console.log("Conta IX:", acc, "· chave: presente (" + key.length + " chars, não mostrada)");
const r = await fetch(`https://${acc}.app.invoicexpress.com/invoices.json?api_key=${encodeURIComponent(key)}&per_page=1`, { headers: { accept: "application/json" } });
console.log("GET /invoices.json →", r.status, r.statusText);
if (r.ok) {
  const d = await r.json();
  console.log("✓ Ligação OK. Faturas na conta:", d?.pagination?.total_entries ?? "(n/d)");
} else {
  console.log("Detalhe:", (await r.text()).slice(0, 200));
}
