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

/** Marca a lead como venda fechada (ROI): valor + move para etapa "ganho" se existir. */
export async function registarVendaSede(fd: FormData) {
  const leadId = t(fd, "lead");
  if (!leadId) return;
  const valorRaw = t(fd, "valor").replace(",", ".").replace(/[^\d.]/g, "");
  const valor = valorRaw ? Number(valorRaw) : null;
  const ctx = await contextoSede();
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: etapaGanho } = await supabase
    .from("crm_etapas")
    .select("id")
    .eq("org_id", ctx.org.id)
    .eq("tipo", "ganho")
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    resultado: "ganho",
    valor_negocio: valor != null && Number.isFinite(valor) ? valor : null,
    ganho_em: new Date().toISOString(),
  };
  if (etapaGanho?.id) patch.etapa_id = etapaGanho.id;

  await supabase.from("crm_leads").update(patch).eq("id", leadId).eq("org_id", ctx.org.id);
  await supabase.from("crm_atividades").insert({
    org_id: ctx.org.id,
    lead_id: leadId,
    autor_id: user?.id ?? null,
    tipo: "sistema",
    descricao: valor ? `Venda fechada — €${valor}.` : "Marcada como venda fechada.",
  });
  revalidatePath(`/sede/leads/${leadId}`);
  revalidatePath("/sede/leads");
  revalidatePath("/sede");
}
