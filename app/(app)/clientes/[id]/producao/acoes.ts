"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};
const n = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim().replace(",", ".");
  if (s === "") return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};

export async function juntarItem(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  const mes = t(formData.get("mes"));
  const tipo = t(formData.get("tipo"));
  if (!clienteId || !mes || !tipo) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("producao_itens").insert({
    cliente_id: clienteId,
    mes,
    tipo,
    descricao: t(formData.get("descricao")),
    quantidade: Math.max(1, Math.round(n(formData.get("quantidade")) ?? 1)),
    minutos: n(formData.get("minutos")) ?? null,
    extra: formData.get("extra") === "on",
    valor: n(formData.get("valor")),
    autor_id: user?.id ?? null,
  });

  revalidatePath(`/clientes/${clienteId}/producao`);
}

export async function apagarItem(formData: FormData) {
  const id = t(formData.get("item_id"));
  const clienteId = t(formData.get("cliente_id"));
  if (!id) return;
  const supabase = await criarClienteServidor();
  await supabase.from("producao_itens").delete().eq("id", id);
  if (clienteId) revalidatePath(`/clientes/${clienteId}/producao`);
}

/** Marca um extra como faturado (ou desmarca). */
export async function alternarFaturado(formData: FormData) {
  const id = t(formData.get("item_id"));
  const clienteId = t(formData.get("cliente_id"));
  const valor = formData.get("faturado") === "1";
  if (!id) return;
  const supabase = await criarClienteServidor();
  await supabase.from("producao_itens").update({ faturado: valor }).eq("id", id);
  if (clienteId) revalidatePath(`/clientes/${clienteId}/producao`);
}

/** Passa uma peça a extra (e valoriza-a pela tabela de preços). */
export async function marcarExtra(formData: FormData) {
  const id = t(formData.get("item_id"));
  const clienteId = t(formData.get("cliente_id"));
  if (!id) return;

  const supabase = await criarClienteServidor();
  const { data: item } = await supabase
    .from("producao_itens")
    .select("tipo, quantidade, extra")
    .eq("id", id)
    .maybeSingle();
  if (!item) return;

  let valor: number | null = null;
  if (!item.extra) {
    const { data: preco } = await supabase
      .from("precos_unitarios")
      .select("preco")
      .eq("chave", item.tipo)
      .maybeSingle();
    if (preco?.preco != null) valor = Number(preco.preco) * (item.quantidade ?? 1);
  }

  await supabase
    .from("producao_itens")
    .update({ extra: !item.extra, valor: item.extra ? null : valor })
    .eq("id", id);

  if (clienteId) revalidatePath(`/clientes/${clienteId}/producao`);
}
