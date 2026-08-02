"use client";

import { useState } from "react";
import { decidirPlanoSede } from "@/app/sede/plano/acoes";

type Decisao = "aprovado" | "alteracoes" | "recusado";

export function DecisaoPlanoSede({ planoId, estado }: { planoId: string; estado: string }) {
  const [decidido, setDecidido] = useState<string | null>(
    estado === "aprovado" || estado === "recusado" ? estado : null,
  );
  const [escolha, setEscolha] = useState<Decisao | null>(null);
  const [nota, setNota] = useState("");
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState("");
  const [pediuAlteracoes, setPediuAlteracoes] = useState(estado === "alteracoes");

  if (decidido === "aprovado") {
    return (
      <div className="rounded-2xl border-2 border-good bg-good/5 px-8 py-7 text-center">
        <p className="font-display text-2xl font-extrabold text-good">Plano aprovado! 🖐️</p>
        <p className="mt-2 text-sm text-grey">Obrigado. Vamos pôr isto a rolar.</p>
      </div>
    );
  }
  if (decidido === "recusado") {
    return (
      <div className="rounded-2xl border border-line bg-white px-8 py-7 text-center">
        <p className="font-display text-xl font-extrabold">Registámos a tua resposta.</p>
        <p className="mt-2 text-sm text-grey">Falamos para acertar o caminho. 🖐️</p>
      </div>
    );
  }

  async function enviar() {
    if (!escolha) return;
    setAEnviar(true);
    setErro("");
    const r = await decidirPlanoSede(planoId, escolha, nota);
    setAEnviar(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    if (escolha === "alteracoes") {
      setPediuAlteracoes(true);
      setEscolha(null);
      setNota("");
    } else {
      setDecidido(r.estado ?? escolha);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-gold bg-gold/5 px-6 py-6">
      {pediuAlteracoes && !escolha && (
        <p className="mb-3 rounded-lg bg-white p-3 text-center text-sm">
          Recebemos o teu pedido de alterações. 🖐️ Vamos ajustar e voltamos com a nova versão.
        </p>
      )}
      <p className="text-center font-display text-xl font-extrabold">O plano está bom para ti?</p>

      {!escolha ? (
        <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            onClick={() => setEscolha("aprovado")}
            className="rounded-full bg-gold px-6 py-3 font-bold text-ink transition hover:brightness-105"
          >
            Aprovar 🖐️
          </button>
          <button
            onClick={() => setEscolha("alteracoes")}
            className="rounded-full border-2 border-gold-dark bg-white px-6 py-3 font-bold text-gold-dark"
          >
            Pedir alterações
          </button>
          <button
            onClick={() => setEscolha("recusado")}
            className="rounded-full border border-line bg-white px-6 py-3 font-bold text-grey hover:text-ink"
          >
            Não avançar
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-bold">
            {escolha === "aprovado"
              ? "Queres deixar uma nota? (opcional)"
              : escolha === "alteracoes"
                ? "O que queres mudar?"
                : "Ajuda-nos a perceber porquê (opcional)"}
          </label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            placeholder={escolha === "alteracoes" ? "Ex.: trocar o reel de terça pelo produto novo…" : ""}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
          />
          {erro && <p className="mt-2 text-sm text-bad">{erro}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={enviar}
              disabled={aEnviar}
              className="rounded-full bg-gold px-6 py-2.5 font-bold text-ink disabled:opacity-60"
            >
              {aEnviar ? "A registar…" : "Enviar resposta"}
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
