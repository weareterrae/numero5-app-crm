"use client";

import { useState } from "react";
import { mudarEstado } from "@/app/(app)/clientes/acoes";
import { exigeMotivo, type Estado } from "@/lib/dominio/funil";

export function MudarEstado({
  clienteId,
  estadoAtual,
  estados,
}: {
  clienteId: string;
  estadoAtual: Estado;
  estados: [string, string][];
}) {
  const [escolhido, setEscolhido] = useState<Estado>(estadoAtual);
  const precisaMotivo = exigeMotivo(escolhido) && escolhido !== estadoAtual;

  return (
    <form action={mudarEstado} className="rounded-xl border border-line bg-white p-3">
      <input type="hidden" name="id" value={clienteId} />
      <label htmlFor="estado" className="mb-1.5 block text-xs font-bold text-grey">
        Estado no funil
      </label>
      <div className="flex flex-wrap gap-2">
        <select
          id="estado"
          name="estado"
          value={escolhido}
          onChange={(e) => setEscolhido(e.target.value as Estado)}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
        >
          {estados.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
        <button
          disabled={escolhido === estadoAtual}
          className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream disabled:opacity-40"
        >
          Mudar
        </button>
      </div>
      {precisaMotivo && (
        <div className="mt-2">
          <input
            name="motivo_perda"
            required
            placeholder="Porquê? (obrigatório)"
            className="w-full rounded-lg border border-bad/40 px-3 py-2 text-sm outline-none focus:border-bad"
          />
          <p className="mt-1 text-xs text-soft">
            O motivo fica registado — é assim que se aprende com os que fogem.
          </p>
        </div>
      )}
    </form>
  );
}
