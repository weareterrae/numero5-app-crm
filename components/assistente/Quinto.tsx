"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Simbolo } from "@/components/marca/Simbolo";

type Msg = { papel: "equipa" | "quinto"; texto: string };

const ATALHOS = [
  "O que faço a seguir com este cliente?",
  "Como respondo a «é caro»?",
  "Escreve-me um email de seguimento",
  "Que pacote faz sentido aqui?",
];

export function Quinto() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [aPensar, setAPensar] = useState(false);
  const [aCarregar, setACarregar] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  // Sabe que cliente estás a ver — é isto que o torna útil.
  const clienteId = pathname?.match(/^\/clientes\/([0-9a-f-]{36})/i)?.[1] ?? null;

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, aPensar]);

  // Carrega o fio condutor guardado — por cliente, ou o geral.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setACarregar(true);
    const url = clienteId ? `/api/ia/chat?cliente_id=${clienteId}` : "/api/ia/chat";
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (vivo) setMsgs(d.mensagens ?? []);
      })
      .catch(() => {})
      .finally(() => vivo && setACarregar(false));
    return () => {
      vivo = false;
    };
  }, [aberto, clienteId]);

  async function enviar(pergunta?: string) {
    const q = (pergunta ?? texto).trim();
    if (!q || aPensar) return;
    setMsgs([...msgs, { papel: "equipa", texto: q }]);
    setTexto("");
    setAPensar(true);
    try {
      const r = await fetch("/api/ia/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mensagem: q, cliente_id: clienteId }),
      });
      const d = await r.json();
      setMsgs((m) => [...m, { papel: "quinto", texto: d.erro ? `⚠️ ${d.erro}` : d.resposta }]);
    } catch {
      setMsgs((m) => [...m, { papel: "quinto", texto: "⚠️ Não consegui responder. Tenta de novo." }]);
    }
    setAPensar(false);
  }

  async function limpar() {
    if (!confirm("Apagar este fio de conversa?")) return;
    const url = clienteId ? `/api/ia/chat?cliente_id=${clienteId}` : "/api/ia/chat";
    await fetch(url, { method: "DELETE" });
    setMsgs([]);
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        aria-label="Falar com o Quinto"
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-3 shadow-lg transition hover:brightness-125 sm:bottom-5 sm:right-5"
      >
        <Simbolo fundo="escuro" className="w-7" />
        <span className="text-sm font-bold text-cream">Quinto</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 flex justify-end sm:inset-auto sm:bottom-5 sm:right-5">
      <div className="flex h-[70dvh] w-full flex-col rounded-2xl border border-line bg-cream shadow-2xl sm:h-[560px] sm:w-96">
        {/* Cabeçalho */}
        <header className="flex items-center gap-2.5 rounded-t-2xl bg-ink px-4 py-3">
          <Simbolo fundo="escuro" className="w-8" />
          <div className="flex-1">
            <p className="font-display text-sm font-extrabold text-cream">Quinto</p>
            <p className="text-[11px] text-soft">
              {clienteId ? "a ver a ficha deste cliente" : "o quinto elemento da equipa"}
            </p>
          </div>
          {msgs.length > 0 && (
            <button
              onClick={limpar}
              className="px-1.5 text-[11px] text-soft hover:text-cream"
              title="Apagar este fio"
            >
              limpar
            </button>
          )}
          <button
            onClick={() => setAberto(false)}
            aria-label="Fechar"
            className="px-1 text-xl leading-none text-soft hover:text-cream"
          >
            ×
          </button>
        </header>

        {/* Conversa */}
        <div className="flex-1 space-y-3 overflow-y-auto p-3.5">
          {aCarregar && <p className="text-sm text-soft">a recuperar a conversa…</p>}
          {!aCarregar && msgs.length === 0 && (
            <div>
              <p className="text-sm text-grey">
                Dá cá cinco. 🖐️ Pergunta-me o que precisares — sobre um cliente, sobre preços, ou
                para te escrever alguma coisa.
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                {ATALHOS.map((a) => (
                  <button
                    key={a}
                    onClick={() => enviar(a)}
                    className="rounded-lg border border-line bg-white px-3 py-2 text-left text-[13px] text-grey hover:border-gold hover:text-ink"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                m.papel === "equipa"
                  ? "ml-auto bg-ink text-cream"
                  : "border border-line bg-white text-ink"
              }`}
            >
              {m.texto}
            </div>
          ))}

          {aPensar && (
            <div className="max-w-[85%] rounded-2xl border border-line bg-white px-3.5 py-2.5 text-sm text-soft">
              a pensar…
            </div>
          )}
          <div ref={fim} />
        </div>

        {/* Escrever */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
          className="flex gap-2 border-t border-line bg-white p-2.5"
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Pergunta ao Quinto…"
            className="flex-1 rounded-full border border-line px-3.5 py-2 text-sm outline-none focus:border-gold"
          />
          <button
            disabled={aPensar || !texto.trim()}
            className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-ink disabled:opacity-40"
          >
            →
          </button>
        </form>
      </div>
    </div>
  );
}
