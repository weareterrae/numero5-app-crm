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
