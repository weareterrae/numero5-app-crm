"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const ESTADOS = new Set(["aberta", "revista", "publicada", "fechada"]);
const txt = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();

/**
 * Prestar contas: guarda o resultado de uma decisão publicada e o seu estado.
 * O follow-up (o post que volta à decisão) marca-se aqui com a data; o plano
 * do mês seguinte é que o leva ao feed.
 */
export async function guardarRevisao(formData: FormData) {
  const id = txt(formData, "id");
  if (!id) return;
  const estado = txt(formData, "estado");
  const resultado = txt(formData, "resultado");
  const followup = txt(formData, "followup_data");
  const dataRevisao = txt(formData, "data_revisao");
  const notas = txt(formData, "notas");

  const supabase = await criarClienteServidor();
  await supabase
    .from("decisoes_publicadas")
    .update({
      estado: ESTADOS.has(estado) ? estado : "aberta",
      resultado: resultado || null,
      followup_data: followup || null,
      data_revisao: dataRevisao || undefined,
      notas: notas || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/decisoes");
}

/** Regista uma decisão publicada nova, com data de revisão a 3 ou 6 meses por defeito. */
export async function criarDecisao(formData: FormData) {
  const clienteId = txt(formData, "cliente_id");
  const titulo = txt(formData, "titulo");
  const decisao = txt(formData, "decisao");
  const dataPub = txt(formData, "data_publicacao");
  if (!clienteId || !titulo || !decisao || !dataPub) return;

  const meses = Number(txt(formData, "meses") || "3");
  let dataRevisao = txt(formData, "data_revisao");
  if (!dataRevisao) {
    const d = new Date(dataPub + "T00:00:00");
    d.setMonth(d.getMonth() + (Number.isFinite(meses) ? meses : 3));
    dataRevisao = d.toISOString().slice(0, 10);
  }

  const supabase = await criarClienteServidor();
  await supabase.from("decisoes_publicadas").insert({
    cliente_id: clienteId,
    data_publicacao: dataPub,
    canal: txt(formData, "canal") || "linkedin+instagram",
    titulo,
    decisao,
    resultado_esperado: txt(formData, "resultado_esperado") || null,
    data_revisao: dataRevisao,
    notas: txt(formData, "notas") || null,
    estado: "aberta",
  });

  revalidatePath("/decisoes");
}
