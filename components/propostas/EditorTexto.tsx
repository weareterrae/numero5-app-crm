"use client";

import { useState } from "react";
import { guardarConteudo } from "@/app/(app)/propostas/acoes";
import type { ConteudoProposta, DossierProposta } from "@/lib/ia/prompts/proposta";

const VAZIO: ConteudoProposta = {
  abertura: "",
  objetivo: "",
  prioridades: [],
  construir: [],
  assistente: null,
  roadmap: [],
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
  const [c, setC] = useState<ConteudoProposta>({ ...VAZIO, ...(inicial ?? {}) });
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

      {/* O que vamos construir */}
      <div className="mt-4 mb-1 flex items-center justify-between">
        <label className="text-xs font-bold text-grey">O que vamos construir para ti</label>
        <button
          type="button"
          onClick={() => setC({ ...c, construir: [...c.construir, { titulo: "", texto: "" }] })}
          className="text-xs font-bold text-gold-dark"
        >
          + juntar
        </button>
      </div>
      {c.construir.length === 0 && (
        <p className="text-xs text-soft">A IA gera a partir do brief — site, automações, motor de conteúdo…</p>
      )}
      {c.construir.map((x, i) => (
        <div key={i} className="mb-2 rounded-lg border border-line p-2.5">
          <div className="flex gap-2">
            <input
              value={x.titulo}
              onChange={(e) =>
                setC({ ...c, construir: c.construir.map((y, j) => (j === i ? { ...y, titulo: e.target.value } : y)) })
              }
              placeholder="Ex.: Site montra com marcações"
              className="flex-1 rounded border border-line px-2 py-1.5 text-sm font-bold"
            />
            <button
              type="button"
              onClick={() => setC({ ...c, construir: c.construir.filter((_, j) => j !== i) })}
              className="text-xs text-bad"
            >
              remover
            </button>
          </div>
          <textarea
            rows={2}
            value={x.texto}
            onChange={(e) =>
              setC({ ...c, construir: c.construir.map((y, j) => (j === i ? { ...y, texto: e.target.value } : y)) })
            }
            className="mt-1.5 w-full rounded border border-line px-2 py-1.5 text-sm"
          />
        </div>
      ))}

      {/* Assistente à medida */}
      <div className="mt-4 mb-1 flex items-center justify-between">
        <label className="text-xs font-bold text-grey">Assistente à medida</label>
        {c.assistente ? (
          <button type="button" onClick={() => setC({ ...c, assistente: null })} className="text-xs text-bad">
            remover
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setC({ ...c, assistente: { nome: "", descricao: "" } })}
            className="text-xs font-bold text-gold-dark"
          >
            + adicionar
          </button>
        )}
      </div>
      {c.assistente && (
        <div className="mb-2 rounded-lg border border-line p-2.5">
          <input
            value={c.assistente.nome}
            onChange={(e) => setC({ ...c, assistente: { ...c.assistente!, nome: e.target.value } })}
            placeholder="Nome do assistente (à medida desta marca)"
            className="w-full rounded border border-line px-2 py-1.5 text-sm font-bold"
          />
          <textarea
            rows={2}
            value={c.assistente.descricao}
            onChange={(e) => setC({ ...c, assistente: { ...c.assistente!, descricao: e.target.value } })}
            placeholder="O que faz no dia-a-dia, na voz da marca."
            className="mt-1.5 w-full rounded border border-line px-2 py-1.5 text-sm"
          />
        </div>
      )}

      {/* Primeiros 90 dias */}
      <div className="mt-4 mb-1 flex items-center justify-between">
        <label className="text-xs font-bold text-grey">Os primeiros 90 dias</label>
        <button
          type="button"
          onClick={() => setC({ ...c, roadmap: [...c.roadmap, { fase: "", titulo: "", texto: "" }] })}
          className="text-xs font-bold text-gold-dark"
        >
          + juntar
        </button>
      </div>
      {c.roadmap.length === 0 && (
        <p className="text-xs text-soft">A IA gera 3 fases (30 / 60 / 90 dias).</p>
      )}
      {c.roadmap.map((x, i) => (
        <div key={i} className="mb-2 rounded-lg border border-line p-2.5">
          <div className="flex gap-2">
            <input
              value={x.fase}
              onChange={(e) =>
                setC({ ...c, roadmap: c.roadmap.map((y, j) => (j === i ? { ...y, fase: e.target.value } : y)) })
              }
              placeholder="Fase (ex.: Primeiros 30 dias)"
              className="w-40 rounded border border-line px-2 py-1.5 text-sm font-bold text-cobalt"
            />
            <input
              value={x.titulo}
              onChange={(e) =>
                setC({ ...c, roadmap: c.roadmap.map((y, j) => (j === i ? { ...y, titulo: e.target.value } : y)) })
              }
              placeholder="Título"
              className="flex-1 rounded border border-line px-2 py-1.5 text-sm font-bold"
            />
            <button
              type="button"
              onClick={() => setC({ ...c, roadmap: c.roadmap.filter((_, j) => j !== i) })}
              className="text-xs text-bad"
            >
              remover
            </button>
          </div>
          <textarea
            rows={2}
            value={x.texto}
            onChange={(e) =>
              setC({ ...c, roadmap: c.roadmap.map((y, j) => (j === i ? { ...y, texto: e.target.value } : y)) })
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
