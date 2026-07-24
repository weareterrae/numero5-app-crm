"use client";

import { useState } from "react";
import { guardarCasos } from "@/app/(app)/propostas/acoes";

export type Caso = {
  chave: string;
  marca: string;
  setor: string | null;
  o_que: string;
  resultado: string | null;
  imagem_url: string | null;
};

export function CasosPicker({
  propostaId,
  casos,
  selecionadosIniciais,
  setorCliente,
}: {
  propostaId: string;
  casos: Caso[];
  selecionadosIniciais: string[];
  setorCliente: string | null;
}) {
  const [sel, setSel] = useState<string[]>(selecionadosIniciais);
  const [estado, setEstado] = useState("");

  const palavras = (setorCliente ?? "").toLowerCase().split(/[\s/,]+/).filter((w) => w.length > 3);
  const sugerido = (c: Caso) => palavras.some((w) => (c.setor ?? "").toLowerCase().includes(w));

  async function toggle(chave: string) {
    const novo = sel.includes(chave) ? sel.filter((x) => x !== chave) : [...sel, chave];
    setSel(novo);
    setEstado("A guardar…");
    const r = await guardarCasos(propostaId, novo);
    setEstado(r.ok ? "Guardado ✓" : `⚠️ ${r.erro}`);
    setTimeout(() => setEstado(""), 1800);
  }

  if (casos.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-display text-lg font-extrabold">Casos a mostrar</h2>
        <p className="mt-1 text-sm text-soft">
          Ainda sem casos. Corre a migração <code>0009_casos.sql</code> no Supabase.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">Casos a mostrar</h2>
        {estado && <span className="text-xs font-bold text-good">{estado}</span>}
      </div>
      <p className="mb-3 text-xs text-soft">
        Escolhe o que já fizemos para mostrar ao cliente. As sugestões (⭐) são do setor dele.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {casos.map((c) => {
          const on = sel.includes(c.chave);
          return (
            <button
              key={c.chave}
              type="button"
              onClick={() => toggle(c.chave)}
              className={`flex gap-3 rounded-lg border p-2.5 text-left transition ${
                on ? "border-gold bg-gold/5" : "border-line hover:border-gold/50"
              }`}
            >
              {c.imagem_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.imagem_url}
                  alt={c.marca}
                  className="h-12 w-16 shrink-0 rounded object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">
                  {c.marca} {sugerido(c) && <span title="Do setor do cliente">⭐</span>}
                </p>
                <p className="truncate text-xs text-grey">{c.setor}</p>
                {c.resultado && <p className="truncate text-[11px] text-gold-dark">{c.resultado}</p>}
              </div>
              <span className={`shrink-0 text-lg ${on ? "text-gold-dark" : "text-line"}`}>
                {on ? "✓" : "+"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
