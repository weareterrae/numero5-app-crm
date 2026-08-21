// =====================================================================
// Utilitários partilhados pelos adaptadores.
// APIs Web standard apenas — ver nota de portabilidade em types.ts.
// =====================================================================

/**
 * Classificação de erros do fornecedor.
 *
 * Lição de 21/08/2026: um 404 pode significar "modelo desligado
 * globalmente" (gemini-2.0-flash) OU "a tua conta não tem acesso"
 * (gemini-2.5-pro). Nos dois casos não vale a pena repetir no MESMO
 * modelo — mas vale sempre a pena tentar o modelo seguinte da cadeia.
 * Por isso 404 é 'permanent' (não repetir aqui) e o router avança.
 */
export function classifyStatus(status: number): "transient" | "permanent" {
  // 408 timeout · 425 too early · 429 rate limit · 5xx do fornecedor
  if (status === 408 || status === 425 || status === 429 || status >= 500) return "transient";
  return "permanent";
}

/**
 * Timeout que compõe com um AbortSignal externo, sem depender de
 * AbortSignal.any() (que não existe em todos os runtimes).
 * Devolve o signal a usar e um `done()` que limpa o temporizador —
 * chamar SEMPRE num finally, senão fica um timer pendurado.
 */
export function withTimeout(
  timeoutMs: number,
  external?: AbortSignal,
): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);

  const onExternalAbort = () => ctrl.abort(external?.reason);
  if (external) {
    if (external.aborted) ctrl.abort(external.reason);
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }

  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

/** Custo estimado em USD a partir dos preços por 1M de tokens do registo. */
export function estimateCost(
  usage: { input?: number; output?: number; cached?: number } | undefined,
  prices: { input_cost: number | null; output_cost: number | null; cached_input_cost: number | null },
): number | undefined {
  if (!usage) return undefined;
  const { input_cost, output_cost, cached_input_cost } = prices;
  if (input_cost == null && output_cost == null) return undefined;
  const M = 1_000_000;
  // Tokens em cache pagam tarifa própria; se não houver, contam como input.
  const cached = usage.cached ?? 0;
  const freshInput = Math.max(0, (usage.input ?? 0) - cached);
  const cIn = ((input_cost ?? 0) * freshInput) / M;
  const cCached = ((cached_input_cost ?? input_cost ?? 0) * cached) / M;
  const cOut = ((output_cost ?? 0) * (usage.output ?? 0)) / M;
  return Number((cIn + cCached + cOut).toFixed(6));
}
