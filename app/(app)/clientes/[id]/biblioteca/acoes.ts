"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

export async function juntarConteudo(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  const tema = t(formData.get("tema"));
  if (!clienteId || !tema) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("biblioteca_conteudos").insert({
    cliente_id: clienteId,
    tema,
    formato: t(formData.get("formato")),
    canal: t(formData.get("canal")),
    data: t(formData.get("data")),
    desempenho: t(formData.get("desempenho")),
    reutilizavel: formData.get("reutilizavel") !== "nao",
    origem: t(formData.get("origem")),
    licenca: t(formData.get("licenca")),
    notas: t(formData.get("notas")),
    autor_id: user?.id ?? null,
  });

  revalidatePath(`/clientes/${clienteId}/biblioteca`);
}

export async function apagarConteudo(id: string, clienteId: string, _fd: FormData) {
  const supabase = await criarClienteServidor();
  await supabase.from("biblioteca_conteudos").delete().eq("id", id);
  revalidatePath(`/clientes/${clienteId}/biblioteca`);
}
