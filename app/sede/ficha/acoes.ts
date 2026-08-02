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
 * Grava só no `clientes` do próprio cliente e regista uma nota em `atividades`.
 */
export async function guardarFichaSede(fd: FormData) {
  const ctx = await contextoSede();
  if (!ctx.clienteId) redirect("/sede/ficha");
  const svc = criarClienteServico();
  const cid = ctx.clienteId;

  // redes: preserva chaves existentes, atualiza as conhecidas.
  const { data: atual } = await svc.from("clientes").select("redes").eq("id", cid).maybeSingle();
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

  // Dados base (sempre existem).
  const nome = t(fd, "nome_marca");
  await svc
    .from("clientes")
    .update({
      ...(nome ? { nome_marca: nome } : {}),
      setor: t(fd, "setor") || null,
      website: t(fd, "website") || null,
      redes,
    })
    .eq("id", cid);

  // Dados fiscais (migração 0018) — update à parte e tolerante: se a coluna
  // ainda não existir, a gravação base não parte.
  await svc
    .from("clientes")
    .update({
      empresa_fiscal: t(fd, "empresa_fiscal") || null,
      nif: t(fd, "nif") || null,
      morada: t(fd, "morada") || null,
      codigo_postal: t(fd, "codigo_postal") || null,
      localidade: t(fd, "localidade") || null,
    })
    .eq("id", cid);

  const recado = t(fd, "recado").slice(0, 800);
  const descricao = recado
    ? `Na Sede, o cliente atualizou a ficha e deixou um recado: «${recado}»`
    : "Na Sede, o cliente atualizou a ficha. 🖐️";
  await svc.from("atividades").insert({ cliente_id: cid, tipo: "nota", descricao });

  revalidatePath("/sede/ficha");
  redirect("/sede/ficha?guardado=1");
}

/** Adiciona um responsável (contacto) — isolado por sessão. */
export async function adicionarResponsavelSede(fd: FormData) {
  const ctx = await contextoSede();
  if (!ctx.clienteId) redirect("/sede/ficha");
  const nome = t(fd, "nome");
  if (!nome) redirect("/sede/ficha");
  const svc = criarClienteServico();
  const cargo = t(fd, "cargo");

  await svc.from("contactos").insert({
    cliente_id: ctx.clienteId,
    nome,
    cargo: cargo || null,
    email: t(fd, "email") || null,
    telefone: t(fd, "telefone") || null,
  });
  await svc.from("atividades").insert({
    cliente_id: ctx.clienteId,
    tipo: "nota",
    descricao: `Na Sede, o cliente adicionou um responsável: ${nome}${cargo ? " (" + cargo + ")" : ""}.`,
  });

  revalidatePath("/sede/ficha");
  redirect("/sede/ficha?guardado=1");
}

/** Remove um responsável — só se pertencer ao cliente da sessão. */
export async function removerResponsavelSede(fd: FormData) {
  const ctx = await contextoSede();
  if (!ctx.clienteId) redirect("/sede/ficha");
  const contactoId = t(fd, "contacto_id");
  if (!contactoId) redirect("/sede/ficha");
  const svc = criarClienteServico();

  await svc.from("contactos").delete().eq("id", contactoId).eq("cliente_id", ctx.clienteId);
  revalidatePath("/sede/ficha");
  redirect("/sede/ficha");
}
