"use client";

import { useState } from "react";
import type { ConteudoGuia } from "@/lib/ia/prompts/guia";
import type { Lacuna } from "@/lib/dominio/guia";

type Resposta = {
  proximoPasso: { acao: string; porque: string };
  lacunas: Lacuna[];
  guia: ConteudoGuia | null;
  aviso?: string | null;
};

export function Guia({ clienteId, nome }: { clienteId: string; nome: string }) {
  const [r, setR] = useState<Resposta | null>(null);
  const [aPedir, setAPedir] = useState(false);
  const [erro, setErro] = useState("");

  async function pedir() {
    setAPedir(true);
    setErro("");
    try {
      const res = await fetch("/api/ia/guia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cliente_id: clienteId }),
      });
      const d = await res.json();
      if (d.erro) setErro(d.erro);
      else setR(d);
    } catch {
      setErro("Não consegui contactar o servidor.");
    }
    setAPedir(false);
  }

  return (
    <section className="rounded-xl border-2 border-cobalt/25 bg-cobalt/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="rotulo !text-cobalt">antes de falares com ele</p>
          <h2 className="font-display text-lg font-extrabold">Preparar a conversa</h2>
        </div>
        <button
          type="button"
          onClick={pedir}
          disabled={aPedir}
          className="rounded-full bg-cobalt px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {aPedir ? "A preparar…" : r ? "Atualizar" : "Preparar-me 🎯"}
        </button>
      </div>

      {erro && <p className="mt-3 text-sm text-bad">{erro}</p>}
      {!r && !erro && (
        <p className="mt-2 text-sm text-grey">
          Lê tudo o que sabemos do {nome} e diz-te o que fazer, o que perguntar e o que evitar.
        </p>
      )}

      {r && (
        <div className="mt-4 space-y-4">
          {/* Próximo passo — sempre, mesmo sem IA */}
          <div className="rounded-lg bg-ink p-4 text-cream">
            <p className="rotulo !text-gold">o próximo passo</p>
            <p className="mt-1 font-display text-lg font-extrabold">{r.proximoPasso.acao}</p>
            <p className="mt-0.5 text-sm text-soft">{r.proximoPasso.porque}</p>
          </div>

          {/* Lacunas — determinístico */}
          {r.lacunas.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-bold">Falta saber</h3>
              <ul>
                {r.lacunas.map((l) => (
                  <li key={l.campo} className="border-b border-line/60 py-1.5 text-sm last:border-0">
                    <b className={l.critico ? "text-bad" : "text-gold-dark"}>
                      {l.critico ? "⚠️ " : "• "}
                      {l.campo}
                    </b>
                    <span className="text-grey"> — {l.porque}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.aviso && <p className="text-xs text-soft">⚠️ {r.aviso}</p>}

          {r.guia && (
            <>
              <p className="text-sm">{r.guia.resumo}</p>

              <div className="rounded-lg border border-cobalt/20 bg-white p-3">
                <p className="rotulo !text-cobalt">objetivo desta conversa</p>
                <p className="mt-0.5 text-sm font-bold">{r.guia.objetivo_da_conversa}</p>
              </div>

              <Bloco titulo="Antes de ligares" itens={r.guia.preparacao} />
              <Bloco titulo="Perguntas a fazer" itens={r.guia.perguntas} numerado />

              {r.guia.argumentos?.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-sm font-bold">Argumentos que pegam neste cliente</h3>
                  {r.guia.argumentos.map((a, i) => (
                    <div key={i} className="border-b border-line/60 py-2 last:border-0">
                      <p className="text-sm font-bold">{a.ponto}</p>
                      <p className="text-xs text-grey">{a.porque}</p>
                    </div>
                  ))}
                </div>
              )}

              <Bloco titulo="Cuidado com" itens={r.guia.cuidados} aviso />

              <div className="rounded-lg border-2 border-gold bg-gold/10 p-3">
                <p className="rotulo">a seguir à conversa</p>
                <p className="mt-0.5 text-sm font-bold">{r.guia.proxima_acao}</p>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Bloco({
  titulo,
  itens,
  numerado,
  aviso,
}: {
  titulo: string;
  itens?: string[];
  numerado?: boolean;
  aviso?: boolean;
}) {
  if (!itens?.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-bold">{titulo}</h3>
      <ul>
        {itens.map((x, i) => (
          <li key={i} className="flex gap-2 border-b border-line/60 py-1.5 text-sm last:border-0">
            <span className={aviso ? "text-bad" : "text-gold-dark"}>
              {aviso ? "⛔" : numerado ? `${i + 1}.` : "•"}
            </span>
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
