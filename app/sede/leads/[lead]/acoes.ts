"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { contextoSede } from "@/lib/sede/contexto";

const t = (fd: FormData, k: string) => (fd.get(k)?.toString() ?? "").trim();

/** Move a lead de etapa — só dentro da org da sessão. */
export async function moverLeadSede(fd: FormData) {
  const leadId = t(fd, "lead");
  const etapaId = t(fd, "etapa");
  if (!leadId || !etapaId) return;
  const ctx = await contextoSede();
  const supabase = await criarClienteServidor();

  const { data: etapa } = await supabase
    .from("crm_etapas")
    .select("tipo")
    .eq("id", etapaId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  const resultado = etapa?.tipo === "ganho" ? "ganho" : etapa?.tipo === "perdido" ? "perdido" : "aberto";

  await supabase
    .from("crm_leads")
    .update({ etapa_id: etapaId, resultado })
    .eq("id", leadId)
    .eq("org_id", ctx.org.id);
  revalidatePath(`/sede/leads/${leadId}`);
  revalidatePath("/sede/leads");
}

/** Marca a lead como respondida (cronómetro) e deixa atividade. */
export async function registarRespostaSede(fd: FormData) {
  const leadId = t(fd, "lead");
  if (!leadId) return;
  const ctx = await contextoSede();
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("crm_leads")
    .update({ primeira_resposta_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("org_id", ctx.org.id)
    .is("primeira_resposta_at", null);
  await supabase.from("crm_atividades").insert({
    org_id: ctx.org.id,
    lead_id: leadId,
    autor_id: user?.id ?? null,
    tipo: "chamada",
    descricao: "Respondeu à lead.",
  });
  revalidatePath(`/sede/leads/${leadId}`);
  revalidatePath("/sede/leads");
}

/** Adiciona uma nota (com follow-up opcional) à lead. */
export async function adicionarNotaSede(fd: FormData) {
  const leadId = t(fd, "lead");
  const descricao = t(fd, "descricao");
  if (!leadId || !descricao) return;
  const ctx = await contextoSede();
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("crm_atividades").insert({
    org_id: ctx.org.id,
    lead_id: leadId,
    autor_id: user?.id ?? null,
    tipo: "nota",
    descricao,
    followup_em: t(fd, "followup") || null,
  });
  revalidatePath(`/sede/leads/${leadId}`);
}
