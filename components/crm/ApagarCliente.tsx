"use client";

import { apagarCliente } from "@/app/(app)/clientes/acoes";

export function ApagarCliente({ id, nome }: { id: string; nome: string }) {
  return (
    <form
      action={apagarCliente}
      onSubmit={(e) => {
        if (
          !confirm(
            `Apagar ${nome} e TUDO o que lhe está ligado (diagnósticos, propostas, avenças, produção)?\n\nIsto não se pode desfazer.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-full border border-bad px-4 py-2 text-sm font-bold text-bad hover:bg-bad hover:text-white"
      >
        Apagar cliente
      </button>
    </form>
  );
}
