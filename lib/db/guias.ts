import { criarClienteServico } from "@/lib/supabase/server";

/**
 * Nº de Guias da Marca concluídos que o staff ainda não viu.
 * Compara guia_marca->>_concluido_em com profiles.guias_vistos_em.
 * Tolerante: se a coluna (migração 0065) ainda não existir, devolve 0.
 */
export async function contarGuiasNovos(userId: string): Promise<number> {
  try {
    const svc = criarClienteServico();
    let desde: string | null = null;
    try {
      const { data: prof } = await svc.from("profiles").select("guias_vistos_em").eq("id", userId).maybeSingle();
      desde = (prof?.guias_vistos_em as string | null) ?? null;
    } catch {
      return 0; // coluna ainda não existe
    }
    let q = svc.from("clientes").select("id", { count: "exact", head: true }).not("guia_marca->>_concluido_em", "is", null);
    if (desde) q = q.gt("guia_marca->>_concluido_em", desde);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Marca todos os Guias como vistos por este staff (limpa o aviso). */
export async function marcarGuiasVistos(userId: string): Promise<void> {
  try {
    const svc = criarClienteServico();
    await svc.from("profiles").update({ guias_vistos_em: new Date().toISOString() }).eq("id", userId);
  } catch {
    /* coluna pode não existir ainda */
  }
}
