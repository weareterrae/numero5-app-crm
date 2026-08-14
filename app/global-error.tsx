"use client";

// Rede de segurança final: só dispara se o próprio layout raiz rebentar. Substitui
// todo o documento, por isso traz o seu <html>/<body> e estilos embutidos (não pode
// depender do globals.css nem de componentes que talvez não montem).
import { useEffect } from "react";
import { registarErro } from "@/lib/observabilidade";

export default function ErroGlobal({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    registarErro("app/global-error", error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="pt">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F5F4F0",
          color: "#15181D",
          fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <svg viewBox="0 0 210 110" width="96" height="50" style={{ margin: "0 auto 32px", display: "block" }} aria-label="Nº 5">
            <g strokeWidth={16} strokeLinecap="round" fill="none">
              <path stroke="#15181D" d="M25 8 V102 M75 8 V102 M125 8 V102 M175 8 V102" />
              <path stroke="#E8A13C" d="M4 88 L200 20" />
            </g>
          </svg>
          <h1 style={{ fontSize: "1.75rem", margin: "0 0 12px" }}>Algo correu mal.</h1>
          <p style={{ color: "#5A5F68", margin: "0 0 32px" }}>Já registámos o problema. Tenta recarregar a página.</p>
          <button
            onClick={reset}
            style={{
              display: "inline-flex",
              alignItems: "center",
              border: "none",
              cursor: "pointer",
              borderRadius: 8,
              background: "#E8A13C",
              color: "#15181D",
              fontWeight: 500,
              padding: "10px 20px",
            }}
          >
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
