"use client";

import { useEffect, useState } from "react";

/**
 * Botões para enviar um link (diagnóstico, proposta, plano…) ao cliente por
 * WhatsApp ou email, com o texto já preparado na voz do Nº 5. Não envia nada
 * por nós — abre a app de WhatsApp/email do utilizador com tudo preenchido,
 * ele revê e carrega em enviar.
 */
export function EnviarLink({
  caminho,
  assunto,
  mensagem,
  telefone,
  email,
}: {
  /** Caminho relativo do link público, ex.: /r/proposta/xxxx */
  caminho: string;
  assunto: string;
  /** Texto antes do link. O link é acrescentado no fim. */
  mensagem: string;
  telefone?: string | null;
  email?: string | null;
}) {
  const [origem, setOrigem] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => setOrigem(window.location.origin), []);

  const url = origem ? `${origem}${caminho}` : caminho;
  const textoCompleto = `${mensagem}\n\n${url}`;
  const tel = (telefone ?? "").replace(/[^\d]/g, "");

  const whatsapp = `https://wa.me/${tel}?text=${encodeURIComponent(textoCompleto)}`;
  const mailto = `mailto:${email ?? ""}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(textoCompleto)}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* silêncio */
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener"
        className="rounded-full bg-[#25D366] px-4 py-2 text-sm font-bold text-white"
      >
        WhatsApp
      </a>
      <a
        href={mailto}
        className="rounded-full border-2 border-gold-dark px-4 py-2 text-sm font-bold text-gold-dark"
      >
        Email
      </a>
      <button
        type="button"
        onClick={copiar}
        className="rounded-full border border-line px-4 py-2 text-sm font-bold text-grey hover:text-ink"
      >
        {copiado ? "Copiado ✓" : "Copiar link"}
      </button>
    </div>
  );
}
