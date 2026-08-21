"use client";

import { useState, useTransition } from "react";
import { definirTrafego } from "@/app/(app)/ai-operations/acoes";

const PASSOS = [0, 10, 25, 50, 100];

/**
 * A válvula do rollout, por assistente.
 *
 * Desenho deliberado: subir tráfego pede confirmação (é expor clientes
 * reais ao caminho novo), mas voltar a 0 é IMEDIATO e sem perguntas —
 * num incidente, ninguém quer estar a ler diálogos.
 */
export function ControloTrafego({
  assistantId, nome, gatewayEnabled, percentagem,
}: {
  assistantId: string;
  nome: string;
  gatewayEnabled: boolean;
  percentagem: number;
}) {
  const [pct, setPct] = useState(percentagem);
  const [aGuardar, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function aplicar(novo: number) {
    if (novo === pct) return;
    // Subir expõe visitantes reais; descer é sempre seguro.
    if (novo > pct && !confirm(
      `Enviar ${novo}% do tráfego do ${nome} pelo N5 AI Gateway?\n\n` +
      `O caminho antigo continua a servir os restantes ${100 - novo}%. ` +
      `Podes voltar a 0% a qualquer momento, sem deploy.`,
    )) return;

    setErro(null);
    iniciar(async () => {
      const r = await definirTrafego(assistantId, novo);
      if (r.ok) setPct(r.percentagem);
      else setErro(r.erro);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-line" role="group" aria-label={`Tráfego do ${nome}`}>
        {PASSOS.map((p) => {
          const ativo = pct === p;
          return (
            <button
              key={p}
              type="button"
              disabled={aGuardar}
              onClick={() => aplicar(p)}
              aria-pressed={ativo}
              className={`px-2.5 py-1.5 font-mono text-[11px] font-bold transition disabled:opacity-50 ${
                ativo
                  ? p === 0 ? "bg-ink text-cream" : "bg-gold text-ink"
                  : "bg-white text-grey hover:bg-cream"
              }`}
            >
              {p}%
            </button>
          );
        })}
      </div>

      <span className="font-mono text-[10px] uppercase tracking-wide text-soft">
        {aGuardar ? "a guardar…" : gatewayEnabled && pct > 0 ? "gateway" : "legacy"}
      </span>

      {erro && <span className="text-[11px] font-bold text-bad">{erro}</span>}
    </div>
  );
}
