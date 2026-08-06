"use client";

import { useState } from "react";

export function CopiarLink({ url }: { url: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* clipboard indisponível */
        }
      }}
      className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-grey hover:text-ink"
      title={url}
    >
      {ok ? "Copiado ✓" : "Copiar link"}
    </button>
  );
}
