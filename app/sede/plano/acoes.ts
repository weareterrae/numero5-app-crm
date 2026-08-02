"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServico } from "@/lib/supabase/server";
import { contextoSede } from "@/lib/sede/contexto";

type Decisao = "aprovado" | "alteracoes" | "recusado";
type Res = { ok: true; estado?: string; jaDecidido?: boolean } | { ok: false; erro: string };

/**
 * Decisão do plano na Sede — autorizada pela SESSÃO (não por token).
 * O plano tem de pertencer ao cliente resolvido em `contextoSede()`.
 */
export async function decidirPlanoSede(planoId: string, decisao: Decisao, nota: string): Promise<Res> {
  if (!["aprovado", "alteracoes", "recusado"].includes(decisao)) {
    return { ok: false, erro: "Decisão inválida." };
  }
  const ctx = await contextoSede();
  if (!ctx.clienteId) return { ok: false, erro: "Ainda não há plano ligado à tua conta." };

  const svc = criarClienteServico();
  const { data: plano } = await svc
    .from("planos")
    .select("id, cliente_id, estado")
    .eq("id", planoId)
    .eq("cliente_id", ctx.clienteId) // isolamento: só o plano do próprio cliente
    .maybeSingle();
  if (!plano) return { ok: false, erro: "Plano não encontrado." };

  // "alteracoes" não é terminal — pode decidir de novo depois.
  if (plano.estado === "aprovado" || plano.estado === "recusado") {
    return { ok: true, jaDecidido: true, estado: plano.estado };
  }

  const comentario = (nota ?? "").trim() || null;
  const { error } = await svc
    .from("planos")
    .update({ estado: decisao, decidido_em: new Date().toISOString(), nota_cliente: comentario })
    .eq("id", plano.id)
    .eq("cliente_id", ctx.clienteId);
  if (error) return { ok: false, erro: "Não foi possível registar. Tenta de novo." };

  const rotulo =
    decisao === "aprovado"
      ? "aprovou o plano"
      : decisao === "alteracoes"
        ? "pediu alterações ao plano"
        : "não quer avançar com o plano";
  await svc.from("atividades").insert({
    cliente_id: plano.cliente_id,
    tipo: "nota",
    descricao: `Na Sede, o cliente ${rotulo}.${comentario ? ` Disse: «${comentario}»` : ""}`,
  });

  revalidatePath("/sede/plano");
  return { ok: true, estado: decisao };
}
