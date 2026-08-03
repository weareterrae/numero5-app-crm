"use client";

import { useState, useRef, useEffect } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const CHIPS = [
  "O que fizeram por mim este mês?",
  "O que mais podem fazer pelo meu negócio?",
  "Dá-me 3 ideias para o próximo mês",
  "Explica-me os meus números",
];

export function AssistenteFlutuante({ marca, cor }: { marca: string; cor?: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [aPensar, setAPensar] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const marcaCor = cor || "#E8A13C";

  useEffect(() => {
    if (aberto) fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, aPensar, aberto]);
  useEffect(() => {
    if (aberto) inputRef.current?.focus();
  }, [aberto]);

  async function enviar(pergunta: string) {
    const q = pergunta.trim();
    if (!q || aPensar) return;
    const novo: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(novo);
    setTexto("");
    setAPensar(true);
    try {
      const r = await fetch("/api/sede/assistente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mensagens: novo }),
      });
      const d = await r.json();
      setMsgs((m) => [...m, { role: "assistant", content: d.resposta || d.erro || "…" }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Não consegui responder agora. Tenta outra vez. 🖐️" }]);
    } finally {
      setAPensar(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 sm:bottom-6 sm:right-6">
      {/* Painel */}
      {aberto ? (
        <div className="mb-3 flex h-[min(560px,calc(100dvh-130px))] w-[min(380px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
          <header className="flex items-center gap-2.5 border-b border-line bg-cream px-4 py-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
              style={{ background: marcaCor }}
            >
              🖐️
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">Assistente</p>
              <p className="truncate text-[11px] text-grey">de {marca} · responde a qualquer hora</p>
            </div>
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar assistente"
              className="shrink-0 rounded-full px-2 py-1 text-lg leading-none text-soft hover:bg-white hover:text-ink"
            >
              ×
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 ? (
              <div className="text-sm text-grey">
                <p className="mb-3">
                  Olá! 🖐️ Sou o assistente de <b>{marca}</b> — conheço o teu negócio, o teu plano e os
                  teus números. Pergunta-me o que quiseres, ou começa por aqui:
                </p>
                <div className="flex flex-col gap-2">
                  {CHIPS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => enviar(c)}
                      className="rounded-xl border border-line bg-cream px-3.5 py-2 text-left text-sm font-semibold text-ink hover:border-gold"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              msgs.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                      m.role === "user" ? "bg-ink text-cream" : "bg-cream text-ink"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {aPensar ? (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-cream px-3.5 py-2.5 text-sm text-soft">a pensar…</div>
              </div>
            ) : null}
            <div ref={fimRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
            className="flex items-center gap-2 border-t border-line p-3"
          >
            <input
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escreve a tua pergunta…"
              className="flex-1 rounded-full border border-line bg-cream px-4 py-2.5 text-sm outline-none focus:border-gold"
            />
            <button
              type="submit"
              disabled={aPensar || !texto.trim()}
              className="shrink-0 rounded-full bg-gold px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      ) : null}

      {/* Bolha / lançador */}
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-label={aberto ? "Fechar assistente" : "Abrir assistente"}
        className={`ml-auto flex items-center gap-2.5 rounded-full bg-ink py-2.5 pl-2.5 pr-4 text-cream shadow-xl transition hover:brightness-110 ${
          aberto ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-base"
          style={{ background: marcaCor }}
        >
          🖐️
        </span>
        <span className="text-sm font-bold">Assistente</span>
      </button>
    </div>
  );
}
