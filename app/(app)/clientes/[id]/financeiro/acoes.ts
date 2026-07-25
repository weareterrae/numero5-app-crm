"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

export async function guardarFinanceiro(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  if (!clienteId) return;

  const financeiro = {
    estado: t(formData.get("estado")) ?? "regular",
    ultimo_contacto: t(formData.get("ultimo_contacto")),
    proxima_acao: t(formData.get("proxima_acao")),
    responsavel: t(formData.get("responsavel")),
    excecao: t(formData.get("excecao")),
  };

  const supabase = await criarClienteServidor();
  await supabase.from("clientes").update({ financeiro }).eq("id", clienteId);
  revalidatePath(`/clientes/${clienteId}/financeiro`);
  revalidatePath("/");
}

/** Pré-requisitos de arranque da Fundação. Desbloqueio manual exige motivo. */
export async function guardarArranque(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  if (!clienteId) return;

  const arranque = {
    proposta_aceite: formData.get("proposta_aceite") === "on",
    dados_fiscais: formData.get("dados_fiscais") === "on",
    pagamento_inicial: formData.get("pagamento_inicial") === "on",
    acessos: formData.get("acessos") === "on",
    briefing: formData.get("briefing") === "on",
    desbloqueio_motivo: t(formData.get("desbloqueio_motivo")),
  };

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("clientes").update({ arranque }).eq("id", clienteId);

  // Se houve desbloqueio manual (motivo dado sem tudo cumprido), fica no histórico.
  if (arranque.desbloqueio_motivo) {
    await supabase.from("auditoria").insert({
      tabela: "clientes",
      registo_id: clienteId,
      campo: "arranque_desbloqueado",
      valor_anterior: "pré-requisitos incompletos",
      valor_novo: "desbloqueio manual",
      motivo: arranque.desbloqueio_motivo,
      autor_id: user?.id ?? null,
    });
  }

  revalidatePath(`/clientes/${clienteId}/financeiro`);
}
