"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

export type Slide = {
  chave: string;
  rotulo: string;
  valor?: string;
  titulo: string;
  sub?: string;
  cta?: { texto: string; href: string };
};

const DURACAO = 6000; // ms por cartão

export default function MesEm60s({ slides, cor }: { slides: Slide[]; cor: string }) {
  const [i, setI] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const inicio = useRef<number>(0);
  const raf = useRef<number>(0);

  const total = slides.length;
  const avancar = useCallback(() => setI((n) => Math.min(n + 1, total - 1)), [total]);
  const recuar = useCallback(() => setI((n) => Math.max(n - 1, 0)), []);

  const ultimo = i >= total - 1;

  useEffect(() => {
    setProgresso(0);
    if (pausado || ultimo) return;
    const reduz =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduz) return; // sem auto-avanço para quem prefere menos movimento

    inicio.current = 0;
    const passo = (t: number) => {
      if (!inicio.current) inicio.current = t;
      const decorrido = t - inicio.current;
      const p = Math.min(decorrido / DURACAO, 1);
      setProgresso(p);
      if (p >= 1) {
        avancar();
      } else {
        raf.current = requestAnimationFrame(passo);
      }
    };
    raf.current = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf.current);
  }, [i, pausado, ultimo, avancar]);

  const s = slides[i];

  return (
    <div
      className="relative mx-auto flex max-w-md flex-col overflow-hidden rounded-3xl bg-ink text-cream select-none"
      style={{ minHeight: "72vh" }}
    >
      {/* barras de progresso */}
      <div className="flex gap-1.5 p-3">
        {slides.map((sl, n) => (
          <div key={sl.chave} className="h-1 flex-1 overflow-hidden rounded-full bg-cream/25">
            <div
              className="h-full rounded-full bg-cream transition-[width] duration-100 ease-linear"
              style={{ width: n < i ? "100%" : n === i ? `${progresso * 100}%` : "0%" }}
            />
          </div>
        ))}
      </div>

      {/* zonas de toque */}
      <button
        aria-label="Anterior"
        onClick={recuar}
        className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-default focus:outline-none"
      />
      <button
        aria-label="Seguinte"
        onClick={avancar}
        className="absolute inset-y-0 right-0 z-10 w-1/3 cursor-default focus:outline-none"
      />
      <button
        aria-label={pausado ? "Retomar" : "Pausar"}
        onClick={() => setPausado((p) => !p)}
        className="absolute inset-y-0 left-1/3 z-10 w-1/3 cursor-default focus:outline-none"
      />

      {/* conteúdo */}
      <div key={s.chave} className="anim-entra flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="rotulo" style={{ color: cor }}>
          {s.rotulo}
        </div>
        {s.valor ? (
          <div
            className="mt-3 font-display text-7xl font-extrabold leading-none"
            style={{ color: cor }}
          >
            {s.valor}
          </div>
        ) : null}
        <h2 className="mt-4 font-display text-2xl font-extrabold text-balance">{s.titulo}</h2>
        {s.sub ? <p className="mt-2 text-sm text-cream/70 text-balance">{s.sub}</p> : null}
        {s.cta ? (
          <Link
            href={s.cta.href}
            className="relative z-20 mt-6 rounded-full px-6 py-2.5 text-sm font-bold text-ink"
            style={{ background: cor }}
          >
            {s.cta.texto}
          </Link>
        ) : null}
      </div>

      {/* rodapé */}
      <div className="relative z-20 flex items-center justify-between px-5 pb-5 pt-2 text-[11px] text-cream/50">
        <span>
          {i + 1} / {total}
        </span>
        {ultimo ? (
          <button onClick={() => setI(0)} className="font-bold text-cream/80 hover:text-cream">
            ↺ ver outra vez
          </button>
        ) : (
          <span>toca para avançar</span>
        )}
      </div>

      <style>{`
        .anim-entra { animation: mes60 .5s ease both; }
        @keyframes mes60 { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .anim-entra { animation: none; } }
      `}</style>
    </div>
  );
}
