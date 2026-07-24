"use client";

import { useState } from "react";
import { dataCurta } from "@/lib/dominio/metricas";

/**
 * O link que o cliente abre para preencher o diagnóstico dele.
 * Client component só para o botão de copiar; o token vem do servidor.
 */
export function LinkDiagnostico({
  token,
  submetidoEm,
}: {
  token: string | null;
  submetidoEm: string | null;
}) {
  const [copiado, setCopiado] = useState(false);
  if (!token) return null;

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/intake/${token}`
      : `/intake/${token}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* silêncio */
    }
  }

  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-extrabold">Diagnóstico do cliente</h2>
          {submetidoEm ? (
            <p className="text-sm text-good">
              ✓ Preenchido pelo cliente a {dataCurta(submetidoEm)}. Vê o diagnóstico abaixo.
            </p>
          ) : (
            <p className="text-sm text-grey">
              Envia este link ao cliente para ele contar o negócio dele por ti.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={copiar}
          className="shrink-0 rounded-full bg-gold px-4 py-2 text-sm font-bold text-ink"
        >
          {copiado ? "Copiado ✓" : "Copiar link"}
        </button>
      </div>
      <code className="mt-2 block break-all rounded-lg bg-cream px-3 py-2 text-xs text-gold-dark">
        {url}
      </code>
    </section>
  );
}
