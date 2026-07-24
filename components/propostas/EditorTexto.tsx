"use client";

import { useState } from "react";
import { guardarConteudo } from "@/app/(app)/propostas/acoes";
import type { ConteudoProposta, DossierProposta } from "@/lib/ia/prompts/proposta";

const VAZIO: ConteudoProposta = {
  abertura: "",
  objetivo: "",
  prioridades: [],
  porque_n5: "",
  fecho: "",
};

export function EditorTexto({
  id,
  inicial,
  dossier,
}: {
  id: string;
  inicial: ConteudoProposta | null;
  dossier: DossierProposta;
}) {
  const [c, setC] = useState<ConteudoProposta>(inicial ?? VAZIO);
  const [aEscrever, setAEscrever] = useState(false);
  const [estado, setEstado] = useState("");

  async function escreverComIA() {
    setAEscrever(true);
    setEstado("O estratega do Cinco está a escrever…");
    try {
      const r = await fetch("/api/ia/proposta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(dossier),
      });
      const d = await r.json();
      if (d.erro) {
        setEstado(`⚠️ ${d.erro}`);
      } else {
        setC(d.conteudo);
        // Guarda já: senão o link de partilha mostrava a proposta sem texto.
        const g = await guardarConteudo(id, d.conteudo);
        setEstado(
          g.ok
            ? "Escrita pela IA e guardada ✓ — lê e ajusta o que quiseres."
            : `Escrita, mas não consegui guardar: ${g.erro}`,
        );
      }
    } catch {
      setEstado("⚠️ Não consegui contactar o servidor.");
    }
    setAEscrever(false);
  }

  async function guardar() {
    setEstado("A guardar…");
    const r = await guardarConteudo(id, c);
    setEstado(r.ok ? "Guardado ✓" : `⚠️ ${r.erro}`);
    setTimeout(() => setEstado(""), 2500);
  }

  const campo = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold";

  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">O texto da proposta</h2>
        <button
          type="button"
          onClick={escreverComIA}
          disabled={aEscrever}
          className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink disabled:opacity-60"
        >
          {aEscrever ? "A escrever…" : "✨ Escrever com IA"}
        </button>
      </div>
      {estado && <p className="mb-3 text-sm font-bold text-gold-dark">{estado}</p>}

      <label className="mb-1 block text-xs font-bold text-grey">Onde estás hoje</label>
      <textarea
        rows={5}
        value={c.abertura}
        onChange={(e) => setC({ ...c, abertura: e.target.value })}
        className={campo}
        placeholder="Dois parágrafos honestos sobre o ponto de partida…"
      />

      <label className="mt-3 mb-1 block text-xs font-bold text-grey">Onde queremos chegar</label>
      <textarea
        rows={3}
        value={c.objetivo}
        onChange={(e) => setC({ ...c, objetivo: e.target.value })}
        className={campo}
      />

      <div className="mt-4 mb-1 flex items-center justify-between">
        <label className="text-xs font-bold text-grey">O que vamos resolver — e porquê</label>
        <button
          type="button"
          onClick={() => setC({ ...c, prioridades: [...c.prioridades, { titulo: "", texto: "" }] })}
          className="text-xs font-bold text-gold-dark"
        >
          + juntar
        </button>
      </div>
      {c.prioridades.length === 0 && (
        <p className="text-xs text-soft">Sem prioridades ainda — a IA gera-as a partir do diagnóstico.</p>
      )}
      {c.prioridades.map((p, i) => (
        <div key={i} className="mb-2 rounded-lg border border-line p-2.5">
          <div className="flex gap-2">
            <span className="numero text-sm">{i + 1}</span>
            <input
              value={p.titulo}
              onChange={(e) =>
                setC({
                  ...c,
                  prioridades: c.prioridades.map((x, j) =>
                    j === i ? { ...x, titulo: e.target.value } : x,
                  ),
                })
              }
              placeholder="Título"
              className="flex-1 rounded border border-line px-2 py-1.5 text-sm font-bold"
            />
            <button
              type="button"
              onClick={() => setC({ ...c, prioridades: c.prioridades.filter((_, j) => j !== i) })}
              className="text-xs text-bad"
            >
              remover
            </button>
          </div>
          <textarea
            rows={2}
            value={p.texto}
            onChange={(e) =>
              setC({
                ...c,
                prioridades: c.prioridades.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)),
              })
            }
            className="mt-1.5 w-full rounded border border-line px-2 py-1.5 text-sm"
          />
        </div>
      ))}

      <label className="mt-3 mb-1 block text-xs font-bold text-grey">Porquê o Nº 5</label>
      <textarea
        rows={3}
        value={c.porque_n5}
        onChange={(e) => setC({ ...c, porque_n5: e.target.value })}
        className={campo}
      />

      <label className="mt-3 mb-1 block text-xs font-bold text-grey">Fecho</label>
      <textarea
        rows={2}
        value={c.fecho}
        onChange={(e) => setC({ ...c, fecho: e.target.value })}
        className={campo}
      />

      <button
        type="button"
        onClick={guardar}
        className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-bold text-cream"
      >
        Guardar texto
      </button>
    </section>
  );
}
