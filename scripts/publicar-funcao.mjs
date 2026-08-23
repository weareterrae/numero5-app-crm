// Publica uma função Edge do Nº 5.
//
//   node scripts/publicar-funcao.mjs imo-dados
//
// PORQUE ISTO EXISTE
//
// O CLI do Supabase não está instalado nesta máquina, e as publicações
// destas funções andavam a ser feitas por scripts `_dep.mjs` de uma vez
// só, com o patch escrito lá dentro. Isso resolve o dia e não resolve o
// mês seguinte: o próximo a publicar volta a escrever outro.
//
// Isto publica o ficheiro que está no repositório — que é a única versão
// que alguém reviu — e CONFIRMA que chegou. Publicar sem confirmar é o
// erro que já custou um dia inteiro neste projeto: doze publicações, zero
// confirmações, e o build partido desde a manhã.
import { readFileSync } from "node:fs";

const REF = "rycgekqszxyudmchpqvs";              // Nº 5
const slug = process.argv[2];
if (!slug) { console.error("Falta o nome da função. Ex: node scripts/publicar-funcao.mjs imo-dados"); process.exit(1); }

// O token de gestão vive fora deste repositório, de propósito.
let token = "";
try {
  const raw = readFileSync("C:/Dev/KoolNature/.mcp.json", "utf8");
  const m = raw.match(/sbp_[A-Za-z0-9]+/);
  if (m) token = m[0];
} catch { /* cai no erro abaixo */ }
if (!token) { console.error("Sem token de gestão do Supabase."); process.exit(1); }

const H = { authorization: `Bearer ${token}` };
const caminho = new URL(`../supabase/functions/${slug}/index.ts`, import.meta.url);
const fonte = readFileSync(caminho, "utf8");

const antes = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/${slug}`, { headers: H })).json();
if (!antes?.version) { console.error(`A função "${slug}" não existe no projeto.`); process.exit(1); }
console.log(`${slug}: versão ${antes.version} · a publicar ${fonte.length} bytes`);

const fd = new FormData();
fd.append("metadata", JSON.stringify({
  entrypoint_path: "index.ts",
  name: slug,
  // Preserva-se o que lá está: mudar verify_jwt sem querer abre ou fecha
  // a função a toda a gente.
  verify_jwt: antes.verify_jwt,
}));
fd.append("file", new Blob([fonte], { type: "application/typescript" }), "index.ts");

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=${slug}`, {
  method: "POST", headers: H, body: fd,
});
const corpo = await r.text();
if (!r.ok) { console.error(`FALHOU HTTP ${r.status}: ${corpo.slice(0, 300)}`); process.exit(1); }

// CONFIRMAR. Um HTTP 200 do deploy diz que o pedido foi aceite, não que a
// versão nova está a servir.
await new Promise((res) => setTimeout(res, 3000));
const depois = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/${slug}`, { headers: H })).json();

console.log(`versão ${antes.version} -> ${depois.version}`);
if (depois.version === antes.version) {
  console.error("A versão NÃO subiu. Não posso dizer que publicou.");
  process.exit(1);
}
console.log(`estado: ${depois.status}`);
