"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Simbolo } from "@/components/marca/Simbolo";
import { registarErro } from "@/lib/observabilidade";

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    registarErro("app/error", error, { digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 text-ink">
      <div className="max-w-md text-center">
        <Simbolo fundo="claro" className="mx-auto mb-8 h-auto w-24" titulo="Nº 5" />
        <h1 className="mb-3 font-display text-3xl">Algo correu mal.</h1>
        <p className="mb-8 text-grey">
          Já registámos o problema. Tenta de novo — se persistir, diz-nos que tratamos disto.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center rounded-lg bg-gold px-5 py-2.5 font-medium text-ink transition hover:opacity-90"
          >
            Tentar de novo
          </button>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg border border-line px-5 py-2.5 font-medium text-ink transition hover:bg-line/40"
          >
            Voltar ao início
          </Link>
        </div>
        {error.digest ? <p className="mt-6 font-mono text-xs text-soft">ref: {error.digest}</p> : null}
      </div>
    </main>
  );
}
