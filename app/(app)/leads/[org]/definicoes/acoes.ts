"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const t = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || "etapa"
  );
}

/** Garante que quem faz a ação é equipa do Nº 5 e devolve o id da org pelo slug. */
async function contexto(slug: string) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase
    .from("profiles")
    .select("externo")
    .eq("id", user.id)
    .maybeSingle();
  if (perfil?.externo) return null; // só staff configura
  const { data: org } = await supabase.from("orgs").select("id").eq("slug", slug).maybeSingle();
  if (!org) return null;
  return { supabase, orgId: org.id as string };
}

export async function guardarAlertas(fd: FormData) {
  const slug = t(fd, "org");
  const ctx = await contexto(slug);
  if (!ctx) return;
  const minutos = parseInt(t(fd, "alerta_minutos"), 10);
  await ctx.supabase
    .from("orgs")
    .update({
      alerta_email: t(fd, "alerta_email") || null,
      alerta_minutos: Number.isFinite(minutos) && minutos > 0 ? minutos : 30,
    })
    .eq("id", ctx.orgId);
  revalidatePath(`/leads/${slug}/definicoes`);
}

export async function adicionarEtapa(fd: FormData) {
  const slug = t(fd, "org");
  const ctx = await contexto(slug);
  if (!ctx) return;
  const titulo = t(fd, "titulo");
  if (!titulo) return;
  const tipo = ["aberto", "ganho", "perdido"].includes(t(fd, "tipo")) ? t(fd, "tipo") : "aberto";
  const { data: max } = await ctx.supabase
    .from("crm_etapas")
    .select("ordem")
    .eq("org_id", ctx.orgId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordem = (max?.ordem ?? 0) + 1;
  await ctx.supabase.from("crm_etapas").insert({
    org_id: ctx.orgId,
    chave: `${slugify(titulo)}-${Date.now() % 100000}`,
    titulo,
    tipo,
    ordem,
  });
  revalidatePath(`/leads/${slug}/definicoes`);
}

export async function guardarEtapa(fd: FormData) {
  const slug = t(fd, "org");
  const ctx = await contexto(slug);
  if (!ctx) return;
  const id = t(fd, "etapa");
  if (!id) return;
  const titulo = t(fd, "titulo");
  const tipo = ["aberto", "ganho", "perdido"].includes(t(fd, "tipo")) ? t(fd, "tipo") : "aberto";
  const ordem = parseInt(t(fd, "ordem"), 10);
  const patch: Record<string, unknown> = { tipo };
  if (titulo) patch.titulo = titulo;
  if (Number.isFinite(ordem)) patch.ordem = ordem;
  await ctx.supabase.from("crm_etapas").update(patch).eq("id", id).eq("org_id", ctx.orgId);
  revalidatePath(`/leads/${slug}/definicoes`);
}

/** Apaga uma etapa — só se estiver vazia (senão as leads ficavam órfãs). */
export async function apagarEtapa(fd: FormData) {
  const slug = t(fd, "org");
  const ctx = await contexto(slug);
  if (!ctx) return;
  const id = t(fd, "etapa");
  if (!id) return;
  const { count } = await ctx.supabase
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .eq("etapa_id", id);
  if ((count ?? 0) > 0) return; // tem leads — não apaga (o ecrã avisa)
  await ctx.supabase.from("crm_etapas").delete().eq("id", id).eq("org_id", ctx.orgId);
  revalidatePath(`/leads/${slug}/definicoes`);
}
