"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Motor de verificação partilhado do grupo (CORS aberto, só devolve estados, sem segredos).
const ENDPOINT = "https://terrae.pt/.netlify/functions/estado-multi";

// Poupança de custo: este selo está SEMPRE presente no cabeçalho da app, logo
// todas as páginas o montam. Um intervalo curto transformava cada separador
// aberto num loop permanente de invocações de função (na terrae.pt, que por sua
// vez bate em todos os sites do grupo). Por isso: intervalo longo (4h),
// polling só com o separador visível, e um refresco ao voltar se estiver velho.
const INTERVALO_PADRAO = 4 * 60 * 60 * 1000; // 4 horas

export type SiteEstado = { nome: string; estado: "verde" | "vermelho"; detalhe: string };
export type Estado = { sites: SiteEstado[]; todos_ok: boolean; verificado: string };

export function useEstado(intervaloMs = INTERVALO_PADRAO) {
  const [dados, setDados] = useState<Estado | null>(null);
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const ultimaVerificacao = useRef(0);

  const recarregar = useCallback(async () => {
    ultimaVerificacao.current = Date.now();
    try {
      const r = await fetch(`${ENDPOINT}?cb=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as Estado;
      setDados(j);
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    recarregar(); // uma verificação ao montar

    // O intervalo só dispara o fetch se o separador estiver visível — nada de
    // bater no servidor com a app esquecida em segundo plano.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") recarregar();
    }, intervaloMs);

    // Ao voltar ao separador, refresca só se os dados já estiverem velhos.
    const aoVoltar = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - ultimaVerificacao.current > intervaloMs
      ) {
        recarregar();
      }
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [recarregar, intervaloMs]);

  return { dados, erro, carregando, recarregar };
}
