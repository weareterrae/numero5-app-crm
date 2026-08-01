"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const texto = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

/** Move uma lead para outra etapa. Deriva o resultado (ganho/perdido/aberto) da etapa. */
export async function moverLead(fd: FormData) {
  const leadId = texto(fd, "lead");
  const etapaId = texto(fd, "etapa");
  const slug = texto(fd, "org");
  if (!leadId || !etapaId) return;

  const supabase = await criarClienteServidor();

  const { data: etapa } = await supabase
    .from("crm_etapas")
    .select("tipo")
    .eq("id", etapaId)
    .maybeSingle();

  const resultado =
    etapa?.tipo === "ganho" ? "ganho" : etapa?.tipo === "perdido" ? "perdido" : "aberto";

  const patch: Record<string, unknown> = { etapa_id: etapaId, resultado };
  const motivo = texto(fd, "motivo");
  if (resultado === "perdido" && motivo) patch.motivo_perda = motivo;

  await supabase.from("crm_leads").update(patch).eq("id", leadId);
  if (slug) revalidatePath(`/leads/${slug}`);
}

/** Regista um contacto: marca a 1.ª resposta (métrica de velocidade) e deixa atividade. */
export async function registarContacto(fd: FormData) {
  const leadId = texto(fd, "lead");
  const orgId = texto(fd, "orgId");
  const slug = texto(fd, "org");
  if (!leadId) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // só define a 1.ª resposta se ainda não existir
  await supabase
    .from("crm_leads")
    .update({ primeira_resposta_at: new Date().toISOString() })
    .eq("id", leadId)
    .is("primeira_resposta_at", null);

  if (orgId) {
    await supabase.from("crm_atividades").insert({
      org_id: orgId,
      lead_id: leadId,
      autor_id: user?.id ?? null,
      tipo: "chamada",
      descricao: "Contacto registado.",
    });
  }
  if (slug) revalidatePath(`/leads/${slug}`);
}
