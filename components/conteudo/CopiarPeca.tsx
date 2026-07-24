"use client";

import { useState } from "react";

/** Copia a peça inteira (legenda + slides + guião + hashtags) pronta a colar. */
export function CopiarPeca({ texto }: { texto: string }) {
  const [feito, setFeito] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setFeito(true);
      setTimeout(() => setFeito(false), 1500);
    } catch {
      /* alguns browsers bloqueiam sem https — ignora */
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="rounded-full border border-line px-3 py-1 text-xs font-bold text-grey hover:border-gold hover:text-gold-dark"
    >
      {feito ? "copiado ✓" : "copiar"}
    </button>
  );
}
