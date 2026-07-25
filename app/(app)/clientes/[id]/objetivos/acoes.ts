"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

/** Guarda até 3 objetivos/KPIs do período. Só grava os que têm objetivo. */
export async function guardarKpis(formData: FormData) {
  const clienteId = (formData.get("cliente_id") ?? "").toString();
  if (!clienteId) return;

  const kpis: Record<string, string | null>[] = [];
  for (let i = 0; i < 3; i++) {
    const objetivo = t(formData.get(`objetivo_${i}`));
    if (!objetivo) continue;
    kpis.push({
      objetivo,
      kpi: t(formData.get(`kpi_${i}`)),
      valor_inicial: t(formData.get(`valor_inicial_${i}`)),
      meta: t(formData.get(`meta_${i}`)),
      fonte: t(formData.get(`fonte_${i}`)),
      resultado: t(formData.get(`resultado_${i}`)),
      comentario: t(formData.get(`comentario_${i}`)),
    });
  }

  const supabase = await criarClienteServidor();
  await supabase.from("clientes").update({ kpis }).eq("id", clienteId);
  revalidatePath(`/clientes/${clienteId}/objetivos`);
  revalidatePath(`/clientes/${clienteId}`);
}
