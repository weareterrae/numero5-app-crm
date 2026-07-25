"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CONSENTIMENTOS_PORTEFOLIO } from "@/lib/dominio/operacao";

/** Guarda as autorizações de portefólio (checkboxes). Nada entra sem isto. */
export async function guardarPortefolio(formData: FormData) {
  const clienteId = (formData.get("cliente_id") ?? "").toString();
  if (!clienteId) return;

  const portefolio: Record<string, boolean> = {};
  for (const [chave] of CONSENTIMENTOS_PORTEFOLIO) {
    portefolio[chave] = formData.get(chave) === "on";
  }

  const supabase = await criarClienteServidor();
  await supabase.from("clientes").update({ portefolio }).eq("id", clienteId);
  revalidatePath(`/clientes/${clienteId}/autorizacoes`);
  revalidatePath(`/clientes/${clienteId}`);
}
