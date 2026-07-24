"use client";

import { useActionState, useEffect, useState } from "react";
import { enviarPorEmail, registarEnvioWhatsApp, type EstadoEnvio } from "./enviar-acoes";

/**
 * Botões para enviar um link (diagnóstico, proposta, plano…) ao cliente.
 *
 * - "Enviar já" → sai pela app (Resend), de geral@numerocinco.pt, e fica no
 *   histórico. Precisa da RESEND_API_KEY no Netlify.
 * - "Abrir no meu email" / "WhatsApp" → abrem a tua app já preenchida, para
 *   quando quiseres que saia de ti. Não enviam nada por nós.
 */
export function EnviarLink({
  caminho,
  assunto,
  mensagem,
  telefone,
  email,
  clienteId,
}: {
  /** Caminho relativo do link público, ex.: /r/proposta/xxxx */
  caminho: string;
  assunto: string;
  /** Texto antes do link. O link é acrescentado no fim. */
  mensagem: string;
  telefone?: string | null;
  email?: string | null;
  clienteId?: string | null;
}) {
  const [origem, setOrigem] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [waAberto, setWaAberto] = useState(false);
  const [estado, enviar, aEnviar] = useActionState<EstadoEnvio, FormData>(enviarPorEmail, {
    ok: false,
    msg: "",
  });
  const [estadoWa, registarWa, aRegistarWa] = useActionState<EstadoEnvio, FormData>(
    registarEnvioWhatsApp,
    { ok: false, msg: "" },
  );

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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Enviar já pela app (Resend) — só se houver email */}
        {email && (
          <form action={enviar}>
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="assunto" value={assunto} />
            <input type="hidden" name="mensagem" value={mensagem} />
            <input type="hidden" name="url" value={url} />
            {clienteId && <input type="hidden" name="cliente_id" value={clienteId} />}
            <button
              type="submit"
              disabled={aEnviar || !origem}
              className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-60"
            >
              {aEnviar ? "A enviar…" : "Enviar já por email ✈️"}
            </button>
          </form>
        )}

        <a
          href={whatsapp}
          target="_blank"
          rel="noopener"
          onClick={() => setWaAberto(true)}
          className="rounded-full bg-[#25D366] px-4 py-2 text-sm font-bold text-white"
        >
          WhatsApp
        </a>
        <a
          href={mailto}
          className="rounded-full border-2 border-gold-dark px-4 py-2 text-sm font-bold text-gold-dark"
        >
          Abrir no meu email
        </a>
        <button
          type="button"
          onClick={copiar}
          className="rounded-full border border-line px-4 py-2 text-sm font-bold text-grey hover:text-ink"
        >
          {copiado ? "Copiado ✓" : "Copiar link"}
        </button>
      </div>

      {/* Depois de abrir o WhatsApp, confirmar o envio deixa rasto no CRM */}
      {waAberto && clienteId && !estadoWa.ok && (
        <form action={registarWa}>
          <input type="hidden" name="cliente_id" value={clienteId} />
          <input type="hidden" name="assunto" value={assunto} />
          <button
            type="submit"
            disabled={aRegistarWa}
            className="text-xs font-bold text-[#128C7E] underline disabled:opacity-60"
          >
            {aRegistarWa ? "A registar…" : "✓ Enviaste? marca no histórico"}
          </button>
        </form>
      )}

      {estado.msg && (
        <p className={`text-sm ${estado.ok ? "text-good" : "text-bad"}`}>{estado.msg}</p>
      )}
      {estadoWa.msg && (
        <p className={`text-sm ${estadoWa.ok ? "text-good" : "text-bad"}`}>{estadoWa.msg}</p>
      )}
    </div>
  );
}
