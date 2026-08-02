"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarClienteServico } from "@/lib/supabase/server";
import { contextoSede } from "@/lib/sede/contexto";

function t(fd: FormData, k: string) {
  return (fd.get(k)?.toString() ?? "").trim();
}

const REDES_CHAVES = ["instagram", "facebook", "linkedin", "tiktok"] as const;

/**
 * Guarda a ficha do cliente a partir da Sede — autorizado pela SESSÃO.
 * Grava só no `clientes` do próprio cliente e regista uma nota em `atividades`
 * para a equipa ficar a par na hora.
 */
export async function guardarFichaSede(fd: FormData) {
  const ctx = await contextoSede();
  if (!ctx.clienteId) redirect("/sede/ficha");
  const svc = criarClienteServico();

  // redes: preserva chaves existentes, atualiza só as conhecidas.
  const { data: atual } = await svc
    .from("clientes")
    .select("redes")
    .eq("id", ctx.clienteId)
    .maybeSingle();
  const base =
    atual?.redes && typeof atual.redes === "object" && !Array.isArray(atual.redes)
      ? (atual.redes as Record<string, unknown>)
      : {};
  const redes: Record<string, unknown> = { ...base };
  for (const k of REDES_CHAVES) {
    const v = t(fd, k);
    if (v) redes[k] = v;
    else delete redes[k];
  }

  await svc
    .from("clientes")
    .update({
      setor: t(fd, "setor") || null,
      website: t(fd, "website") || null,
      redes,
    })
    .eq("id", ctx.clienteId);

  const recado = t(fd, "recado").slice(0, 800);
  const descricao = recado
    ? `Na Sede, o cliente atualizou a ficha e deixou um recado: «${recado}»`
    : "Na Sede, o cliente atualizou a ficha. 🖐️";
  await svc.from("atividades").insert({ cliente_id: ctx.clienteId, tipo: "nota", descricao });

  revalidatePath("/sede/ficha");
  redirect("/sede/ficha?guardado=1");
}
