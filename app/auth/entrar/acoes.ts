"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Consome o token do convite/magic link SÓ quando a pessoa carrega no botão
 * (POST) — nunca num GET. Assim os scanners de email (Microsoft Safe Links,
 * etc.), que fazem GET aos links para os verificar, não gastam o token de uso
 * único antes do cliente. Funciona em qualquer dispositivo (verifyOtp).
 */
export async function confirmarEntrada(formData: FormData) {
  const token_hash = (formData.get("token_hash") ?? "").toString();
  const type = ((formData.get("type") ?? "magiclink").toString()) as EmailOtpType;
  const proximo = (formData.get("proximo") ?? "/sede").toString() || "/sede";
  if (!token_hash) redirect("/auth/entrar?erro=1");

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) redirect("/auth/entrar?erro=1");

  redirect(proximo.startsWith("/") ? proximo : "/sede");
}
