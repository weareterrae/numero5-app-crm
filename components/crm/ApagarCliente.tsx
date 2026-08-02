"use client";

import { useState } from "react";
import { apagarCliente } from "@/app/(app)/clientes/acoes";

/**
 * Remoção definitiva com confirmação reforçada: é preciso escrever o nome do
 * cliente. (O servidor volta a validar — isto não é só teatro no browser.)
 */
export function ApagarCliente({ id, nome }: { id: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const confere = confirmacao.trim().toLowerCase() === nome.trim().toLowerCase();

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-full border border-bad px-4 py-2 text-sm font-bold text-bad hover:bg-bad hover:text-white"
      >
        Apagar cliente
      </button>
    );
  }

  return (
    <form action={apagarCliente} className="rounded-xl border-2 border-bad/50 bg-bad/5 p-4">
      <p className="text-sm font-bold text-bad">
        Isto apaga {nome} e TUDO o que lhe está ligado — diagnósticos, propostas, avenças,
        produção, histórico. Não se pode desfazer.
      </p>
      <p className="mt-2 text-xs text-grey">
        Para confirmares, escreve o nome do cliente: <b>{nome}</b>
      </p>
      <input type="hidden" name="id" value={id} />
      <input
        name="confirmacao"
        value={confirmacao}
        onChange={(e) => setConfirmacao(e.target.value)}
        placeholder={nome}
        className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-bad"
        autoComplete="off"
      />
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={!confere}
          className="rounded-full bg-bad px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apagar definitivamente
        </button>
        <button
          type="button"
          onClick={() => {
            setAberto(false);
            setConfirmacao("");
          }}
          className="rounded-full border border-line px-4 py-2 text-sm font-bold text-grey hover:bg-cream"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
