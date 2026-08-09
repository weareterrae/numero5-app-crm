"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Liga/desliga o "plano mensal" de uma conta (quais entram no quadro e no alerta). */
export async function alternarPlanoMensal(formData: FormData) {
  const id = (formData.get("cliente_id") ?? "").toString().trim();
  const ativar = (formData.get("ativar") ?? "").toString() === "1";
  if (!id) return;

  const supabase = await criarClienteServidor();
  await supabase.from("clientes").update({ plano_mensal: ativar }).eq("id", id);
  revalidatePath("/producao");
}

/** Marca (ou desmarca) um plano como "já agendado" — a marca manual, sem depender do Metricool. */
export async function alternarAgendado(formData: FormData) {
  const planoId = (formData.get("plano_id") ?? "").toString().trim();
  const marcar = (formData.get("marcar") ?? "").toString() === "1";
  if (!planoId) return;

  const supabase = await criarClienteServidor();
  await supabase
    .from("planos")
    .update({ agendado_em: marcar ? new Date().toISOString() : null })
    .eq("id", planoId);
  revalidatePath("/producao");
}
