"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};
const n = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  if (s === "") return null;
  const x = Number(s);
  return Number.isFinite(x) ? Math.round(x) : null;
};

/** Quem aprova + regras (jsonb tolerante na ficha do cliente). */
export async function guardarResponsavel(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  if (!clienteId) return;

  const aprovacao = {
    responsavel: t(formData.get("responsavel")),
    suplente: t(formData.get("suplente")),
    email: t(formData.get("email")),
    telefone: t(formData.get("telefone")),
    prazo_dias: n(formData.get("prazo_dias")),
    canais: t(formData.get("canais")),
    validacao_juridica: formData.get("validacao_juridica") === "on",
    validacao_tecnica: formData.get("validacao_tecnica") === "on",
    decisores: n(formData.get("decisores")),
  };

  const supabase = await criarClienteServidor();
  await supabase.from("clientes").update({ aprovacao }).eq("id", clienteId);
  revalidatePath(`/clientes/${clienteId}/aprovacoes`);
}

/** Pede a aprovação de um conteúdo. Calcula o prazo a partir dos dias, se dado. */
export async function guardarAprovacao(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  const titulo = t(formData.get("titulo"));
  if (!clienteId || !titulo) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let prazo = t(formData.get("prazo"));
  const prazoDias = n(formData.get("prazo_dias"));
  if (!prazo && prazoDias != null)
    prazo = new Date(Date.now() + prazoDias * 86_400_000).toISOString().slice(0, 10);

  await supabase.from("aprovacoes").insert({
    cliente_id: clienteId,
    titulo,
    canal: t(formData.get("canal")),
    prazo,
    nota: t(formData.get("nota")),
    autor_id: user?.id ?? null,
  });

  revalidatePath(`/clientes/${clienteId}/aprovacoes`);
  revalidatePath("/");
}

export async function mudarEstadoAprovacao(
  id: string,
  clienteId: string,
  estado: string,
  _fd: FormData,
) {
  const supabase = await criarClienteServidor();
  const resolvidos = ["aprovado", "alteracoes", "recusado"];
  const patch: Record<string, unknown> = { estado };

  if (resolvidos.includes(estado)) {
    patch.resolvido_em = new Date().toISOString();
    const { data: a } = await supabase.from("aprovacoes").select("prazo").eq("id", id).maybeSingle();
    const hoje = new Date().toISOString().slice(0, 10);
    if (a?.prazo && hoje > a.prazo) patch.atraso_cliente = true;
  } else {
    patch.resolvido_em = null;
  }

  await supabase.from("aprovacoes").update(patch).eq("id", id);
  revalidatePath(`/clientes/${clienteId}/aprovacoes`);
  revalidatePath("/");
}

export async function adicionarLembrete(id: string, clienteId: string, _fd: FormData) {
  const supabase = await criarClienteServidor();
  const { data: a } = await supabase.from("aprovacoes").select("lembretes").eq("id", id).maybeSingle();
  await supabase
    .from("aprovacoes")
    .update({ lembretes: (a?.lembretes ?? 0) + 1 })
    .eq("id", id);
  revalidatePath(`/clientes/${clienteId}/aprovacoes`);
}

export async function apagarAprovacao(id: string, clienteId: string, _fd: FormData) {
  const supabase = await criarClienteServidor();
  await supabase.from("aprovacoes").delete().eq("id", id);
  revalidatePath(`/clientes/${clienteId}/aprovacoes`);
  revalidatePath("/");
}
