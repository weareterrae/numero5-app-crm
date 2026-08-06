"use client";

import Link from "next/link";
import { useEstado } from "./useEstado";

/** Selo de estado sempre presente no cabeçalho da app — verde se tudo responde,
 *  vermelho (a pulsar) se algum assistente cair. Liga ao painel /estado. */
export function EstadoBadge() {
  const { dados, erro } = useEstado();
  const baixos = dados?.sites.filter((s) => s.estado !== "verde") ?? [];
  const problema = erro || baixos.length > 0;

  return (
    <Link
      href="/estado"
      title="Estado dos sistemas"
      aria-label={problema ? "Sistemas com problema" : "Sistemas operacionais"}
      className="ml-auto flex shrink-0 items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-bold transition hover:border-ink"
    >
      <span className={`relative inline-block h-2.5 w-2.5 rounded-full ${problema ? "bg-bad" : "bg-good"}`}>
        {!problema && <span className="absolute inset-0 animate-ping rounded-full bg-good opacity-60" />}
      </span>
      <span className="hidden sm:inline">
        {problema ? (
          <span className="text-bad">{erro ? "verificar" : `${baixos.length} em baixo`}</span>
        ) : (
          <span className="text-soft">Sistemas ok</span>
        )}
      </span>
    </Link>
  );
}
