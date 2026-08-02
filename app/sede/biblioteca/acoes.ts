"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServico } from "@/lib/supabase/server";
import { contextoSede } from "@/lib/sede/contexto";

const MAX = 25 * 1024 * 1024; // 25 MB

/** O cliente carrega um material — vai para o bucket privado, isolado por sessão. */
export async function uploadMaterialSede(fd: FormData) {
  const ctx = await contextoSede();
  if (!ctx.clienteId) redirect("/sede/biblioteca");
  const file = fd.get("ficheiro");
  if (!(file instanceof File) || file.size === 0) redirect("/sede/biblioteca");
  if (file.size > MAX) redirect("/sede/biblioteca?erro=grande");

  const svc = criarClienteServico();
  const seguro = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "ficheiro";
  const caminho = `${ctx.clienteId}/${randomUUID()}-${seguro}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error } = await svc.storage
    .from("materiais")
    .upload(caminho, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) redirect("/sede/biblioteca?erro=upload");

  await svc.from("materiais_cliente").insert({
    cliente_id: ctx.clienteId,
    nome: file.name.slice(0, 120),
    caminho,
    tipo: file.type || null,
    tamanho: file.size,
  });
  await svc.from("atividades").insert({
    cliente_id: ctx.clienteId,
    tipo: "nota",
    descricao: `Na Sede, o cliente carregou um material: ${file.name.slice(0, 120)}`,
  });

  revalidatePath("/sede/biblioteca");
  redirect("/sede/biblioteca?ok=1");
}

/** Remove um material — só se for do cliente da sessão. */
export async function removerMaterialSede(fd: FormData) {
  const ctx = await contextoSede();
  if (!ctx.clienteId) redirect("/sede/biblioteca");
  const id = (fd.get("id")?.toString() ?? "").trim();
  if (!id) redirect("/sede/biblioteca");

  const svc = criarClienteServico();
  const { data: m } = await svc
    .from("materiais_cliente")
    .select("caminho")
    .eq("id", id)
    .eq("cliente_id", ctx.clienteId)
    .maybeSingle();
  if (m?.caminho) await svc.storage.from("materiais").remove([m.caminho]);
  await svc.from("materiais_cliente").delete().eq("id", id).eq("cliente_id", ctx.clienteId);

  revalidatePath("/sede/biblioteca");
  redirect("/sede/biblioteca");
}
