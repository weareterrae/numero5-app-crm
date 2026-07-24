"use client";

import { useState } from "react";
import { mudarEstadoProposta } from "@/app/(app)/propostas/acoes";

const ESTADOS: [string, string][] = [
  ["rascunho", "Rascunho"],
  ["enviada", "Enviada"],
  ["aceite", "Aceite"],
  ["recusada", "Recusada"],
];

const CORES: Record<string, string> = {
  rascunho: "bg-line/70 text-grey",
  enviada: "bg-cobalt/10 text-cobalt",
  aceite: "bg-good/15 text-good",
  recusada: "bg-bad/10 text-bad",
};

export function EstadoProposta({ id, estado }: { id: string; estado: string }) {
  const [escolhido, setEscolhido] = useState(estado);
  const precisaMotivo = escolhido === "recusada" && estado !== "recusada";

  return (
    <form action={mudarEstadoProposta} className="rounded-xl border border-line bg-white p-3">
      <input type="hidden" name="id" value={id} />
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${CORES[estado]}`}>
          {ESTADOS.find(([v]) => v === estado)?.[1] ?? estado}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          name="estado"
          value={escolhido}
          onChange={(e) => setEscolhido(e.target.value)}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
        >
          {ESTADOS.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
        <button
          disabled={escolhido === estado}
          className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream disabled:opacity-40"
        >
          Mudar
        </button>
      </div>
      {precisaMotivo && (
        <input
          name="motivo_recusa"
          required
          placeholder="Porque é que recusou? (obrigatório)"
          className="mt-2 w-full rounded-lg border border-bad/40 px-3 py-2 text-sm"
        />
      )}
      <p className="mt-2 max-w-60 text-[11px] text-soft">
        Enviada move o cliente para <b>Proposta</b>. Aceite passa a <b>Cliente</b> e cria a avença.
        Recusada dá como <b>Perdido</b>.
      </p>
    </form>
  );
}
