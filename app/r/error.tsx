"use client";

// Fronteira de erro das páginas partilhadas com o cliente (/r/**). Tom calmo,
// sem jargão técnico — quem chega aqui é um cliente, não o operador.
import { useEffect } from "react";
import { Simbolo } from "@/components/marca/Simbolo";
import { registarErro } from "@/lib/observabilidade";

export default function ErroPublico({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    registarErro("app/r/error", error, { digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 text-ink">
      <div className="max-w-md text-center">
        <Simbolo fundo="claro" className="mx-auto mb-8 h-auto w-24" titulo="Nº 5" />
        <h1 className="mb-3 font-display text-3xl">Estamos a tratar disto.</h1>
        <p className="mb-8 text-grey">
          Esta página teve um problema momentâneo. Tenta atualizar — se continuar, o link pode ter expirado; fala com a
          equipa do Nº 5.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center rounded-lg bg-gold px-5 py-2.5 font-medium text-ink transition hover:opacity-90"
        >
          Atualizar
        </button>
      </div>
    </main>
  );
}
