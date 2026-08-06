"use server";

import { criarClienteServico } from "@/lib/supabase/server";
import { avisarStaffAcao } from "@/lib/sede/notificar";

/** O cliente decide o plano na página pública. Sem sessão: o token é a chave. */
export async function decidirPlano(
  token: string,
  decisao: "aprovado" | "alteracoes" | "recusado",
  nota: string,
) {
  if (!token || !["aprovado", "alteracoes", "recusado"].includes(decisao)) {
    return { ok: false as const, erro: "Pedido inválido." };
  }

  const supabase = criarClienteServico();
  const { data: plano } = await supabase
    .from("planos")
    .select("id, cliente_id, estado")
    .eq("partilha_token", token)
    .eq("partilha_ativa", true)
    .maybeSingle();
  if (!plano) return { ok: false as const, erro: "Plano não encontrado." };

  // Pedir alterações não é decisão final — pode voltar a decidir depois.
  if (plano.estado === "aprovado" || plano.estado === "recusado") {
    return { ok: true as const, jaDecidido: true, estado: plano.estado };
  }

  const comentario = (nota ?? "").trim() || null;
  const { error } = await supabase
    .from("planos")
    .update({
      estado: decisao,
      decidido_em: new Date().toISOString(),
      nota_cliente: comentario,
    })
    .eq("id", plano.id);
  if (error) return { ok: false as const, erro: "Não foi possível registar. Tenta de novo." };

  // Deixar rasto na timeline do cliente.
  const rotulo =
    decisao === "aprovado"
      ? "aprovou o plano"
      : decisao === "recusado"
        ? "recusou o plano"
        : "pediu alterações ao plano";
  await supabase.from("atividades").insert({
    cliente_id: plano.cliente_id,
    tipo: "nota",
    descricao: `O cliente ${rotulo}.${comentario ? ` Disse: «${comentario}»` : ""}`,
  });

  await avisarStaffAcao({
    clienteId: plano.cliente_id,
    titulo: `${rotulo} mensal`,
    detalhe: comentario ? `Comentário: «${comentario}»` : undefined,
  });

  return { ok: true as const, estado: decisao };
}
