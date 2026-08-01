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

const CANAL = {
  chamada: { tipo: "chamada", desc: "Ligou à lead." },
  whatsapp: { tipo: "mensagem", desc: "Enviou WhatsApp à lead." },
  email: { tipo: "email", desc: "Enviou email à lead." },
} as const;

/** Regista um contacto por canal: marca a 1.ª resposta (velocidade) e deixa atividade. */
export async function registarContacto(fd: FormData) {
  const leadId = texto(fd, "lead");
  const orgId = texto(fd, "orgId");
  const slug = texto(fd, "org");
  const canalRaw = texto(fd, "canal");
  const canal = (canalRaw in CANAL ? canalRaw : "chamada") as keyof typeof CANAL;
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
      tipo: CANAL[canal].tipo,
      descricao: CANAL[canal].desc,
    });
  }
  if (slug) revalidatePath(`/leads/${slug}`);
}

/** Adiciona uma nota (e, opcionalmente, um follow-up com data) à lead. */
export async function adicionarNota(fd: FormData) {
  const leadId = texto(fd, "lead");
  const orgId = texto(fd, "orgId");
  const slug = texto(fd, "org");
  const descricao = texto(fd, "descricao");
  const followup = texto(fd, "followup");
  if (!leadId || !orgId || !descricao) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("crm_atividades").insert({
    org_id: orgId,
    lead_id: leadId,
    autor_id: user?.id ?? null,
    tipo: "nota",
    descricao,
    followup_em: followup || null,
  });
  if (slug) revalidatePath(`/leads/${slug}/${leadId}`);
}

/** Guarda alterações rápidas ao contacto da lead (nome/telefone/email). */
export async function guardarContacto(fd: FormData) {
  const leadId = texto(fd, "lead");
  const slug = texto(fd, "org");
  if (!leadId) return;
  const supabase = await criarClienteServidor();
  await supabase
    .from("crm_leads")
    .update({
      nome: texto(fd, "nome") || null,
      telefone: texto(fd, "telefone") || null,
      email: texto(fd, "email") || null,
    })
    .eq("id", leadId);
  if (slug) revalidatePath(`/leads/${slug}/${leadId}`);
}
