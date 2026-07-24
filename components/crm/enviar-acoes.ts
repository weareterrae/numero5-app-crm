"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { enviarEmailResend } from "@/lib/email/resend";

export type EstadoEnvio = { ok: boolean; msg: string };

/**
 * Envia o link ao cliente por email, já pela app (Resend), e regista no
 * histórico. Chamada por useActionState no EnviarLink.
 */
export async function enviarPorEmail(
  _prev: EstadoEnvio,
  formData: FormData,
): Promise<EstadoEnvio> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: "Sem sessão." };

  const email = (formData.get("email") ?? "").toString().trim();
  const assunto = (formData.get("assunto") ?? "").toString().trim();
  const mensagem = (formData.get("mensagem") ?? "").toString();
  const url = (formData.get("url") ?? "").toString().trim();
  const clienteId = (formData.get("cliente_id") ?? "").toString().trim() || null;

  if (!email || !email.includes("@")) return { ok: false, msg: "Este contacto não tem email." };
  if (!url.startsWith("http")) return { ok: false, msg: "Link inválido. Recarrega a página." };

  const r = await enviarEmailResend({ para: email, assunto, texto: mensagem, link: url });
  if (!r.ok) return { ok: false, msg: r.erro };

  // Deixa rasto no CRM.
  if (clienteId) {
    await supabase.from("atividades").insert({
      cliente_id: clienteId,
      tipo: "email",
      descricao: `Email enviado para ${email}: ${assunto}`,
      autor_id: user.id,
    });
    revalidatePath(`/clientes/${clienteId}`);
  }

  return { ok: true, msg: `Enviado para ${email} ✓` };
}

/**
 * Regista no histórico que o link foi enviado por WhatsApp. O WhatsApp abre na
 * app do utilizador (não passa por nós), por isso é ele que confirma o envio.
 */
export async function registarEnvioWhatsApp(
  _prev: EstadoEnvio,
  formData: FormData,
): Promise<EstadoEnvio> {
  const clienteId = (formData.get("cliente_id") ?? "").toString().trim();
  const assunto = (formData.get("assunto") ?? "").toString().trim();
  if (!clienteId) return { ok: false, msg: "" };

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: "Sem sessão." };

  await supabase.from("atividades").insert({
    cliente_id: clienteId,
    tipo: "mensagem",
    descricao: `Link enviado por WhatsApp${assunto ? `: ${assunto}` : ""}`,
    autor_id: user.id,
  });
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true, msg: "Registado no histórico ✓" };
}
