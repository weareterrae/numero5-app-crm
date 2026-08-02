import { criarClienteServico } from "@/lib/supabase/server";

const BASE = "https://app.numerocinco.pt";

/**
 * Gera um link de entrada SEGURO para a landing `/auth/entrar` (token_hash):
 * funciona em qualquer dispositivo (verifyOtp), é imune aos scanners de email
 * (Safe Links) porque o token só é consumido no clique, e não depende do Site
 * URL / Redirect URLs do Supabase. NÃO cria contas — devolve null se o email
 * não tiver conta. Usado no convite (operador) e no login por email.
 */
export async function gerarLinkEntrada(email: string, proximo = "/sede"): Promise<string | null> {
  const svc = criarClienteServico();
  const { data: perfil } = await svc.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (!perfil) return null; // sem conta → não gera (e não cria)

  const { data } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${BASE}${proximo}` },
  });
  const hash = data?.properties?.hashed_token ?? null;
  return hash
    ? `${BASE}/auth/entrar?token_hash=${encodeURIComponent(hash)}&type=magiclink&proximo=${encodeURIComponent(proximo)}`
    : null;
}

/** Envio simples por Resend. Devolve true se foi aceite. */
export async function enviarEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_REMETENTE || "Nº 5 <geral@numerocinco.pt>",
        to: [to],
        subject,
        html,
        text,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
