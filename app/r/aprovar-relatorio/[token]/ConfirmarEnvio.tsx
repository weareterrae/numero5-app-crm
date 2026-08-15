"use client";

import { useActionState } from "react";
import { confirmarEnvioRelatorio, type EstadoConfirmar } from "./acoes";

const INICIAL: EstadoConfirmar = { ok: false, msg: "" };

export function ConfirmarEnvio({ token, destino, copia }: { token: string; destino: string; copia: string }) {
  const [estado, acao, pendente] = useActionState(confirmarEnvioRelatorio, INICIAL);

  if (estado.enviado) {
    return (
      <div className="rounded-xl border border-good bg-good/10 p-5 text-center">
        <p className="font-display text-lg font-extrabold text-ink">Enviado ao cliente ✓</p>
        <p className="mt-1 text-sm text-grey">{estado.msg}</p>
      </div>
    );
  }

  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <button
        disabled={pendente}
        className="w-full rounded-full bg-ink px-6 py-3 text-sm font-bold text-cream disabled:opacity-60"
      >
        {pendente ? "A enviar…" : "Confirmar e enviar ao cliente →"}
      </button>
      <p className="text-center text-xs text-soft">
        Vai para <b className="text-ink">{destino}</b> · com-te em CC (<b className="text-ink">{copia}</b>)
      </p>
      {estado.msg && !estado.ok ? (
        <p className="rounded-lg bg-bad/10 px-3 py-2 text-center text-sm text-bad">{estado.msg}</p>
      ) : null}
    </form>
  );
}
