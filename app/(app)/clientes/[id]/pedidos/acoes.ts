"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const t = (fd: FormData, k: string) => (fd.get(k)?.toString() ?? "").trim();

/** Equipa atualiza o estado / nota de um pedido do cliente. */
export async function atualizarPedido(fd: FormData) {
  const id = t(fd, "id");
  const clienteId = t(fd, "cliente_id");
  const estado = t(fd, "estado");
  if (!id || !["novo", "em_curso", "feito"].includes(estado)) return;

  const supabase = await criarClienteServidor();
  await supabase
    .from("pedidos")
    .update({
      estado,
      nota_equipa: t(fd, "nota_equipa") || null,
      resolvido_em: estado === "feito" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (clienteId) revalidatePath(`/clientes/${clienteId}/pedidos`);
}
