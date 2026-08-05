"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServico } from "@/lib/supabase/server";
import { contextoSede } from "@/lib/sede/contexto";

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
