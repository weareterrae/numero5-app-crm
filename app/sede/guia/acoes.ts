"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { criarClienteServico } from "@/lib/supabase/server";
import { contextoSede } from "@/lib/sede/contexto";

const MAX_ANEXO = 25 * 1024 * 1024; // 25 MB

export type Anexo = { id: string; nome: string; tipo: string | null; tamanho: number | null };

/**
 * Guarda o Guia da Marca — autorizado SEMPRE pela sessão (nunca por URL).
 * Grava em `clientes.guia_marca` (jsonb) do próprio cliente. Auto-save silencioso.
 */
export async function guardarGuia(dados: Record<string, string>): Promise<{ ok: boolean }> {
  const ctx = await contextoSede();
  if (!ctx.clienteId) return { ok: false };
  const svc = criarClienteServico();

  const limpo: Record<string, string> = {};
  for (const [k, v] of Object.entries(dados || {})) {
    if (typeof k === "string" && typeof v === "string" && v.trim()) {
      limpo[k.slice(0, 40)] = v.trim().slice(0, 2000);
    }
  }
  const payload = { ...limpo, _atualizado: new Date().toISOString() };
  const { error } = await svc.from("clientes").update({ guia_marca: payload }).eq("id", ctx.clienteId);
  return { ok: !error };
}

/**
 * Marca o guia como enviado à equipa + deixa nota no histórico (para o operador saber).
 */
export async function concluirGuia(dados: Record<string, string>): Promise<{ ok: boolean }> {
  const ctx = await contextoSede();
  if (!ctx.clienteId) return { ok: false };
  const svc = criarClienteServico();

  const limpo: Record<string, string> = {};
  for (const [k, v] of Object.entries(dados || {})) {
    if (typeof k === "string" && typeof v === "string" && v.trim()) {
      limpo[k.slice(0, 40)] = v.trim().slice(0, 2000);
    }
  }
  const payload = { ...limpo, _concluido: true, _atualizado: new Date().toISOString() };
  const { error } = await svc.from("clientes").update({ guia_marca: payload }).eq("id", ctx.clienteId);
  if (error) return { ok: false };

  await svc.from("atividades").insert({
    cliente_id: ctx.clienteId,
    tipo: "nota",
    descricao: "Na Sede, o cliente preencheu e enviou o Guia da Marca. 🖐️",
  });
  revalidatePath("/sede/guia");
  return { ok: true };
}

/**
 * Anexa um material a partir do Guia — vai para o bucket privado `materiais`
 * e para `materiais_cliente` (aparece também na Biblioteca). Devolve o anexo
 * para o cliente atualizar a lista sem recarregar.
 */
export async function anexarMaterialGuia(
  fd: FormData,
): Promise<{ ok: boolean; anexo?: Anexo; erro?: string }> {
  const ctx = await contextoSede();
  if (!ctx.clienteId) return { ok: false, erro: "sem-cliente" };
  const file = fd.get("ficheiro");
  if (!(file instanceof File) || file.size === 0) return { ok: false, erro: "vazio" };
  if (file.size > MAX_ANEXO) return { ok: false, erro: "grande" };

  const svc = criarClienteServico();
  const seguro = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "ficheiro";
  const caminho = `${ctx.clienteId}/${randomUUID()}-${seguro}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error } = await svc.storage
    .from("materiais")
    .upload(caminho, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return { ok: false, erro: "upload" };

  const { data, error: e2 } = await svc
    .from("materiais_cliente")
    .insert({
      cliente_id: ctx.clienteId,
      nome: file.name.slice(0, 120),
      caminho,
      tipo: file.type || null,
      tamanho: file.size,
    })
    .select("id, nome, tipo, tamanho")
    .single();
  if (e2 || !data) return { ok: false, erro: "registo" };

  return { ok: true, anexo: data as Anexo };
}

/** Remove um anexo — só se for do cliente da sessão. */
export async function removerAnexoGuia(id: string): Promise<{ ok: boolean }> {
  const ctx = await contextoSede();
  if (!ctx.clienteId) return { ok: false };
  const svc = criarClienteServico();
  const { data: m } = await svc
    .from("materiais_cliente")
    .select("caminho")
    .eq("id", id)
    .eq("cliente_id", ctx.clienteId)
    .maybeSingle();
  if (m?.caminho) await svc.storage.from("materiais").remove([m.caminho]);
  await svc.from("materiais_cliente").delete().eq("id", id).eq("cliente_id", ctx.clienteId);
  return { ok: true };
}
