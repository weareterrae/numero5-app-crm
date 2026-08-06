"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { criarClienteServico } from "@/lib/supabase/server";
import { contextoSede } from "@/lib/sede/contexto";
import { avisarStaffAcao } from "@/lib/sede/notificar";

const MAX_ANEXO = 25 * 1024 * 1024; // 25 MB

export type Anexo = { id: string; nome: string; tipo: string | null; tamanho: number | null };

/**
 * Resolve o cliente por TOKEN (link público) ou, na falta dele, pela SESSÃO (Sede).
 * O token é a autorização do link público (padrão /r/[token]).
 */
async function resolverClienteId(token?: string): Promise<string | null> {
  if (token && typeof token === "string" && token.length >= 8) {
    const svc = criarClienteServico();
    const { data } = await svc.from("clientes").select("id").eq("guia_token", token).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  }
  const ctx = await contextoSede();
  return ctx.clienteId;
}

function limpar(dados: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(dados || {})) {
    if (typeof k === "string" && typeof v === "string" && v.trim()) {
      out[k.slice(0, 40)] = v.trim().slice(0, 2000);
    }
  }
  return out;
}

/** Guarda o Guia da Marca (auto-save silencioso). Sessão OU token. */
export async function guardarGuia(dados: Record<string, string>, token?: string): Promise<{ ok: boolean }> {
  const cid = await resolverClienteId(token);
  if (!cid) return { ok: false };
  const svc = criarClienteServico();
  const payload = { ...limpar(dados), _atualizado: new Date().toISOString() };
  const { error } = await svc.from("clientes").update({ guia_marca: payload }).eq("id", cid);
  return { ok: !error };
}

/** Marca como enviado à equipa + nota no histórico. Sessão OU token. */
export async function concluirGuia(dados: Record<string, string>, token?: string): Promise<{ ok: boolean }> {
  const cid = await resolverClienteId(token);
  if (!cid) return { ok: false };
  const svc = criarClienteServico();
  const agora = new Date().toISOString();
  const payload = { ...limpar(dados), _concluido: true, _atualizado: agora, _concluido_em: agora };
  const { error } = await svc.from("clientes").update({ guia_marca: payload }).eq("id", cid);
  if (error) return { ok: false };

  await svc.from("atividades").insert({
    cliente_id: cid,
    tipo: "nota",
    descricao: "O cliente preencheu e enviou o Guia da Marca. 🖐️",
  });
  await avisarStaffAcao({ clienteId: cid, titulo: "preencheu e enviou o Guia da Marca", caminho: "/guias" });
  revalidatePath(token ? `/guia/${token}` : "/sede/guia");
  return { ok: true };
}

/** Anexa um material (bucket materiais + materiais_cliente → aparece na Biblioteca). Sessão OU token. */
export async function anexarMaterialGuia(
  fd: FormData,
  token?: string,
): Promise<{ ok: boolean; anexo?: Anexo; erro?: string }> {
  const cid = await resolverClienteId(token);
  if (!cid) return { ok: false, erro: "sem-cliente" };
  const file = fd.get("ficheiro");
  if (!(file instanceof File) || file.size === 0) return { ok: false, erro: "vazio" };
  if (file.size > MAX_ANEXO) return { ok: false, erro: "grande" };

  const svc = criarClienteServico();
  const seguro = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "ficheiro";
  const caminho = `${cid}/${randomUUID()}-${seguro}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error } = await svc.storage
    .from("materiais")
    .upload(caminho, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return { ok: false, erro: "upload" };

  const { data, error: e2 } = await svc
    .from("materiais_cliente")
    .insert({
      cliente_id: cid,
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

/** Remove um anexo — só se for do cliente resolvido. Sessão OU token. */
export async function removerAnexoGuia(id: string, token?: string): Promise<{ ok: boolean }> {
  const cid = await resolverClienteId(token);
  if (!cid) return { ok: false };
  const svc = criarClienteServico();
  const { data: m } = await svc
    .from("materiais_cliente")
    .select("caminho")
    .eq("id", id)
    .eq("cliente_id", cid)
    .maybeSingle();
  if (m?.caminho) await svc.storage.from("materiais").remove([m.caminho]);
  await svc.from("materiais_cliente").delete().eq("id", id).eq("cliente_id", cid);
  return { ok: true };
}
