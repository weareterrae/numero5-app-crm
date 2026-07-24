"use client";

import { useState } from "react";
import { CRITERIOS_REDE, pontuarRede } from "@/lib/dominio/diagnostico/pontuacao";
import { OBJETIVOS, type ChaveObjetivo, type Recomendacao } from "@/lib/dominio/diagnostico/recomendacoes";
import type { Resultado } from "@/lib/dominio/diagnostico/verificacoes";
import { guardarDiagnostico, type RedeAvaliada } from "@/app/(app)/diagnosticos/acoes";

type ResultadoComTitulo = Resultado & { titulo?: string };

const REDES_POSSIVEIS = [
  "Instagram",
  "Facebook",
  "LinkedIn",
  "YouTube",
  "TikTok",
  "X",
  "Google Business",
  "Outro",
];

const ICONE: Record<string, string> = { ok: "✅", warn: "⚠️", bad: "❌" };

export function Editor({
  id,
  inicial,
}: {
  id: string;
  inicial: {
    site_url: string | null;
    site_score: number | null;
    site_resultado: ResultadoComTitulo[];
    redes_scorecard: RedeAvaliada[];
    estado_atual: Record<string, string>;
    objetivos: { selecionados: ChaveObjetivo[]; texto_livre: string };
    recomendacoes: Recomendacao[];
  };
}) {
  const [siteUrl, setSiteUrl] = useState(inicial.site_url ?? "");
  const [nota, setNota] = useState<number | null>(inicial.site_score);
  const [resultados, setResultados] = useState<ResultadoComTitulo[]>(inicial.site_resultado ?? []);
  const [veredito, setVeredito] = useState("");
  const [aAnalisar, setAAnalisar] = useState(false);
  const [erroSite, setErroSite] = useState("");

  const [redes, setRedes] = useState<RedeAvaliada[]>(inicial.redes_scorecard ?? []);
  const [atual, setAtual] = useState<Record<string, string>>(inicial.estado_atual ?? {});
  const [objetivos, setObjetivos] = useState<ChaveObjetivo[]>(inicial.objetivos?.selecionados ?? []);
  const [textoLivre, setTextoLivre] = useState(inicial.objetivos?.texto_livre ?? "");
  const [recs, setRecs] = useState<Recomendacao[]>(inicial.recomendacoes ?? []);
  const [aGuardar, setAGuardar] = useState(false);
  const [guardado, setGuardado] = useState("");

  async function analisar() {
    if (!siteUrl.trim()) return;
    setAAnalisar(true);
    setErroSite("");
    try {
      const r = await fetch("/api/analisar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: siteUrl.trim() }),
      });
      const d = await r.json();
      if (d.erro) {
        setErroSite(d.erro);
      } else {
        setNota(d.nota);
        setResultados(d.resultados);
        setVeredito(d.veredito);
      }
    } catch {
      setErroSite("Não consegui contactar o servidor. Tenta de novo.");
    }
    setAAnalisar(false);
  }

  function juntarRede(nome: string) {
    if (redes.some((r) => r.nome === nome)) return;
    setRedes([...redes, { nome, notas: [null, null, null, null, null], obs: "" }]);
  }

  function definirNota(iRede: number, iCrit: number, valor: number) {
    setRedes(
      redes.map((r, i) =>
        i === iRede ? { ...r, notas: r.notas.map((n, j) => (j === iCrit ? valor : n)) } : r,
      ),
    );
  }

  async function guardar() {
    setAGuardar(true);
    setGuardado("");
    const res = await guardarDiagnostico({
      id,
      site_url: siteUrl.trim() || null,
      site_score: nota,
      site_resultado: resultados,
      redes_scorecard: redes,
      estado_atual: atual,
      objetivos: { selecionados: objetivos, texto_livre: textoLivre },
    });
    setAGuardar(false);
    if (res.ok) {
      setRecs(res.recomendacoes);
      setGuardado("Guardado ✓");
      setTimeout(() => setGuardado(""), 2500);
    } else {
      setGuardado(res.erro ?? "Erro ao guardar.");
    }
  }

  return (
    <div className="space-y-5">
      {/* ---------- 1. Análise do site ---------- */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-1 font-display text-lg font-extrabold">1. O site, por dentro</h2>
        <p className="mb-3 text-xs text-soft">11 verificações automáticas.</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://o-site-do-cliente.pt"
            className="min-w-50 flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
          />
          <button
            type="button"
            onClick={analisar}
            disabled={aAnalisar}
            className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink disabled:opacity-60"
          >
            {aAnalisar ? "A analisar…" : "Analisar ⚡"}
          </button>
        </div>
        {erroSite && <p className="mt-2 text-sm text-bad">{erroSite}</p>}

        {nota !== null && resultados.length > 0 && (
          <div className="mt-4">
            <div className="flex items-baseline gap-3">
              <span className="numero text-4xl">
                {nota}
                <span className="text-lg text-soft">/10</span>
              </span>
              {veredito && <span className="text-sm font-bold">{veredito}</span>}
            </div>
            <ul className="mt-3">
              {resultados.map((r) => (
                <li key={r.codigo} className="flex gap-2 border-b border-line/60 py-2 last:border-0">
                  <span>{ICONE[r.estado]}</span>
                  <div className="text-sm">
                    <b>{r.titulo ?? r.codigo}</b> — {r.detalhe}
                    {r.dica && <p className="text-xs text-grey">→ {r.dica}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------- 2. Scorecard das redes ---------- */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-1 font-display text-lg font-extrabold">2. As redes, ao teu olho</h2>
        <p className="mb-3 text-xs text-soft">
          As redes não se leem por robô — aqui entra o teu critério. ✗ fraco · ~ médio · ✓ bom
        </p>

        <div className="mb-4 flex flex-wrap gap-1.5">
          {REDES_POSSIVEIS.filter((n) => !redes.some((r) => r.nome === n)).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => juntarRede(n)}
              className="rounded-full border border-line px-3 py-1 text-xs font-bold text-grey hover:border-gold hover:text-gold-dark"
            >
              + {n}
            </button>
          ))}
        </div>

        {redes.length === 0 && <p className="text-sm text-soft">Junta as redes que o cliente tem.</p>}

        {redes.map((rede, i) => {
          const n = pontuarRede(rede.notas);
          return (
            <div key={rede.nome} className="mb-3 rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <b className="text-sm">{rede.nome}</b>
                <div className="flex items-center gap-3">
                  <span
                    className={`font-display text-lg font-extrabold ${
                      n === null ? "text-soft" : n >= 7 ? "text-good" : n >= 4 ? "text-warn" : "text-bad"
                    }`}
                  >
                    {n === null ? "—" : `${n}/10`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRedes(redes.filter((_, j) => j !== i))}
                    className="text-xs text-bad"
                  >
                    remover
                  </button>
                </div>
              </div>
              {CRITERIOS_REDE.map((crit, j) => (
                <div key={crit} className="flex items-center justify-between gap-2 border-t border-line/50 py-1.5">
                  <span className="text-xs">{crit}</span>
                  <div className="flex shrink-0 gap-1">
                    {[0, 1, 2].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => definirNota(i, j, v)}
                        className={`h-7 w-8 rounded border text-xs ${
                          rede.notas[j] === v
                            ? v === 0
                              ? "border-bad bg-bad text-white"
                              : v === 1
                                ? "border-warn bg-warn text-ink"
                                : "border-good bg-good text-white"
                            : "border-line bg-white text-soft"
                        }`}
                      >
                        {v === 0 ? "✗" : v === 1 ? "~" : "✓"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <input
                value={rede.obs}
                onChange={(e) =>
                  setRedes(redes.map((r, k) => (k === i ? { ...r, obs: e.target.value } : r)))
                }
                placeholder="Observações (opcional)"
                className="mt-2 w-full rounded border border-line px-2 py-1.5 text-xs"
              />
            </div>
          );
        })}
      </section>

      {/* ---------- 3. Estado atual vs. pretendido ---------- */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-1 font-display text-lg font-extrabold">3. Onde está e onde quer chegar</h2>
        <p className="mb-3 text-xs text-soft">É daqui que sai a proposta.</p>

        <h3 className="mb-2 text-sm font-bold text-gold-dark">O que tem hoje</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["site", "Site"],
            ["redes", "Redes sociais"],
            ["presenca", "Presença geral / notoriedade"],
            ["ferramentas", "Ferramentas que já usa"],
            ["orcamento_atual", "Quanto investe hoje (se souberes)"],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="mb-1 block text-xs font-bold text-grey">{label}</label>
              <input
                value={atual[k] ?? ""}
                onChange={(e) => setAtual({ ...atual, [k]: e.target.value })}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>

        <h3 className="mt-5 mb-2 text-sm font-bold text-gold-dark">O que pretende</h3>
        <div className="flex flex-wrap gap-1.5">
          {OBJETIVOS.map(([chave, rotulo]) => {
            const ligado = objetivos.includes(chave);
            return (
              <button
                key={chave}
                type="button"
                onClick={() =>
                  setObjetivos(ligado ? objetivos.filter((o) => o !== chave) : [...objetivos, chave])
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                  ligado
                    ? "border-gold bg-gold text-ink"
                    : "border-line bg-white text-grey hover:border-gold"
                }`}
              >
                {rotulo}
              </button>
            );
          })}
        </div>
        <textarea
          value={textoLivre}
          onChange={(e) => setTextoLivre(e.target.value)}
          rows={3}
          placeholder="Por palavras dele: o que quer mesmo alcançar…"
          className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm"
        />
      </section>

      {/* ---------- Guardar ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={aGuardar}
          className="rounded-full bg-gold px-6 py-2.5 font-bold text-ink disabled:opacity-60"
        >
          {aGuardar ? "A guardar…" : "Guardar e calcular 🖐️"}
        </button>
        {guardado && <span className="text-sm font-bold text-good">{guardado}</span>}
      </div>

      {/* ---------- 4. Onde a Nº 5 ajuda ---------- */}
      <section className="rounded-xl border-2 border-gold bg-gold/5 p-5">
        <h2 className="mb-1 font-display text-lg font-extrabold">4. Onde a Nº 5 pode ajudar</h2>
        <p className="mb-3 text-xs text-soft">
          Gerado a partir do que foi encontrado e do que o cliente disse querer. Cada linha diz de onde
          veio.
        </p>
        {recs.length === 0 ? (
          <p className="text-sm text-soft">
            Preenche em cima e carrega em «Guardar e calcular».
          </p>
        ) : (
          recs.map((r, i) => (
            <div key={i} className="border-b border-gold/20 py-2.5 last:border-0">
              <div className="flex items-start gap-2">
                <span className="numero text-sm">{r.prioridade}</span>
                <div>
                  <b className="text-sm">{r.titulo}</b>
                  <p className="text-sm text-grey">{r.descricao}</p>
                  <p className="mt-0.5 text-[11px] text-soft">
                    {r.origem} · sugere <b className="uppercase">{r.pacote_sugerido}</b>
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
