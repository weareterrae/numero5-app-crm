"use client";

/**
 * A fila de incidentes, com o botão que faltava.
 *
 * Os incidentes já eram registados e já eram mostrados. O que não havia
 * era forma de os FECHAR — e uma fila que ninguém consegue fechar deixa
 * de ser um alarme e passa a ser decoração. Chegou a 36 abertos, zero
 * lidos, enquanto o sistema recuperava sozinho de tudo.
 *
 * DUAS FORMAS DE FECHAR, e a segunda é a que se usa
 *
 * Um a um, para o que merece ser visto de perto. Por tipo, para o que
 * vem aos molhos: um modelo doente abre três incidentes no mesmo minuto
 * e recupera três minutos depois. Sem o fecho em massa, ninguém fecha
 * nada — e é assim que se chega a 36.
 *
 * NÃO APAGA. Fechar é dizer «vi e está tratado», e isso fica registado
 * com a data. Um incidente apagado leva consigo a prova de que houve
 * falha, que é precisamente o que se quer poder consultar depois.
 */
import { useState, useTransition } from "react";
import { resolverIncidente, resolverPorTipo } from "@/app/(app)/ai-operations/acoes";

export type Incidente = {
  id: string;
  tipo: string;
  severidade: string;
  titulo: string;
  detalhe: Record<string, unknown> | null;
  created_at: string;
};

/** Quanto tempo passou, em português de quem lê à pressa. */
function desde(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export function Incidentes({ abertos, total }: { abertos: Incidente[]; total: number }) {
  const [pendente, comecar] = useTransition();
  const [feito, setFeito] = useState<string | null>(null);

  if (!abertos.length) {
    return (
      <section className="rounded-xl border-2 border-good/40 bg-good/5 p-5">
        <h2 className="font-display text-lg font-extrabold">Sem incidentes por resolver</h2>
        <p className="mt-1 text-sm text-grey">
          O sistema continua a registá-los. Silêncio aqui quer dizer que não há nada
          por olhar — não que nada falhou.
        </p>
      </section>
    );
  }

  // Agrupados por tipo: é assim que eles chegam, e é assim que se fecham.
  const porTipo = new Map<string, Incidente[]>();
  for (const i of abertos) {
    if (!porTipo.has(i.tipo)) porTipo.set(i.tipo, []);
    porTipo.get(i.tipo)!.push(i);
  }

  return (
    <section className="rounded-xl border-2 border-warn bg-warn/5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">Incidentes por resolver</h2>
        <span className="font-mono text-xs text-soft">
          {total} aberto{total === 1 ? "" : "s"}
          {total > abertos.length ? ` · a mostrar ${abertos.length}` : ""}
        </span>
      </div>

      <p className="mt-1 max-w-2xl text-sm text-grey">
        Fechar é dizer «vi e está tratado» — não apaga nada. A maior parte destes
        recupera sozinha; o que interessa é alguém ter olhado.
      </p>

      {feito && <p className="mt-3 text-sm font-bold text-good">{feito}</p>}

      <div className="mt-4 space-y-4">
        {[...porTipo].map(([tipo, lista]) => (
          <div key={tipo} className="rounded-lg border border-line bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs font-bold">{tipo}</span>
                <span className="text-xs text-soft">
                  {lista.length}× · o mais recente {desde(lista[0].created_at)}
                </span>
              </div>
              {lista.length > 1 && (
                <button
                  disabled={pendente}
                  onClick={() => comecar(async () => {
                    const r = await resolverPorTipo(tipo);
                    setFeito(r.ok ? `${r.fechados} incidente(s) de ${tipo} fechados.` : r.erro);
                  })}
                  className="rounded-full border-2 border-line px-3 py-1 text-xs font-bold text-grey transition hover:text-ink disabled:opacity-40"
                >
                  Fechar os {lista.length}
                </button>
              )}
            </div>

            <ul className="mt-2 space-y-1">
              {lista.slice(0, 5).map((i) => (
                <li key={i.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                    i.severidade === "crit" ? "bg-bad/15 text-bad" : "bg-warn/15 text-warn"}`}>
                    {i.severidade}
                  </span>
                  <span className="flex-1">{i.titulo}</span>
                  <span className="font-mono text-[11px] text-soft">{desde(i.created_at)}</span>
                  <button
                    disabled={pendente}
                    onClick={() => comecar(async () => {
                      const r = await resolverIncidente(i.id);
                      setFeito(r.ok ? "Fechado." : r.erro);
                    })}
                    className="text-xs font-bold text-soft underline transition hover:text-ink disabled:opacity-40"
                  >
                    fechar
                  </button>
                </li>
              ))}
              {lista.length > 5 && (
                <li className="text-xs text-soft">e mais {lista.length - 5} do mesmo tipo</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
