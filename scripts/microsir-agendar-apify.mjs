// Agenda a colheita mensal do MicroSIR no Apify.
//
//   node scripts/microsir-agendar-apify.mjs
//
// PORQUE NA NUVEM E NÃO NO PORTÁTIL
//
// A colheita corre no Apify por uma razão simples: o portátil pode estar
// desligado no dia 3 de cada mês. O carregamento para o Supabase esse sim
// corre localmente, mas é idempotente — pode correr todos os dias e só
// atualiza o que mudou. Assim, se falhar um dia, o seguinte recupera.
//
// O DIA 3 E AS 4 DA MANHÃ
//
// Dia 3 para o mês anterior já estar fechado do lado deles. Quatro da
// manhã porque é quando um serviço alheio menos dá pela nossa presença —
// 142 pedidos não são nada, mas não é razão para os fazer à hora de ponta.
//
// IDEMPOTENTE: se já existir um agendamento com este nome, é ATUALIZADO.
// Correr isto duas vezes não cria dois agendamentos a colher o mesmo.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

if (!env.APIFY_TOKEN) throw new Error("Falta APIFY_TOKEN no .env.local.");

const NOME = "microsir-aml-mensal";
const ACTOR_ID = "G5IYnCtBFAUDVk4Ve";      // diverting_cheer/microsir
const CRON = "0 4 3 * *";                   // dia 3 de cada mês, 04:00
const FUSO = "Europe/Lisbon";

const ENTRADA = { target: "aml", months: 24, minCoverage: "0" };

async function apify(caminho, opcoes = {}) {
  const r = await fetch(`https://api.apify.com/v2/${caminho}`, {
    ...opcoes,
    headers: {
      authorization: `Bearer ${env.APIFY_TOKEN}`,
      ...(opcoes.body ? { "content-type": "application/json" } : {}),
      ...opcoes.headers,
    },
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Apify ${r.status} em /${caminho}: ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

const corpo = {
  name: NOME,
  title: "MicroSIR · AML mensal",
  description:
    "Colhe os percentis de €/m² das 142 zonas da AML (124 freguesias + 18 concelhos) " +
    "pela conta subscrita. Âmbito: os 18 concelhos da ficha de subscrição de 25-06-2026.",
  cronExpression: CRON,
  timezone: FUSO,
  isEnabled: true,
  // Exclusivo: se a corrida do mês passado ainda estiver de pé por alguma
  // razão, não se lança outra por cima. Dois logins simultâneos com a
  // mesma conta não ajudam ninguém.
  isExclusive: true,
  actions: [{
    type: "RUN_ACTOR",
    actorId: ACTOR_ID,
    runInput: { body: JSON.stringify(ENTRADA, null, 2), contentType: "application/json" },
  }],
};

const { data: lista } = await apify("schedules?limit=1000");
const existente = (lista?.items ?? []).find((s) => s.name === NOME);

let r;
if (existente) {
  console.log(`Já existia (${existente.id}) — a atualizar.`);
  r = await apify(`schedules/${existente.id}`, { method: "PUT", body: JSON.stringify(corpo) });
} else {
  r = await apify("schedules", { method: "POST", body: JSON.stringify(corpo) });
}

const s = r.data ?? r;
console.log("");
console.log(`agendamento:  ${s.name} (${s.id})`);
console.log(`cron:         ${s.cronExpression}  ${s.timezone}`);
console.log(`ativo:        ${s.isEnabled}`);
console.log(`próxima:      ${s.nextRunAt ?? "?"}`);
console.log(`entrada:      ${JSON.stringify(ENTRADA)}`);
