"use client";

import { useState } from "react";

/**
 * Mostra a mensagem de seguimento sugerida para o estado atual do cliente.
 * NUNCA envia sozinha — o operador copia ou abre o WhatsApp já preenchido.
 */
export function SeguimentoSugerido({
  mensagem,
  telefone,
}: {
  mensagem: string;
  telefone?: string | null;
}) {
  const [copiado, setCopiado] = useState(false);
  const tel = (telefone ?? "").replace(/[^\d]/g, "");
  const whatsapp = `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* silêncio */
    }
  }

  return (
    <section className="rounded-xl border border-gold/40 bg-gold/5 p-4">
      <p className="rotulo mb-1">seguimento sugerido</p>
      <p className="text-sm text-grey">{mensagem}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {tel && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener"
            className="rounded-full bg-[#25D366] px-4 py-1.5 text-sm font-bold text-white"
          >
            WhatsApp
          </a>
        )}
        <button
          type="button"
          onClick={copiar}
          className="rounded-full border border-line px-4 py-1.5 text-sm font-bold text-grey hover:text-ink"
        >
          {copiado ? "Copiado ✓" : "Copiar"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-soft">Sugestão — nada é enviado sem seres tu.</p>
    </section>
  );
}
