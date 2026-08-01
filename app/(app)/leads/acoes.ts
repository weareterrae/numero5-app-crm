"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServidor, criarClienteServico } from "@/lib/supabase/server";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

const FUNIL_GENERICO = [
  { chave: "nova", titulo: "Nova", ordem: 1, tipo: "aberto" },
  { chave: "contactada", titulo: "Contactada", ordem: 2, tipo: "aberto" },
  { chave: "qualificada", titulo: "Qualificada", ordem: 3, tipo: "aberto" },
  { chave: "proposta", titulo: "Proposta", ordem: 4, tipo: "aberto" },
  { chave: "ganha", titulo: "Ganha", ordem: 5, tipo: "ganho" },
  { chave: "perdida", titulo: "Perdida", ordem: 6, tipo: "perdido" },
];

/**
 * Cria um cliente (org) novo com funil, token e — opcionalmente — o login do
 * cliente. Só a equipa do Nº 5 (não externos). Substitui o SQL manual.
 */
export async function criarClienteCRM(fd: FormData) {
  const nome = String(fd.get("nome") ?? "").trim();
  const emailCliente = String(fd.get("email") ?? "").trim();
  const alertaEmail = String(fd.get("alerta_email") ?? "").trim();
  if (nome.length < 2) return;

  // só staff
  const auth = await criarClienteServidor();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return;
  const { data: perfil } = await auth.from("profiles").select("externo").eq("id", user.id).maybeSingle();
  if (perfil?.externo) return;

  const svc = criarClienteServico();

  // slug único
  let slug = slugify(nome) || "cliente";
  const { data: existe } = await svc.from("orgs").select("id").eq("slug", slug).maybeSingle();
  if (existe) slug = `${slug}-${Math.floor(Date.now() / 1000) % 100000}`;

  const { data: org, error } = await svc
    .from("orgs")
    .insert({ nome, slug, alerta_email: alertaEmail || emailCliente || null })
    .select("id, slug")
    .single();
  if (error || !org) return;

  await svc.from("crm_etapas").insert(FUNIL_GENERICO.map((e) => ({ ...e, org_id: org.id })));
  await svc.from("org_tokens").insert({ org_id: org.id, nome: "Integração" });

  // login do cliente (opcional)
  if (emailCliente.includes("@")) {
    const { data: created } = await svc.auth.admin.createUser({
      email: emailCliente,
      email_confirm: true,
    });
    let uid = created?.user?.id;
    if (!uid) {
      const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
      uid = list?.users?.find((u) => (u.email || "").toLowerCase() === emailCliente.toLowerCase())?.id;
    }
    if (uid) {
      await svc.from("profiles").update({ externo: true }).eq("id", uid);
      await svc
        .from("org_membros")
        .upsert({ org_id: org.id, profile_id: uid, papel: "dono" }, { onConflict: "org_id,profile_id" });
    }
  }

  revalidatePath("/leads");
  redirect(`/leads/${org.slug}`);
}
