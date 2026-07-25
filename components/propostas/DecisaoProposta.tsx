"use client";

import { useState } from "react";
import { decidirProposta } from "@/app/r/proposta/[token]/acoes";
import type { Idioma } from "@/lib/dominio/intake";

const TX = {
  pt: {
    aceiteT: "Aceite. Damos cá cinco! 🖐️",
    aceiteS: "Obrigado pela confiança. Entramos em contacto para arrancar.",
    recusaT: "Registámos a tua resposta.",
    recusaS: "Obrigado pelo tempo. Se um dia fizer sentido, a porta fica aberta. 🖐️",
    pergunta: "O que dizes?",
    aceito: "Aceito a proposta 🖐️",
    naoAvanco: "Ainda não avanço",
    labelAceite: "Boa! Queres deixar uma nota? (opcional)",
    labelRecusa: "Ajuda-nos a melhorar: o que te fez decidir assim? (opcional)",
    phAceite: "Ex.: o exemplo da Terrae convenceu-me…",
    phRecusa: "Ex.: ficou acima do que tinha para investir agora…",
    aRegistar: "A registar…",
    confirmar: "Confirmar — aceito 🖐️",
    enviar: "Enviar resposta",
    voltar: "Voltar",
  },
  en: {
    aceiteT: "Accepted. High five! 🖐️",
    aceiteS: "Thanks for the trust. We'll be in touch to get started.",
    recusaT: "We've noted your response.",
    recusaS: "Thanks for your time. If it ever makes sense, the door stays open. 🖐️",
    pergunta: "What do you say?",
    aceito: "I accept the proposal 🖐️",
    naoAvanco: "Not right now",
    labelAceite: "Great! Want to leave a note? (optional)",
    labelRecusa: "Help us improve: what made you decide this way? (optional)",
    phAceite: "e.g. the Terrae example won me over…",
    phRecusa: "e.g. it was above what I can invest right now…",
    aRegistar: "Saving…",
    confirmar: "Confirm — I accept 🖐️",
    enviar: "Send response",
    voltar: "Back",
  },
};

export function DecisaoProposta({
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
    estado === "aceite" || estado === "recusada" ? estado : null,
  );
  const [escolha, setEscolha] = useState<"aceite" | "recusada" | null>(null);
  const [nota, setNota] = useState("");
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState("");

  if (decidido === "aceite") {
    return (
      <div className="rounded-2xl border-2 border-good bg-good/5 px-8 py-7 text-center">
        <p className="font-display text-2xl font-extrabold text-good">{t.aceiteT}</p>
        <p className="mt-2 text-sm text-grey">{t.aceiteS}</p>
      </div>
    );
  }
  if (decidido === "recusada") {
    return (
      <div className="rounded-2xl border border-line bg-white px-8 py-7 text-center">
        <p className="font-display text-xl font-extrabold">{t.recusaT}</p>
        <p className="mt-2 text-sm text-grey">{t.recusaS}</p>
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
      <p className="text-center font-display text-xl font-extrabold">{t.pergunta}</p>

      {!escolha ? (
        <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            onClick={() => setEscolha("aceite")}
            className="rounded-full bg-gold px-7 py-3 font-bold text-ink transition hover:brightness-105"
          >
            {t.aceito}
          </button>
          <button
            onClick={() => setEscolha("recusada")}
            className="rounded-full border border-line bg-white px-7 py-3 font-bold text-grey hover:text-ink"
          >
            {t.naoAvanco}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-bold">
            {escolha === "aceite" ? t.labelAceite : t.labelRecusa}
          </label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            placeholder={escolha === "aceite" ? t.phAceite : t.phRecusa}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
          />
          {erro && <p className="mt-2 text-sm text-bad">{erro}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={enviar}
              disabled={aEnviar}
              className="rounded-full bg-gold px-6 py-2.5 font-bold text-ink disabled:opacity-60"
            >
              {aEnviar ? t.aRegistar : escolha === "aceite" ? t.confirmar : t.enviar}
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
