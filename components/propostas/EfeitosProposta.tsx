"use client";

import { useEffect } from "react";

/**
 * A camada de vida da proposta: barra de progresso de leitura + revelar as
 * secções ao rolar. Tudo degrada bem sem JS (o conteúdo fica visível; a classe
 * pp-on só é adicionada quando isto corre).
 */
export function EfeitosProposta() {
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.classList.add("pp-on");

    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("pp-in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12 },
    );
    document.querySelectorAll(".pp-corpo > section").forEach((el, i) => {
      (el as HTMLElement).style.transitionDelay = `${Math.min(i, 3) * 60}ms`;
      io.observe(el);
    });

    const bar = document.getElementById("pp-bar");
    const aoRolar = () => {
      const t = raiz.scrollHeight - raiz.clientHeight;
      if (bar) bar.style.width = `${t > 0 ? (raiz.scrollTop / t) * 100 : 0}%`;
    };
    window.addEventListener("scroll", aoRolar, { passive: true });
    aoRolar();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", aoRolar);
      raiz.classList.remove("pp-on");
    };
  }, []);

  return (
    <>
      <div id="pp-bar" className="pp-bar" aria-hidden />
      <div className="pp-grao" aria-hidden />
    </>
  );
}
