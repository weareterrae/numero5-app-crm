"use client";

import { useState } from "react";

export function BotaoCopiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        } catch {
          /* clipboard indisponível */
        }
      }}
      className="shrink-0 rounded-full bg-ink px-4 py-2 text-xs font-bold text-cream hover:brightness-110"
    >
      {ok ? "copiado ✓" : "copiar"}
    </button>
  );
}
