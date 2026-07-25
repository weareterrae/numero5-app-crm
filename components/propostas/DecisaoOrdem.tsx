"use client";

import { useState } from "react";
import { decidirOrdem } from "@/app/r/ordem/[token]/acoes";

type Idioma = "pt" | "en";

const TX = {
  pt: {
    aceitar: "Aceitar",
    recusar: "Recusar",
    esclarecer: "Pedir esclarecimento",
    notaPh: "Escreve a tua dúvida ou observação (opcional)",
    enviar: "Enviar",
    cancelar: "Cancelar",
  },
  en: {
    aceitar: "Accept",
    recusar: "Decline",
    esclarecer: "Ask a question",
    notaPh: "Write your question or note (optional)",
    enviar: "Send",
    cancelar: "Cancel",
  },
} as const;

export function DecisaoOrdem({ token, idioma }: { token: string; idioma: Idioma }) {
  const t = TX[idioma];
  const [modo, setModo] = useState<null | "esclarecimento">(null);

  return (
    <div className="mt-5 space-y-3">
      {modo === "esclarecimento" ? (
        <form action={decidirOrdem.bind(null, token, "esclarecimento")} className="space-y-2">
          <textarea
            name="nota"
            rows={3}
            placeholder={t.notaPh}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
          />
          <div className="flex gap-2">
            <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-cream">{t.enviar}</button>
            <button
              type="button"
              onClick={() => setModo(null)}
              className="rounded-full border border-line px-5 py-2 text-sm font-bold text-grey"
            >
              {t.cancelar}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <form action={decidirOrdem.bind(null, token, "aceite")}>
            <button className="rounded-full bg-gold px-6 py-2.5 text-sm font-bold text-ink">
              {t.aceitar} 🖐️
            </button>
          </form>
          <button
            type="button"
            onClick={() => setModo("esclarecimento")}
            className="rounded-full border-2 border-gold-dark px-5 py-2.5 text-sm font-bold text-gold-dark"
          >
            {t.esclarecer}
          </button>
          <form action={decidirOrdem.bind(null, token, "recusada")}>
            <button className="rounded-full border border-line px-5 py-2.5 text-sm font-bold text-grey">
              {t.recusar}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
