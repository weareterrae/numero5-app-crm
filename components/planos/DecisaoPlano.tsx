"use client";

import { useState } from "react";
import { decidirPlano } from "@/app/r/plano/[token]/acoes";
import type { Idioma } from "@/lib/dominio/intake";

type Decisao = "aprovado" | "alteracoes" | "recusado";

const TX = {
  pt: {
    aprovadoT: "Plano aprovado! 🖐️",
    aprovadoS: "Obrigado. Vamos pôr isto a rolar.",
    recusadoT: "Registámos a tua resposta.",
    recusadoS: "Falamos para acertar o caminho. 🖐️",
    pedidoNota: "Recebemos o teu pedido de alterações. 🖐️ Vamos ajustar e voltamos com a nova versão.",
    pergunta: "O plano está bom para ti?",
    aprovar: "Aprovar 🖐️",
    alteracoes: "Pedir alterações",
    naoAvancar: "Não avançar",
    labelAprovado: "Queres deixar uma nota? (opcional)",
    labelAlteracoes: "O que queres mudar?",
    labelRecusado: "Ajuda-nos a perceber porquê (opcional)",
    phAlteracoes: "Ex.: trocar o reel de terça pelo produto novo…",
    aRegistar: "A registar…",
    enviar: "Enviar resposta",
    voltar: "Voltar",
  },
  en: {
    aprovadoT: "Plan approved! 🖐️",
    aprovadoS: "Thank you. Let's get this rolling.",
    recusadoT: "We've noted your response.",
    recusadoS: "We'll talk to fine-tune the path. 🖐️",
    pedidoNota: "We got your change request. 🖐️ We'll adjust and come back with the new version.",
    pergunta: "Is the plan good for you?",
    aprovar: "Approve 🖐️",
    alteracoes: "Request changes",
    naoAvancar: "Don't proceed",
    labelAprovado: "Want to leave a note? (optional)",
    labelAlteracoes: "What would you like to change?",
    labelRecusado: "Help us understand why (optional)",
    phAlteracoes: "e.g. swap Tuesday's reel for the new product…",
    aRegistar: "Saving…",
    enviar: "Send response",
    voltar: "Back",
  },
};

export function DecisaoPlano({
  token,
  estado,
  idioma = "pt",
}: {
  token: string;
  estado: string;
  idioma?: Idioma;
}) {
  const t = TX[idioma];
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
        <p className="font-display text-2xl font-extrabold text-good">{t.aprovadoT}</p>
        <p className="mt-2 text-sm text-grey">{t.aprovadoS}</p>
      </div>
    );
  }
  if (decidido === "recusado") {
    return (
      <div className="rounded-2xl border border-line bg-white px-8 py-7 text-center">
        <p className="font-display text-xl font-extrabold">{t.recusadoT}</p>
        <p className="mt-2 text-sm text-grey">{t.recusadoS}</p>
      </div>
    );
  }

  async function enviar() {
    if (!escolha) return;
    setAEnviar(true);
    setErro("");
    const r = await decidirPlano(token, escolha, nota);
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
        <p className="mb-3 rounded-lg bg-white p-3 text-center text-sm">{t.pedidoNota}</p>
      )}
      <p className="text-center font-display text-xl font-extrabold">{t.pergunta}</p>

      {!escolha ? (
        <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            onClick={() => setEscolha("aprovado")}
            className="rounded-full bg-gold px-6 py-3 font-bold text-ink transition hover:brightness-105"
          >
            {t.aprovar}
          </button>
          <button
            onClick={() => setEscolha("alteracoes")}
            className="rounded-full border-2 border-gold-dark bg-white px-6 py-3 font-bold text-gold-dark"
          >
            {t.alteracoes}
          </button>
          <button
            onClick={() => setEscolha("recusado")}
            className="rounded-full border border-line bg-white px-6 py-3 font-bold text-grey hover:text-ink"
          >
            {t.naoAvancar}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-bold">
            {escolha === "aprovado"
              ? t.labelAprovado
              : escolha === "alteracoes"
                ? t.labelAlteracoes
                : t.labelRecusado}
          </label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            placeholder={escolha === "alteracoes" ? t.phAlteracoes : ""}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
          />
          {erro && <p className="mt-2 text-sm text-bad">{erro}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={enviar}
              disabled={aEnviar}
              className="rounded-full bg-gold px-6 py-2.5 font-bold text-ink disabled:opacity-60"
            >
              {aEnviar ? t.aRegistar : t.enviar}
            </button>
            <button
              onClick={() => {
                setEscolha(null);
                setErro("");
              }}
              className="rounded-full px-4 py-2.5 text-sm font-bold text-grey hover:text-ink"
            >
              {t.voltar}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
