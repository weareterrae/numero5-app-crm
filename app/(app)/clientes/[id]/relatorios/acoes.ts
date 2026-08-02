"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { mesISO } from "@/lib/dominio/producao";
import { notificarClienteSede } from "@/lib/sede/notificar";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

/** Cria um relatório para o cliente (mês passado por defeito) e abre-o. */
export async function criarRelatorio(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  if (!clienteId) return;
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("relatorios")
    .insert({ cliente_id: clienteId, mes: t(formData.get("mes")) ?? mesISO(), criado_por: user?.id ?? null })
    .select("id")
    .single();
  if (error || !data) return;
  revalidatePath(`/clientes/${clienteId}`);
  redirect(`/clientes/${clienteId}/relatorios/${data.id}`);
}

/** Guarda o conteúdo do relatório (HTML colado do Claude Code). */
export async function guardarRelatorio(formData: FormData) {
  const id = t(formData.get("id"));
  const clienteId = t(formData.get("cliente_id"));
  if (!id) return;
  const supabase = await criarClienteServidor();
  await supabase
    .from("relatorios")
    .update({
      titulo: t(formData.get("titulo")),
      mes: t(formData.get("mes")) ?? mesISO(),
      conteudo_html: (formData.get("conteudo_html") ?? "").toString(),
    })
    .eq("id", id);
  revalidatePath(`/clientes/${clienteId}/relatorios/${id}`);
}

/** Liga/desliga a partilha; ao ligar, marca como enviado. */
export async function alternarPartilhaRelatorio(formData: FormData) {
  const id = t(formData.get("id"));
  const clienteId = t(formData.get("cliente_id"));
  const ativar = formData.get("ativar") === "1";
  if (!id) return;
  const supabase = await criarClienteServidor();
  await supabase
    .from("relatorios")
    .update({
      partilha_ativa: ativar,
      ...(ativar ? { estado: "enviado", enviado_em: new Date().toISOString() } : {}),
    })
    .eq("id", id);
  // Ao publicar, avisa o cliente na Sede por email (nunca bloqueia a partilha).
  if (ativar && clienteId) await notificarClienteSede(clienteId, "relatorio");
  revalidatePath(`/clientes/${clienteId}/relatorios/${id}`);
}

export async function apagarRelatorio(formData: FormData) {
  const id = t(formData.get("id"));
  const clienteId = t(formData.get("cliente_id"));
  if (!id) return;
  const supabase = await criarClienteServidor();
  await supabase.from("relatorios").delete().eq("id", id);
  revalidatePath(`/clientes/${clienteId}`);
  redirect(`/clientes/${clienteId}`);
}
