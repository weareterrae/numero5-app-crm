"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Avença MANUAL — para clientes migrados/antigos sem proposta formal aceite.
 * Sem isto, esses clientes não apareciam na Faturação, Rentabilidade nem
 * Capacidade (o gatilho normal só cria avenças na aceitação da proposta).
 */
export async function criarAvencaManual(formData: FormData) {
  const clienteId = (formData.get("cliente_id") ?? "").toString().trim();
  const valor = Number((formData.get("valor_mensal") ?? "").toString().replace(",", "."));
  const inicio = (formData.get("inicio") ?? "").toString().trim() || new Date().toISOString().slice(0, 10);
  if (!clienteId || !Number.isFinite(valor) || valor <= 0) return;

  const supabase = await criarClienteServidor();

  // Não duplicar: se já há avença ativa deste cliente, não cria outra.
  const { data: existente } = await supabase
    .from("avencas")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("estado", "ativa")
    .limit(1)
    .maybeSingle();
  if (existente) return;

  await supabase.from("avencas").insert({
    cliente_id: clienteId,
    valor_mensal: valor,
    inicio,
    estado: "ativa",
    notas: "Avença manual (cliente migrado — sem proposta formal registada).",
  });
  await supabase.from("atividades").insert({
    cliente_id: clienteId,
    tipo: "nota",
    descricao: `💶 Avença manual criada: €${valor}/mês (cliente migrado). Entra na Faturação e Rentabilidade.`,
  });

  revalidatePath("/avencas");
  revalidatePath("/faturacao");
  revalidatePath("/");
}
