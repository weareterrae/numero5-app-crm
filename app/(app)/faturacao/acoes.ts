"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};
const n = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim().replace(",", ".");
  const x = Number(s);
  return Number.isFinite(x) ? x : 0;
};

/** Marca (ou desmarca) a avença de um cliente como cobrada num dado mês. */
export async function marcarCobranca(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  const mes = t(formData.get("mes"));
  const tipo = t(formData.get("tipo")) ?? "avenca";
  const cobrado = formData.get("cobrado") === "1";
  if (!clienteId || !mes) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("cobrancas").upsert(
    {
      cliente_id: clienteId,
      mes,
      tipo,
      descricao: t(formData.get("descricao")),
      valor: n(formData.get("valor")),
      estado: cobrado ? "cobrado" : "por_cobrar",
      cobrado_em: cobrado ? new Date().toISOString() : null,
      criado_por: user?.id ?? null,
    },
    { onConflict: "cliente_id,mes,tipo" },
  );

  revalidatePath("/faturacao");
}
