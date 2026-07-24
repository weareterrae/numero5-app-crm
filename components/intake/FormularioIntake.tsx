"use client";

import { useState } from "react";
import { Simbolo } from "@/components/marca/Simbolo";
import { OBJETIVOS, type ChaveObjetivo } from "@/lib/dominio/diagnostico/recomendacoes";
import { FAIXAS_ORCAMENTO } from "@/lib/dominio/intake";
import { CANAIS, ESCOPO_VAZIO, type ChaveCanal, type Escopo } from "@/lib/dominio/orcamento";
import { submeterIntake } from "@/app/intake/[token]/acoes";

const REDES_LINK: [string, string][] = [
  ["site", "Website"],
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["linkedin", "LinkedIn"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
];

const PECAS: [keyof Escopo["producao"], string][] = [
  ["posts", "Posts"],
  ["reels", "Reels / vídeos"],
  ["stories", "Histórias"],
];

export function FormularioIntake({
  token,
  nome,
  setor,
  websiteInicial,
  redesIniciais,
  jaSubmetido,
}: {
  token: string;
  nome: string;
  setor: string | null;
  websiteInicial: string;
  redesIniciais: Record<string, string>;
  jaSubmetido: boolean;
}) {
  const [website, setWebsite] = useState(websiteInicial);
  const [redes, setRedes] = useState<Record<string, string>>(redesIniciais);
  const [temHoje, setTemHoje] = useState("");
  const [objetivos, setObjetivos] = useState<ChaveObjetivo[]>([]);
  const [objetivosTexto, setObjetivosTexto] = useState("");
  const [orcamento, setOrcamento] = useState("");
  const [mostrarDesejos, setMostrarDesejos] = useState(false);
  const [pedido, setPedido] = useState<Escopo>({ ...ESCOPO_VAZIO });

  const [estado, setEstado] = useState<"a-preencher" | "a-enviar" | "enviado" | "erro">(
    jaSubmetido ? "a-preencher" : "a-preencher",
  );
  const [erro, setErro] = useState("");

  function toggleObjetivo(k: ChaveObjetivo) {
    setObjetivos((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  }
  function toggleCanal(k: ChaveCanal) {
    setPedido((prev) => {
      const atual = prev.canais[k] ?? { ativo: false, proprio: false };
      return { ...prev, canais: { ...prev.canais, [k]: { ...atual, ativo: !atual.ativo } } };
    });
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (objetivos.length === 0 && !objetivosTexto.trim()) {
      setErro("Diz-nos pelo menos o que gostavas de alcançar. 🖐️");
      return;
    }
    setEstado("a-enviar");
    setErro("");
    const r = await submeterIntake({
      token,
      website,
      redes,
      temHoje,
      objetivos,
      objetivosTexto,
      pedido,
      orcamento,
    });
    if (r.ok) setEstado("enviado");
    else {
      setErro(r.erro);
      setEstado("erro");
    }
  }

  if (estado === "enviado") {
    return (
      <main className="grid min-h-dvh place-items-center px-5">
        <div className="w-full max-w-md text-center">
          <Simbolo className="mx-auto mb-6 w-20" titulo="Nº 5" />
          <h1 className="font-display text-3xl font-extrabold">Recebido. Obrigado! 🖐️</h1>
          <p className="mt-3 text-grey">
            Já temos o que precisamos para preparar uma proposta à medida do {nome}. Falamos em
            breve.
          </p>
        </div>
      </main>
    );
  }

  const campo = "w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-gold";
  const chip = (on: boolean) =>
    `rounded-full border px-3.5 py-2 text-sm font-bold transition ${
      on ? "border-gold bg-gold text-ink" : "border-line bg-white text-grey hover:border-gold"
    }`;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      {/* Cabeçalho */}
      <header className="rounded-2xl bg-ink px-7 py-8 text-cream">
        <Simbolo fundo="escuro" className="mb-5 w-14" titulo="Nº 5" />
        <p className="rotulo !text-gold">diagnóstico gratuito</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight">
          Conta-nos sobre o {nome}
        </h1>
        <p className="mt-3 text-[15px] text-soft">
          Uns minutos a responder, e preparamos uma proposta pensada mesmo para ti — sem promessas de
          milagres, só o que faz sentido. 🖐️
        </p>
      </header>

      {jaSubmetido && (
        <p className="mt-4 rounded-lg border border-gold bg-gold/10 p-3 text-sm">
          Já nos tinhas enviado isto — se preencheres outra vez, ficamos com a versão mais recente.
        </p>
      )}

      <form onSubmit={enviar} className="mt-5 space-y-5">
        {/* Situação */}
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-1 font-display text-lg font-extrabold">Onde estás hoje</h2>
          <p className="mb-3 text-xs text-soft">Para percebermos o ponto de partida.</p>

          <label className="mb-1 block text-xs font-bold text-grey">O teu website (se tiveres)</label>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
            className={campo}
          />

          <label className="mt-3 mb-1.5 block text-xs font-bold text-grey">
            Onde já estás nas redes (opcional)
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {REDES_LINK.filter(([k]) => k !== "site").map(([k, nomeRede]) => (
              <input
                key={k}
                value={redes[k] ?? ""}
                onChange={(e) => setRedes({ ...redes, [k]: e.target.value })}
                placeholder={nomeRede}
                className="rounded-lg border border-line px-3 py-2 text-sm"
              />
            ))}
          </div>

          <label className="mt-3 mb-1 block text-xs font-bold text-grey">
            O que já fazes hoje em marketing? (opcional)
          </label>
          <textarea
            value={temHoje}
            onChange={(e) => setTemHoje(e.target.value)}
            rows={2}
            placeholder="Ex.: publico quando me lembro, já tentei anúncios uma vez…"
            className={campo}
          />
        </section>

        {/* Objetivos — o coração */}
        <section className="rounded-xl border-2 border-gold bg-gold/5 p-5">
          <h2 className="mb-1 font-display text-lg font-extrabold">O que gostavas de alcançar</h2>
          <p className="mb-3 text-xs text-soft">Escolhe o que fizer sentido. É a parte importante.</p>
          <div className="flex flex-wrap gap-1.5">
            {OBJETIVOS.map(([k, rotulo]) => (
              <button key={k} type="button" onClick={() => toggleObjetivo(k)} className={chip(objetivos.includes(k))}>
                {rotulo}
              </button>
            ))}
          </div>
          <textarea
            value={objetivosTexto}
            onChange={(e) => setObjetivosTexto(e.target.value)}
            rows={3}
            placeholder="Por tuas palavras: o que querias mesmo que acontecesse?"
            className={`${campo} mt-3`}
          />
        </section>

        {/* Desejos — opcional */}
        <section className="rounded-xl border border-line bg-white p-5">
          <button
            type="button"
            onClick={() => setMostrarDesejos((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <h2 className="font-display text-lg font-extrabold">Já tens uma ideia do que queres?</h2>
              <p className="text-xs text-soft">Opcional — se não fizeres ideia, deixamos isto connosco.</p>
            </div>
            <span className="text-2xl text-gold-dark">{mostrarDesejos ? "−" : "+"}</span>
          </button>

          {mostrarDesejos && (
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-bold text-grey">Em que redes gostavas de estar?</p>
                <div className="flex flex-wrap gap-1.5">
                  {CANAIS.map(([k, nomeC]) => (
                    <button key={k} type="button" onClick={() => toggleCanal(k)} className={chip(!!pedido.canais[k]?.ativo)}>
                      {nomeC}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold text-grey">Quanto conteúdo por mês, mais ou menos?</p>
                <div className="grid grid-cols-3 gap-2">
                  {PECAS.map(([campoPeca, rotulo]) => (
                    <div key={campoPeca}>
                      <label className="mb-0.5 block text-[11px] text-grey">{rotulo}</label>
                      <input
                        type="number"
                        min={0}
                        value={pedido.producao[campoPeca] || ""}
                        onChange={(e) => {
                          const v = Math.max(0, +e.target.value || 0);
                          setPedido((prev) => ({
                            ...prev,
                            producao: { ...prev.producao, [campoPeca]: v },
                          }));
                        }}
                        placeholder="0"
                        className="w-full rounded-lg border border-line px-2.5 py-2 text-sm tabular-nums"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Orçamento — opcional */}
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-1 font-display text-lg font-extrabold">Orçamento (opcional)</h2>
          <p className="mb-3 text-xs text-soft">
            Ajuda-nos a propor algo à tua medida. Sem compromisso, e podes deixar em branco.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FAIXAS_ORCAMENTO.map(([k, rotulo]) => (
              <button
                key={k}
                type="button"
                onClick={() => setOrcamento(orcamento === k ? "" : k)}
                className={chip(orcamento === k)}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </section>

        {erro && <p className="text-sm font-bold text-bad">{erro}</p>}

        <button
          type="submit"
          disabled={estado === "a-enviar"}
          className="w-full rounded-full bg-gold px-6 py-3.5 text-lg font-bold text-ink transition hover:brightness-105 disabled:opacity-60"
        >
          {estado === "a-enviar" ? "A enviar…" : "Enviar 🖐️"}
        </button>
        <p className="text-center text-xs text-soft">
          {setor ? `${setor} · ` : ""}Os teus dados servem só para prepararmos a tua proposta.
        </p>
      </form>
    </main>
  );
}
