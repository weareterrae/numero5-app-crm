"use client";

import { useState, useRef, useEffect } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const CHIPS = [
  "O que fizeram por mim este mês?",
  "Quantas leads tenho por responder?",
  "Dá-me 3 ideias para o próximo mês",
  "Explica-me o último relatório",
];

export function AssistenteSede({ marca }: { marca: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [aPensar, setAPensar] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, aPensar]);

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
    <div className="mt-6 flex h-[62vh] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {msgs.length === 0 ? (
          <div className="text-sm text-grey">
            <p className="mb-4">
              Olá! 🖐️ Sou o assistente de <b>{marca}</b> — conheço o teu negócio, o teu plano e os teus
              números. Pergunta-me o que quiseres, ou começa por aqui:
            </p>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => enviar(c)}
                  className="rounded-full border border-line bg-cream px-3.5 py-1.5 text-sm font-bold text-ink hover:border-gold"
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
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
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
            <div className="rounded-2xl bg-cream px-4 py-2.5 text-sm text-soft">a pensar…</div>
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
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreve a tua pergunta…"
          className="flex-1 rounded-full border border-line bg-cream px-4 py-2.5 text-sm outline-none focus:border-gold"
        />
        <button
          type="submit"
          disabled={aPensar || !texto.trim()}
          className="rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-ink disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
