"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { criarClienteBrowser } from "@/lib/supabase/client";

/**
 * Mantém a sessão viva no browser.
 *
 * Porquê isto e não um proxy.ts (o antigo middleware):
 * o empacotador de edge functions da Netlify não consegue construir o proxy
 * a partir de um build feito em Windows (resolve mal os caminhos). Como a
 * PROTEÇÃO das rotas já é feita no servidor — o layout de (app) e todas as
 * rotas /api verificam getUser() por si —, o proxy só fazia falta para
 * renovar o token. É isso que este componente garante, no cliente.
 *
 * Se um dia a app passar a construir em Linux (CI), o proxy.ts pode voltar
 * como camada extra de defesa.
 */
export function ManterSessao() {
  const router = useRouter();

  useEffect(() => {
    const supabase = criarClienteBrowser();

    // Renova o token e sincroniza os cookies que o servidor lê.
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") router.replace("/login");
      if (evento === "TOKEN_REFRESHED" || evento === "SIGNED_IN") router.refresh();
    });

    // Ao voltar ao separador, confirma que a sessão ainda é válida.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void supabase.auth.getSession();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [router]);

  return null;
}
