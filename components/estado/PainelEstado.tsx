"use client";

import { Simbolo } from "@/components/marca/Simbolo";
import { useEstado } from "./useEstado";

/** Painel completo do estado da IA de todas as marcas do grupo. */
export function PainelEstado() {
  const { dados, erro, carregando, recarregar } = useEstado();
  const sites = dados?.sites ?? [];
  const baixos = sites.filter((s) => s.estado !== "verde");
  const todosOk = !!dados?.todos_ok && !erro;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Simbolo className="w-12" titulo="Nº 5" />
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Estado dos Sistemas</h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold">
            Controlo de Operações · IA das marcas
          </p>
        </div>
      </div>

      <div
        className={`mb-4 flex items-center gap-4 border border-line border-l-[3px] bg-white p-5 ${
          todosOk ? "border-l-good" : "border-l-bad"
        }`}
      >
        <span className="text-2xl">{carregando && !dados ? "⏳" : todosOk ? "🟢" : "🔴"}</span>
        <div>
          {carregando && !dados ? (
            <p className="font-display text-lg font-extrabold">A verificar…</p>
          ) : todosOk ? (
            <>
              <p className="font-display text-lg font-extrabold">Tudo operacional</p>
              <p className="text-sm text-soft">
                <span className="numero">{sites.length}</span> assistentes a responder
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-extrabold">
                <span className="numero text-cobalt">{erro ? "?" : baixos.length}</span> em baixo
              </p>
              <p className="text-sm text-soft">
                {erro ? "não consegui verificar" : baixos.map((s) => s.nome).join(" · ")}
              </p>
            </>
          )}
        </div>
      </div>

      <ul className="divide-y divide-line border border-line bg-white">
        {sites.map((s) => {
          const v = s.estado === "verde";
          return (
            <li key={s.nome} className="flex items-center gap-3 px-4 py-3.5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${v ? "bg-good" : "bg-bad"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{s.nome}</p>
                <p className="font-mono text-[11px] text-soft">{s.detalhe}</p>
              </div>
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.14em] ${v ? "text-good" : "text-bad"}`}
              >
                {v ? "no ar" : "em baixo"}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 text-center">
        <p className="font-mono text-[11px] text-soft">
          {dados
            ? `verificado às ${new Date(dados.verificado).toLocaleTimeString("pt-PT", {
                hour: "2-digit",
                minute: "2-digit",
              })} · usa "Atualizar agora" para verificar já`
            : "—"}
        </p>
        <button
          onClick={() => recarregar()}
          className="mt-3 bg-gold px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-ink transition hover:bg-gold-dark hover:text-white"
        >
          Atualizar agora
        </button>
      </div>
    </div>
  );
}
