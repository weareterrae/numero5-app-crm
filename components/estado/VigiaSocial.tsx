"use client";

import { useCallback, useEffect, useState } from "react";

type Bot = {
  marca: string;
  estado: "verde" | "amarelo" | "vermelho";
  vivo: boolean;
  cerebro: boolean | null;
  detalhe: string;
  tipo: string;
};
type Dados = {
  bots: Bot[];
  contagem: { verde: number; amarelo: number; vermelho: number };
  profundidade: boolean;
  verificado: string;
};

const COR: Record<string, { dot: string; label: string; txt: string }> = {
  verde: { dot: "#2FA36B", label: "text-good", txt: "NO AR" },
  amarelo: { dot: "#E8A13C", label: "text-gold-dark", txt: "ATENÇÃO" },
  vermelho: { dot: "#D6455D", label: "text-bad", txt: "EM BAIXO" },
};

export function VigiaSocial() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/estado-social", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setD((await r.json()) as Dados);
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const emBaixo = d ? d.contagem.vermelho + d.contagem.amarelo : 0;
  const hora = d ? new Date(d.verificado).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="mx-auto mt-8 max-w-2xl space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-extrabold tracking-tight">Bots sociais · FB/IG</h2>
        <button
          onClick={carregar}
          disabled={carregando}
          className="rounded-full border border-line px-3 py-1 text-xs font-bold text-grey transition hover:text-ink disabled:opacity-50"
        >
          {carregando ? "a verificar…" : "↻ verificar"}
        </button>
      </div>

      {erro ? (
        <p className="rounded-2xl border border-bad/30 bg-bad/5 px-4 py-3 text-sm text-bad">
          Não deu para verificar os bots agora.
        </p>
      ) : !d ? (
        <p className="rounded-2xl border border-line bg-white px-4 py-8 text-center text-sm text-soft">
          A sondar os bots…
        </p>
      ) : (
        <>
          <div className={`rounded-2xl border-l-4 bg-white p-4 shadow-sm ${emBaixo ? "border-l-bad" : "border-l-good"}`}>
            <p className="font-display text-lg font-extrabold">
              {emBaixo ? `${emBaixo} ${emBaixo > 1 ? "precisam" : "precisa"} de atenção` : "Tudo operacional"}
            </p>
            <p className="text-sm text-grey">
              <b className="text-cobalt">{d.contagem.verde}</b> a responder · verificado às {hora}
            </p>
          </div>
          <ul className="space-y-2">
            {d.bots.map((b) => {
              const c = COR[b.estado];
              return (
                <li key={b.marca} className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.dot }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{b.marca}</p>
                    <p className="truncate text-xs text-grey">
                      {b.detalhe}
                      {b.cerebro === true ? " · cérebro ok" : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 font-mono text-xs font-bold ${c.label}`}>{c.txt}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-soft">
            {d.profundidade
              ? "Profundidade ligada: a função responde, o cérebro (prompt) está acessível, e incluímos as pendentes presas (+2h) e os erros da pending_replies."
              : "Só liveness + cérebro. Para ligar a profundidade (pendentes/erros por marca), define SUPABASE_MGMT_TOKEN no Netlify."}
          </p>
        </>
      )}
    </div>
  );
}
