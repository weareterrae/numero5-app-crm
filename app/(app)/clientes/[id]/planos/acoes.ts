"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { mesISO } from "@/lib/dominio/producao";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

/** Cria um plano para o cliente (mês atual por defeito) e abre-o. */
export async function criarPlano(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  if (!clienteId) return;
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("planos")
    .insert({ cliente_id: clienteId, mes: t(formData.get("mes")) ?? mesISO(), criado_por: user?.id ?? null })
    .select("id")
    .single();
  if (error || !data) return;
  revalidatePath(`/clientes/${clienteId}`);
  redirect(`/clientes/${clienteId}/planos/${data.id}`);
}

/** Guarda o conteúdo do plano (HTML colado do Claude Code). */
export async function guardarPlano(formData: FormData) {
  const id = t(formData.get("id"));
  const clienteId = t(formData.get("cliente_id"));
  if (!id) return;
  const supabase = await criarClienteServidor();
  await supabase
    .from("planos")
    .update({
      titulo: t(formData.get("titulo")),
      mes: t(formData.get("mes")) ?? mesISO(),
      conteudo_html: (formData.get("conteudo_html") ?? "").toString(),
    })
    .eq("id", id);
  revalidatePath(`/clientes/${clienteId}/planos/${id}`);
}

/** Liga/desliga a partilha; ao ligar, marca como enviado. */
export async function alternarPartilhaPlano(formData: FormData) {
  const id = t(formData.get("id"));
  const clienteId = t(formData.get("cliente_id"));
  const ativar = formData.get("ativar") === "1";
  if (!id) return;
  const supabase = await criarClienteServidor();
  await supabase
    .from("planos")
    .update({
      partilha_ativa: ativar,
      ...(ativar ? { estado: "enviado", enviado_em: new Date().toISOString() } : {}),
    })
    .eq("id", id);
  revalidatePath(`/clientes/${clienteId}/planos/${id}`);
}

export async function apagarPlano(formData: FormData) {
  const id = t(formData.get("id"));
  const clienteId = t(formData.get("cliente_id"));
  if (!id) return;
  const supabase = await criarClienteServidor();
  await supabase.from("planos").delete().eq("id", id);
  revalidatePath(`/clientes/${clienteId}`);
  redirect(`/clientes/${clienteId}`);
}
