"use client";

import { useState } from "react";
import { decidirProposta } from "@/app/r/proposta/[token]/acoes";

export function DecisaoProposta({ token, estado }: { token: string; estado: string }) {
  const [decidido, setDecidido] = useState<string | null>(
    estado === "aceite" || estado === "recusada" ? estado : null,
  );
  const [escolha, setEscolha] = useState<"aceite" | "recusada" | null>(null);
  const [nota, setNota] = useState("");
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState("");

  if (decidido === "aceite") {
    return (
      <div className="rounded-2xl border-2 border-good bg-good/5 px-8 py-7 text-center">
        <p className="font-display text-2xl font-extrabold text-good">Aceite. Damos cá cinco! 🖐️</p>
        <p className="mt-2 text-sm text-grey">
          Obrigado pela confiança. Entramos em contacto para arrancar.
        </p>
      </div>
    );
  }
  if (decidido === "recusada") {
    return (
      <div className="rounded-2xl border border-line bg-white px-8 py-7 text-center">
        <p className="font-display text-xl font-extrabold">Registámos a tua resposta.</p>
        <p className="mt-2 text-sm text-grey">
          Obrigado pelo tempo. Se um dia fizer sentido, a porta fica aberta. 🖐️
        </p>
      </div>
    );
  }

  async function enviar() {
    if (!escolha) return;
    setAEnviar(true);
    setErro("");
    const r = await decidirProposta(token, escolha, nota);
    setAEnviar(false);
    if (r.ok) setDecidido(r.estado ?? escolha);
    else setErro(r.erro);
  }

  return (
    <div className="rounded-2xl border-2 border-gold bg-gold/5 px-6 py-6">
      <p className="text-center font-display text-xl font-extrabold">O que dizes?</p>

      {!escolha ? (
        <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            onClick={() => setEscolha("aceite")}
            className="rounded-full bg-gold px-7 py-3 font-bold text-ink transition hover:brightness-105"
          >
            Aceito a proposta 🖐️
          </button>
          <button
            onClick={() => setEscolha("recusada")}
            className="rounded-full border border-line bg-white px-7 py-3 font-bold text-grey hover:text-ink"
          >
            Ainda não avanço
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-bold">
            {escolha === "aceite"
              ? "Boa! Queres deixar uma nota? (opcional)"
              : "Ajuda-nos a melhorar: o que te fez decidir assim? (opcional)"}
          </label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            placeholder={
              escolha === "aceite"
                ? "Ex.: o exemplo da Terrae convenceu-me…"
                : "Ex.: ficou acima do que tinha para investir agora…"
            }
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
          />
          {erro && <p className="mt-2 text-sm text-bad">{erro}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={enviar}
              disabled={aEnviar}
              className="rounded-full bg-gold px-6 py-2.5 font-bold text-ink disabled:opacity-60"
            >
              {aEnviar ? "A registar…" : escolha === "aceite" ? "Confirmar — aceito 🖐️" : "Enviar resposta"}
            </button>
            <button
              onClick={() => {
                setEscolha(null);
                setErro("");
              }}
              className="rounded-full px-4 py-2.5 text-sm font-bold text-grey hover:text-ink"
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
