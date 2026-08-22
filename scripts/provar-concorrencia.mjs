// Prova que os contadores aguentam concorrência REAL.
//
// «Vive no Postgres» não significa «não tem race condition». Significa
// apenas que o estado é partilhado. Se a decisão for ler-depois-escrever,
// a janela entre as duas coisas existe na mesma — e é nela que cabem os
// pedidos de uma vaga de tráfego, que é precisamente quando um teto serve
// para alguma coisa.
//
// Testa-se com 10, 50 e 100 chamadas disparadas ao mesmo tempo:
//   · o contador de tráfego deve dar exatamente N;
//   · o orçamento deve autorizar exatamente o que cabe, nem mais um.
//
// Limpa sempre o que criou.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

let falhas = 0;
const conta = (ok, texto) => { if (!ok) falhas++; console.log((ok ? "  OK    " : "  FALHA ") + texto); };

// ---------------------------------------------------------------- tráfego
console.log("\nCONTADOR DE TRÁFEGO (ai_rate_bump)");
for (const n of [10, 50, 100]) {
  const chave = `prova-${n}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await Promise.all(
    Array.from({ length: n }, () =>
      sb.rpc("ai_rate_bump", { p_scope: "ip", p_scope_key: chave, p_window_seconds: 60 })),
  );
  const valores = res.map((r) => r.data).filter((v) => typeof v === "number");
  const maximo = Math.max(...valores);
  const distintos = new Set(valores).size;
  // Cada chamada tem de receber um número DIFERENTE, de 1 a N. Se duas
  // receberem o mesmo, houve incremento perdido — e o limite deixa de o ser.
  conta(maximo === n && distintos === n,
    `${n} simultâneas → máximo ${maximo}, ${distintos} valores distintos (esperado ${n} e ${n})`);
  await sb.from("ai_rate_limits").delete().eq("scope_key", chave);
}

// -------------------------------------------------------------- orçamento
console.log("\nRESERVA DE ORÇAMENTO (ai_budget_reservar)");

const { data: assist } = await sb.from("ai_assistants")
  .select("id, org_id").eq("assistant_key", "juiz-qualidade").single();

// Teto de $1 e reservas de $0,10: exatamente 10 devem passar, hajam quantas
// chamadas houver ao mesmo tempo.
const { data: orc, error: eOrc } = await sb.from("ai_budgets").insert({
  assistant_id: assist.id, daily_limit_usd: 1, monthly_limit_usd: 1000, ativo: true,
}).select("id").single();
if (eOrc) { console.error("não consegui criar o orçamento de teste:", eOrc.message); process.exit(1); }

try {
  for (const n of [10, 50, 100]) {
    // limpa os contadores entre corridas
    await sb.from("ai_budget_counters").delete().eq("budget_id", orc.id);

    const res = await Promise.all(
      Array.from({ length: n }, () =>
        sb.rpc("ai_budget_reservar", {
          p_assistant: assist.id, p_org: assist.org_id, p_estimativa: 0.1,
        })),
    );
    const permitidos = res.filter((r) => r.data?.permitido === true).length;
    const { data: c } = await sb.from("ai_budget_counters")
      .select("spent_usd").eq("budget_id", orc.id).eq("period", "day").maybeSingle();
    const gasto = Number(c?.spent_usd ?? 0);

    // Com teto de $1 e reservas de $0,10 cabem 10. Nem 11.
    conta(permitidos === 10 && Math.abs(gasto - 1) < 0.001,
      `${n} simultâneas com teto $1 → ${permitidos} autorizadas, $${gasto.toFixed(2)} reservado (esperado 10 e $1,00)`);
  }

  // ------------------------------------------------------------- acerto
  console.log("\nACERTO E DEVOLUÇÃO");
  await sb.from("ai_budget_counters").delete().eq("budget_id", orc.id);
  await sb.rpc("ai_budget_reservar", { p_assistant: assist.id, p_org: assist.org_id, p_estimativa: 0.5 });
  await sb.rpc("ai_budget_acertar", {
    p_assistant: assist.id, p_org: assist.org_id, p_reservado: 0.5, p_real: 0.02,
  });
  const { data: c2 } = await sb.from("ai_budget_counters")
    .select("spent_usd").eq("budget_id", orc.id).eq("period", "day").maybeSingle();
  conta(Math.abs(Number(c2?.spent_usd ?? 0) - 0.02) < 0.001,
    `reservou $0,50 · custou $0,02 → contador ficou em $${Number(c2?.spent_usd ?? 0).toFixed(3)} (esperado $0,020)`);

  await sb.rpc("ai_budget_devolver", { p_assistant: assist.id, p_org: assist.org_id, p_reservado: 0.02 });
  const { data: c3 } = await sb.from("ai_budget_counters")
    .select("spent_usd").eq("budget_id", orc.id).eq("period", "day").maybeSingle();
  conta(Number(c3?.spent_usd ?? 0) === 0,
    `devolveu tudo → contador em $${Number(c3?.spent_usd ?? 0).toFixed(3)} (esperado $0,000)`);
} finally {
  // Limpa SEMPRE: um orçamento de teste esquecido com teto de $1 travava
  // o juiz de qualidade em produção sem ninguém perceber porquê.
  await sb.from("ai_budget_counters").delete().eq("budget_id", orc.id);
  await sb.from("ai_budgets").delete().eq("id", orc.id);
  console.log("\n(orçamento de teste removido)");
}

console.log(falhas ? `\n${falhas} FALHAS` : "\nTudo atómico.");
process.exit(falhas ? 1 : 0);
