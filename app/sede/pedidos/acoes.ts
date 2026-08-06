"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServico } from "@/lib/supabase/server";
import { contextoSede } from "@/lib/sede/contexto";
import { avisarStaffAcao } from "@/lib/sede/notificar";

const t = (fd: FormData, k: string) => (fd.get(k)?.toString() ?? "").trim();

/** O cliente abre um pedido — isolado por sessão. */
export async function abrirPedidoSede(fd: FormData) {
  const ctx = await contextoSede();
  if (!ctx.clienteId) redirect("/sede/pedidos");
  const texto = t(fd, "texto").slice(0, 1000);
  if (!texto) redirect("/sede/pedidos");
  const svc = criarClienteServico();

  await svc.from("pedidos").insert({ cliente_id: ctx.clienteId, texto, estado: "novo" });
  await svc.from("atividades").insert({
    cliente_id: ctx.clienteId,
    tipo: "nota",
    descricao: `Na Sede, o cliente abriu um pedido: «${texto}»`,
  });
  await avisarStaffAcao({
    clienteId: ctx.clienteId,
    titulo: "abriu um novo pedido",
    detalhe: `«${texto}»`,
    caminho: `/clientes/${ctx.clienteId}/pedidos`,
  });

  revalidatePath("/sede/pedidos");
  redirect("/sede/pedidos?ok=1");
}
