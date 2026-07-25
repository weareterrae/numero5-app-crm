"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { criarClienteServidor } from "@/lib/supabase/server";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};
const num = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim().replace(",", ".");
  if (s === "") return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};

export async function criarOrdem(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  const titulo = t(formData.get("titulo"));
  if (!clienteId || !titulo) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("ordens_alteracao").insert({
    cliente_id: clienteId,
    titulo,
    descricao: t(formData.get("descricao")),
    origem: t(formData.get("origem")),
    impacto: t(formData.get("impacto")),
    prazo: t(formData.get("prazo")),
    horas: num(formData.get("horas")),
    preco: num(formData.get("preco")),
    iva_pct: num(formData.get("iva_pct")) ?? 23,
    token: randomUUID(),
    autor_id: user?.id ?? null,
  });

  revalidatePath(`/clientes/${clienteId}/extras`);
}

export async function mudarEstadoOrdem(
  id: string,
  clienteId: string,
  estado: string,
  _fd: FormData,
) {
  const supabase = await criarClienteServidor();
  const patch: Record<string, unknown> = { estado };
  if (estado === "aceite") patch.aceite_em = new Date().toISOString();
  await supabase.from("ordens_alteracao").update(patch).eq("id", id);
  revalidatePath(`/clientes/${clienteId}/extras`);
  revalidatePath("/");
}

export async function apagarOrdem(id: string, clienteId: string, _fd: FormData) {
  const supabase = await criarClienteServidor();
  await supabase.from("ordens_alteracao").delete().eq("id", id);
  revalidatePath(`/clientes/${clienteId}/extras`);
  revalidatePath("/");
}
