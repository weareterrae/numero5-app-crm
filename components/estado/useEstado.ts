"use client";

import { useCallback, useEffect, useState } from "react";

// Motor de verificação partilhado do grupo (CORS aberto, só devolve estados, sem segredos).
const ENDPOINT = "https://terrae.pt/.netlify/functions/estado-multi";

export type SiteEstado = { nome: string; estado: "verde" | "vermelho"; detalhe: string };
export type Estado = { sites: SiteEstado[]; todos_ok: boolean; verificado: string };

export function useEstado(intervaloMs = 60000) {
  const [dados, setDados] = useState<Estado | null>(null);
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
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
    recarregar();
    const id = setInterval(recarregar, intervaloMs);
    return () => clearInterval(id);
  }, [recarregar, intervaloMs]);

  return { dados, erro, carregando, recarregar };
}
