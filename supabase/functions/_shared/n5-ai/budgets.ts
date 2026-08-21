// =====================================================================
// Orçamentos duráveis + limites de tráfego
// ---------------------------------------------------------------------
// Acaba com os tetos em memória por instância (o TETO_DIA=800 do
// numerocinco.pt reiniciava a cada arranque a frio, ou seja, não
// protegia nada). Aqui os contadores vivem no Postgres e são atómicos.
//
// Política ao esgotar, configurável por orçamento:
//   BLOCK         → recusa o pedido
//   ROUTE_CHEAPER → deixa passar, mas força o modelo mais barato
// =====================================================================

import type { DbClient } from "./registry.ts";

export type BudgetDecision =
  | { allow: true; forceModelId?: string; reason?: string }
  | { allow: false; reason: string };

/** Chaves de período em UTC, para bater certo com a faturação. */
function periodKeys(now = new Date()) {
  const iso = now.toISOString();
  return { day: iso.slice(0, 10), month: iso.slice(0, 7) };
}

export class Budgets {
  constructor(private readonly db: DbClient) {}

  /**
   * Verifica ANTES de chamar o fornecedor. Está no caminho crítico, por
   * isso é uma única query + no máximo uma leitura de contadores.
   */
  async check(orgId: string | null, assistantId: string): Promise<BudgetDecision> {
    // Orçamento do assistente tem precedência sobre o da org.
    const { data: orcs } = await this.db
      .from("ai_budgets")
      .select("*")
      .or(`assistant_id.eq.${assistantId}${orgId ? `,and(org_id.eq.${orgId},assistant_id.is.null)` : ""}`)
      .eq("ativo", true);

    const lista = (orcs ?? []) as any[];
    if (lista.length === 0) return { allow: true };          // sem teto definido
    const orc = lista.find((o) => o.assistant_id === assistantId) ?? lista[0];

    const { day, month } = periodKeys();
    const { data: contadores } = await this.db
      .from("ai_budget_counters")
      .select("period, period_key, spent_usd")
      .eq("budget_id", orc.id)
      .in("period_key", [day, month]);

    const gasto = (p: string, k: string) =>
      Number((contadores ?? []).find((c: any) => c.period === p && c.period_key === k)?.spent_usd ?? 0);

    const gastoDia = gasto("day", day);
    const gastoMes = gasto("month", month);
    const limDia = orc.daily_limit_usd == null ? null : Number(orc.daily_limit_usd);
    const limMes = orc.monthly_limit_usd == null ? null : Number(orc.monthly_limit_usd);

    const excedeu =
      (limDia != null && gastoDia >= limDia) || (limMes != null && gastoMes >= limMes);

    if (excedeu) {
      await this.incidente(orc, "BUDGET_EXHAUSTED", "crit", gastoDia, gastoMes, limDia, limMes);
      if (orc.exhausted_policy === "BLOCK") {
        return { allow: false, reason: "budget_exceeded" };
      }
      return {
        allow: true,
        forceModelId: orc.cheaper_model_id ?? undefined,
        reason: "budget_exhausted:route_cheaper",
      };
    }

    // Alertas de aproximação — não bloqueiam, avisam.
    const frac = (g: number, l: number | null) => (l && l > 0 ? g / l : 0);
    const pior = Math.max(frac(gastoDia, limDia), frac(gastoMes, limMes));
    if (pior >= Number(orc.critical_threshold)) {
      await this.incidente(orc, "BUDGET_CRITICAL", "crit", gastoDia, gastoMes, limDia, limMes);
    } else if (pior >= Number(orc.soft_threshold)) {
      await this.incidente(orc, "BUDGET_SOFT", "warn", gastoDia, gastoMes, limDia, limMes);
    }

    return { allow: true };
  }

  /**
   * Soma o custo depois da resposta. FORA do caminho crítico — o
   * utilizador nunca espera por contabilidade.
   */
  async commit(orgId: string | null, assistantId: string, costUsd: number): Promise<void> {
    if (!(costUsd > 0)) return;
    try {
      const { data: orcs } = await this.db
        .from("ai_budgets").select("id, assistant_id").eq("ativo", true)
        .or(`assistant_id.eq.${assistantId}${orgId ? `,and(org_id.eq.${orgId},assistant_id.is.null)` : ""}`);
      const lista = (orcs ?? []) as any[];
      if (lista.length === 0) return;
      const orc = lista.find((o) => o.assistant_id === assistantId) ?? lista[0];

      const { day, month } = periodKeys();
      await this.db.rpc("ai_budget_bump", {
        p_budget_id: orc.id, p_period: "day", p_period_key: day, p_cost: costUsd,
      });
      await this.db.rpc("ai_budget_bump", {
        p_budget_id: orc.id, p_period: "month", p_period_key: month, p_cost: costUsd,
      });
    } catch { /* contabilidade nunca derruba nada */ }
  }

  /** Um incidente por tipo por hora — evita encher a tabela de ruído. */
  private async incidente(
    orc: any, tipo: string, sev: string,
    gastoDia: number, gastoMes: number, limDia: number | null, limMes: number | null,
  ) {
    try {
      const desde = new Date(Date.now() - 3600_000).toISOString();
      const { data: recente } = await this.db
        .from("ai_incidents").select("id")
        .eq("tipo", tipo).eq("assistant_id", orc.assistant_id)
        .gte("created_at", desde).limit(1).maybeSingle();
      if (recente) return;
      await this.db.from("ai_incidents").insert({
        tipo, severidade: sev, org_id: orc.org_id, assistant_id: orc.assistant_id,
        titulo: tipo === "BUDGET_EXHAUSTED" ? "Orçamento esgotado" : "Orçamento perto do limite",
        detalhe: { gasto_dia: gastoDia, gasto_mes: gastoMes, limite_dia: limDia, limite_mes: limMes },
      });
    } catch { /* silencioso */ }
  }
}

// ---------------------------------------------------------------------
// Rate limiting — durável, abstraído para poder migrar de Postgres para
// outro backend sem tocar no gateway (mandato: sem Redis sem prova).
// ---------------------------------------------------------------------

export type RateRule = { scope: "ip" | "session" | "assistant" | "org" | "key"; key: string; limit: number; windowSeconds: number };

export interface RateLimiter {
  check(rules: RateRule[]): Promise<{ allow: boolean; scope?: string }>;
}

export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly db: DbClient) {}

  async check(rules: RateRule[]): Promise<{ allow: boolean; scope?: string }> {
    for (const r of rules) {
      if (!r.key) continue;
      try {
        const { data, error } = await this.db.rpc("ai_rate_bump", {
          p_scope: r.scope, p_scope_key: r.key, p_window_seconds: r.windowSeconds,
        });
        if (error) continue;                    // falha do contador não bloqueia visitantes
        if (typeof data === "number" && data > r.limit) return { allow: false, scope: r.scope };
      } catch { /* idem */ }
    }
    return { allow: true };
  }
}

/**
 * Hash do IP — nunca guardamos o IP em claro (minimização RGPD).
 * SHA-256 via WebCrypto, disponível em todos os runtimes alvo.
 */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}
