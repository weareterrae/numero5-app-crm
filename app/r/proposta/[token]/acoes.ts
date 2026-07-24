"use server";

import { criarClienteServico } from "@/lib/supabase/server";

/**
 * O cliente decide a proposta a partir da página pública. Sem sessão: o
 * token é a chave. Ao marcar 'aceite' ou 'recusada', os gatilhos da base
 * de dados tratam do resto (mover o cliente no funil, criar a avença).
 */
export async function decidirProposta(
  token: string,
  decisao: "aceite" | "recusada",
  nota: string,
) {
  if (!token || !["aceite", "recusada"].includes(decisao)) {
    return { ok: false as const, erro: "Pedido inválido." };
  }

  const supabase = criarClienteServico();
  const { data: p } = await supabase
    .from("propostas")
    .select("id, estado")
    .eq("partilha_token", token)
    .eq("partilha_ativa", true)
    .maybeSingle();
  if (!p) return { ok: false as const, erro: "Proposta não encontrada." };

  // Já decidida — não se decide duas vezes.
  if (p.estado === "aceite" || p.estado === "recusada") {
    return { ok: true as const, jaDecidida: true, estado: p.estado };
  }

  const comentario = (nota ?? "").trim() || null;
  const patch: Record<string, unknown> = {
    estado: decisao,
    decidida_em: new Date().toISOString(),
    nota_decisao: comentario,
  };
  if (decisao === "recusada") patch.motivo_recusa = comentario;

  const { error } = await supabase.from("propostas").update(patch).eq("id", p.id);
  if (error) return { ok: false as const, erro: "Não foi possível registar. Tenta de novo." };

  return { ok: true as const, estado: decisao };
}
