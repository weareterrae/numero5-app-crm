"use client";

import { useState } from "react";
import type { PecaGerada } from "@/lib/ia/prompts/conteudo";
import { guardarPecas } from "@/app/(app)/clientes/[id]/conteudo/acoes";

const ROTULO_TIPO: Record<string, string> = {
  post: "Post",
  carrossel: "Carrossel",
  reel: "Reel",
  story: "História",
  outro: "Peça",
};

export function GeradorConteudo({
  clienteId,
  mes,
  vozInicial,
}: {
  clienteId: string;
  mes: string;
  vozInicial: string;
}) {
  const [mix, setMix] = useState({ posts: 8, carrosseis: 2, reels: 2, stories: 4 });
  const [voz, setVoz] = useState(vozInicial);
  const [temas, setTemas] = useState("");
  const [pecas, setPecas] = useState<PecaGerada[] | null>(null);
  const [aGerar, setAGerar] = useState(false);
  const [erro, setErro] = useState("");

  const total = mix.posts + mix.carrosseis + mix.reels + mix.stories;

  async function gerar() {
    setAGerar(true);
    setErro("");
    setPecas(null);
    try {
      const res = await fetch("/api/ia/conteudo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cliente_id: clienteId, mes, mix, voz, temas }),
      });
      const d = await res.json();
      if (d.erro) setErro(d.erro);
      else setPecas(d.pecas as PecaGerada[]);
    } catch {
      setErro("Não consegui contactar o servidor.");
    }
    setAGerar(false);
  }

  return (
    <section className="rounded-xl border-2 border-gold/40 bg-gold/[0.04] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="rotulo">o mês, escrito pela IA na voz da marca</p>
          <h2 className="font-display text-lg font-extrabold">Gerar conteúdo</h2>
        </div>
        <button
          type="button"
          onClick={gerar}
          disabled={aGerar || total === 0}
          className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink disabled:opacity-60"
        >
          {aGerar ? "A escrever…" : `Gerar ${total} peças ✍️`}
        </button>
      </div>

      {/* Breve */}
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <NumeroMix rotulo="Posts" valor={mix.posts} set={(v) => setMix({ ...mix, posts: v })} />
        <NumeroMix rotulo="Carrosséis" valor={mix.carrosseis} set={(v) => setMix({ ...mix, carrosseis: v })} />
        <NumeroMix rotulo="Reels" valor={mix.reels} set={(v) => setMix({ ...mix, reels: v })} />
        <NumeroMix rotulo="Histórias" valor={mix.stories} set={(v) => setMix({ ...mix, stories: v })} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-grey">Tom de voz da marca</span>
          <textarea
            value={voz}
            onChange={(e) => setVoz(e.target.value)}
            rows={3}
            placeholder="Ex.: próximo e caloroso, sem calão; trata o cliente por tu; foco na qualidade artesanal."
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-grey">Temas / notas do mês</span>
          <textarea
            value={temas}
            onChange={(e) => setTemas(e.target.value)}
            rows={3}
            placeholder="Ex.: novidades de verão, promoção de agosto, bastidores da equipa. (Podes colar o plano do mês.)"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
          />
        </label>
      </div>

      {erro && <p className="mt-3 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{erro}</p>}

      {/* Pré-visualização do que a IA gerou */}
      {pecas && (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold">
              {pecas.length} peças geradas{" "}
              <span className="font-normal text-soft">— revê e guarda</span>
            </h3>
            <form action={guardarPecas}>
              <input type="hidden" name="cliente_id" value={clienteId} />
              <input type="hidden" name="mes" value={mes} />
              <input type="hidden" name="pecas" value={JSON.stringify(pecas)} />
              <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-cream">
                Guardar estas {pecas.length} peças ↓
              </button>
            </form>
          </div>
          <div className="space-y-3">
            {pecas.map((p, i) => (
              <article key={i} className="rounded-lg border border-line bg-white p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-bold text-gold-dark">
                    {ROTULO_TIPO[p.tipo] ?? p.tipo}
                  </span>
                  <span className="text-sm font-bold">{p.tema}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-grey">{p.copy}</p>
                {!!p.slides?.length && (
                  <ol className="mt-2 space-y-1 border-l-2 border-gold/40 pl-3 text-sm">
                    {p.slides.map((s, j) => (
                      <li key={j}>
                        <span className="font-mono text-xs text-soft">{j + 1}.</span> {s}
                      </li>
                    ))}
                  </ol>
                )}
                {p.guiao && (
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-cream p-2.5 text-sm">
                    🎬 {p.guiao}
                  </p>
                )}
                {!!p.hashtags?.length && (
                  <p className="mt-2 font-mono text-xs text-cobalt">{p.hashtags.join(" ")}</p>
                )}
              </article>
            ))}
          </div>
          <p className="mt-3 text-xs text-soft">
            Só depois de guardar é que ficam na ficha. Podes gerar mais e juntar — vão somando ao mês.
          </p>
        </div>
      )}
    </section>
  );
}

function NumeroMix({
  rotulo,
  valor,
  set,
}: {
  rotulo: string;
  valor: number;
  set: (v: number) => void;
}) {
  return (
    <label className="block rounded-lg border border-line bg-white px-3 py-2">
      <span className="block text-xs font-bold text-grey">{rotulo}</span>
      <input
        type="number"
        min={0}
        max={20}
        value={valor}
        onChange={(e) => set(Math.max(0, Math.min(20, Math.round(Number(e.target.value) || 0))))}
        className="mt-0.5 w-full text-lg font-extrabold tabular-nums text-ink outline-none"
      />
    </label>
  );
}
