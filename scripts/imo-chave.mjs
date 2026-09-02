// Chaves da imo-api: criar, listar, revogar.
//
//   node scripts/imo-chave.mjs criar "Assistente do Nuno" --dono "Nuno Santos"
//   node scripts/imo-chave.mjs criar "Make · alertas" --dono "Nuno Santos" --vendas --enfileirar --minuto 30 --dia 500
//   node scripts/imo-chave.mjs criar "Widget interno" --origens https://app.numerocinco.pt
//   node scripts/imo-chave.mjs listar
//   node scripts/imo-chave.mjs revogar imo_ab12cd34
//
// A CHAVE APARECE UMA VEZ, aqui, e nunca mais: a base só guarda o SHA-256.
// Quem a perde pede outra; não há como a recuperar. É o Sandro que a
// entrega à pessoa da ferramenta, por um canal que não seja este chat.
//
// Corre no portátil com a chave de serviço do .env.local, como os outros
// scripts desta pasta. Não há endpoint para criar chaves de propósito: uma
// API que cria as suas próprias chaves é uma API com uma porta a mais.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const [accao, ...resto] = process.argv.slice(2);
const COM_VALOR = new Set(["dono", "origens", "minuto", "dia", "notas"]);
const opcao = (nome) => { const i = resto.indexOf(`--${nome}`); return i >= 0 ? resto[i + 1] ?? null : null; };
const flag = (nome) => resto.includes(`--${nome}`);
// O que não é opção nem valor de opção: o nome (criar) ou o prefixo (revogar).
const posicionais = resto.filter((a, i) =>
  !a.startsWith("--") && !(i > 0 && resto[i - 1].startsWith("--") && COM_VALOR.has(resto[i - 1].slice(2))));

function falhar(m) { console.error(m); process.exitCode = 1; }

async function criar() {
  const nome = posicionais[0];
  if (!nome) return falhar('Falta o nome. Ex: node scripts/imo-chave.mjs criar "Assistente do Nuno" --dono "Nuno Santos"');
  const chave = "imo_" + randomBytes(24).toString("hex");            // imo_ + 48 hex
  const chave_hash = createHash("sha256").update(chave).digest("hex");
  const linha = {
    nome,
    dono: opcao("dono"),
    chave_hash,
    prefixo: chave.slice(0, 12),
    allowed_origins: (opcao("origens") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    permite_vendas_terrae: flag("vendas"),
    permite_enfileirar: flag("enfileirar"),
    limite_minuto: Number(opcao("minuto")) || 60,
    limite_dia: Number(opcao("dia")) || 2000,
    notas: opcao("notas"),
  };
  const { data, error } = await sb.from("imo_ferramentas").insert(linha).select("id,nome,prefixo").single();
  if (error) return falhar(`não consegui criar: ${error.message}`);
  console.log(`\nFerramenta «${data.nome}» criada (${data.prefixo}…).`);
  console.log(`  vendas Terrae: ${linha.permite_vendas_terrae ? "sim" : "não"} · enfileirar: ${linha.permite_enfileirar ? "sim" : "não"} · ${linha.limite_minuto}/min · ${linha.limite_dia}/dia` +
    (linha.allowed_origins.length ? ` · origens: ${linha.allowed_origins.join(", ")}` : " · servidor (sem browser)"));
  console.log("\nA CHAVE, uma única vez. Guarda-a agora:\n");
  console.log(`  ${chave}\n`);
  console.log("Como se usa:  Authorization: Bearer <chave>   (ou o header X-Imo-Key)");
}

async function listar() {
  const { data, error } = await sb.from("imo_ferramentas")
    .select("prefixo,nome,dono,ativo,permite_vendas_terrae,permite_enfileirar,limite_minuto,limite_dia,pedidos_total,ultima_utilizacao,allowed_origins,revogada_em")
    .order("created_at");
  if (error) return falhar(error.message);
  if (!data.length) { console.log("Sem ferramentas."); return; }
  for (const f of data) {
    console.log(`${f.prefixo}…  ${f.ativo ? "activa " : "REVOGADA"}  ${f.nome}${f.dono ? ` (${f.dono})` : ""}` +
      `  vendas=${f.permite_vendas_terrae ? "s" : "n"} fila=${f.permite_enfileirar ? "s" : "n"} ${f.limite_minuto}/min ${f.limite_dia}/dia` +
      `  pedidos=${f.pedidos_total}${f.ultima_utilizacao ? ` último=${f.ultima_utilizacao.slice(0, 16)}` : ""}` +
      (f.allowed_origins?.length ? `  origens=${f.allowed_origins.join(",")}` : ""));
  }
}

async function revogar() {
  const prefixo = posicionais[0];
  if (!prefixo) return falhar("Falta o prefixo (os primeiros 12 caracteres da chave, ver «listar»).");
  const { data, error } = await sb.from("imo_ferramentas")
    .update({ ativo: false, revogada_em: new Date().toISOString() })
    .eq("prefixo", prefixo.slice(0, 12)).eq("ativo", true).select("nome");
  if (error) return falhar(error.message);
  if (!data.length) return falhar("Nenhuma ferramenta activa com esse prefixo.");
  console.log(`Revogada: ${data.map((d) => d.nome).join(", ")}. A partir de agora responde 401.`);
}

if (accao === "criar") await criar();
else if (accao === "listar") await listar();
else if (accao === "revogar") await revogar();
else falhar("Uso: node scripts/imo-chave.mjs criar|listar|revogar …");
