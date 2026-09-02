// Aplica uma migração SQL ao Postgres do Nº 5 pela API de gestão do Supabase.
//
//   node scripts/aplicar-migracao.mjs supabase/migrations/0119_imo_api_ferramentas.sql
//   node scripts/aplicar-migracao.mjs supabase/migrations/0119_... --forcar   # mesmo que já conste
//
// PORQUE ISTO EXISTE
//
// O CLI do Supabase não está nesta máquina, e o editor de SQL do dashboard
// parte o texto nos «;», o que corta a meio qualquer função com corpo.
// Isto manda o ficheiro INTEIRO, numa só chamada, ao mesmo endpoint que o
// dashboard usa por baixo, e diz o que o Postgres respondeu.
//
// Recusa-se a repetir uma versão que já esteja em schema_migrations, para
// não se aplicar duas vezes por distração. Com --forcar aplica na mesma
// (as migrações desta casa são idempotentes: create if not exists,
// create or replace, on conflict do nothing).
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const REF = "rycgekqszxyudmchpqvs";              // Nº 5
const ficheiro = process.argv[2];
const forcar = process.argv.includes("--forcar");
if (!ficheiro) { console.error("Falta o ficheiro. Ex: node scripts/aplicar-migracao.mjs supabase/migrations/0119_x.sql"); process.exit(1); }

// O token de gestão vive fora deste repositório, de propósito (o mesmo
// que publicar-funcao.mjs usa).
let token = "";
try {
  const m = readFileSync("C:/Dev/KoolNature/.mcp.json", "utf8").match(/sbp_[A-Za-z0-9]+/);
  if (m) token = m[0];
} catch { /* cai no erro abaixo */ }
if (!token) { console.error("Sem token de gestão do Supabase."); process.exit(1); }

const sql = readFileSync(ficheiro, "utf8");
const versao = (basename(ficheiro).match(/^(\d{4})/) ?? [])[1] ?? null;

async function consulta(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const texto = await r.text();
  let corpo; try { corpo = JSON.parse(texto); } catch { corpo = texto; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${typeof corpo === "string" ? corpo.slice(0, 500) : JSON.stringify(corpo).slice(0, 500)}`);
  return corpo;
}

if (versao && !forcar) {
  const ja = await consulta(`select version from schema_migrations where version = '${versao}'`);
  if (Array.isArray(ja) && ja.length) {
    console.error(`A versão ${versao} já consta em schema_migrations. Para aplicar na mesma: --forcar`);
    process.exit(1);
  }
}

console.log(`${basename(ficheiro)}: ${sql.length} bytes · a aplicar em ${REF}`);
const resultado = await consulta(sql);
console.log("resposta:", JSON.stringify(resultado).slice(0, 300));

if (versao) {
  const agora = await consulta(`select version from schema_migrations where version = '${versao}'`);
  console.log(Array.isArray(agora) && agora.length
    ? `schema_migrations: ${versao} registada`
    : `AVISO: ${versao} não ficou em schema_migrations (a migração termina com o insert?)`);
}
