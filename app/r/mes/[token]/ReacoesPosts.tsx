"use client";

import { useState, useTransition } from "react";
import { reagirPost } from "./acoes";

type Post = {
  url?: string | null;
  titulo?: string | null;
  formato?: string | null;
  tipo?: string | null;
  reach?: number | null;
  inter?: number | null;
  guardados?: number | null;
};

type Reacao = "mais" | "menos" | "favorito";

const TX = {
  pt: {
    titulo: "Diz-nos onde focar",
    ajuda: "Reage a cada publicação. Ajuda-nos a decidir o conteúdo do próximo mês.",
    mais: "Mais disto",
    menos: "Menos disto",
    favorito: "Favorito",
    alcance: "alcance",
    interacoes: "interações",
    obrigado: "Obrigado! Já registámos.",
  },
  en: {
    titulo: "Tell us where to focus",
    ajuda: "React to each post. It helps us decide next month's content.",
    mais: "More of this",
    menos: "Less of this",
    favorito: "Favourite",
    alcance: "reach",
    interacoes: "interactions",
    obrigado: "Thank you! Saved.",
  },
};

export function ReacoesPosts({
  posts,
  inicial,
  token,
  idioma = "pt",
}: {
  posts: Post[];
  inicial: Record<string, Reacao>;
  token: string;
  idioma?: "pt" | "en";
}) {
  const t = TX[idioma];
  const [estado, setEstado] = useState<Record<string, Reacao | null>>(inicial);
  const [tocado, setTocado] = useState(false);
  const [pendente, startTransition] = useTransition();

  const validos = posts.filter((p) => p.url && p.titulo);
  if (validos.length === 0) return null;

  function reagir(url: string, r: Reacao) {
    const atual = estado[url] ?? null;
    const proximo: Reacao | "" = atual === r ? "" : r;
    setEstado((s) => ({ ...s, [url]: proximo === "" ? null : proximo }));
    setTocado(true);
    startTransition(async () => {
      await reagirPost(token, url, proximo);
    });
  }

  const ATIVO: Record<Reacao, string> = {
    mais: "border-cobalt bg-cobalt/10 text-cobalt",
    menos: "border-bad bg-bad/10 text-bad",
    favorito: "border-gold-dark bg-gold/10 text-gold-dark",
  };
  const botao = (url: string, r: Reacao, rotulo: string, emoji: string) => {
    const ativo = estado[url] === r;
    return (
      <button
        type="button"
        onClick={() => reagir(url, r)}
        disabled={pendente}
        aria-pressed={ativo}
        className={`rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:opacity-60 ${
          ativo ? ATIVO[r] : "border-line text-grey hover:border-grey"
        }`}
      >
        {emoji} {rotulo}
      </button>
    );
  };

  return (
    <section className="mt-6 rounded-2xl border border-line bg-white p-6">
      <p className="rotulo !text-cobalt">{t.titulo}</p>
      <p className="mt-1 text-sm text-grey">{t.ajuda}</p>

      <ul className="mt-4 divide-y divide-line">
        {validos.map((p) => {
          const url = p.url as string;
          return (
            <li key={url} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-ink hover:text-cobalt"
                >
                  {p.titulo}
                </a>
                <p className="text-xs text-soft">
                  {p.formato ? `${p.formato} · ` : ""}
                  {typeof p.reach === "number" ? `${p.reach} ${t.alcance}` : ""}
                  {typeof p.inter === "number" ? ` · ${p.inter} ${t.interacoes}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {botao(url, "mais", t.mais, "👍")}
                {botao(url, "menos", t.menos, "👎")}
                {botao(url, "favorito", t.favorito, "⭐")}
              </div>
            </li>
          );
        })}
      </ul>

      {tocado ? <p className="mt-3 text-xs text-good">{t.obrigado}</p> : null}
    </section>
  );
}
