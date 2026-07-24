"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { mudarEstado } from "@/app/(app)/clientes/acoes";
import { ESTADO_LABEL, PERCURSO, exigeMotivo, type Estado } from "@/lib/dominio/funil";
import { euros } from "@/lib/dominio/metricas";
import type { Cliente } from "@/lib/db/clientes";

/**
 * Kanban do funil. Arrastar-e-largar no computador (HTML5 nativo, sem dependências);
 * no telemóvel, onde arrastar entre colunas é frustrante, cada cartão tem um seletor
 * de estado que faz o mesmo. Mesma ação, dois caminhos.
 */
export function Kanban({ clientes }: { clientes: Cliente[] }) {
  const [aArrastar, setAArrastar] = useState<string | null>(null);
  const [sobre, setSobre] = useState<Estado | null>(null);
  const [pendente, iniciar] = useTransition();

  const colunas: Estado[] = [...PERCURSO, "perdido"];

  function mover(clienteId: string, para: Estado, atual: Estado) {
    if (para === atual) return;
    let motivo: string | null = null;
    if (exigeMotivo(para)) {
      motivo = window.prompt("Porque é que se perdeu este negócio?");
      if (!motivo || !motivo.trim()) return; // sem motivo, não avança
    }
    const fd = new FormData();
    fd.set("id", clienteId);
    fd.set("estado", para);
    if (motivo) fd.set("motivo_perda", motivo.trim());
    iniciar(() => {
      void mudarEstado(fd);
    });
  }

  return (
    <div className={`grid gap-3 md:grid-cols-3 xl:grid-cols-6 ${pendente ? "opacity-60" : ""}`}>
      {colunas.map((col) => {
        const doEstado = clientes.filter((c) => c.estado === col);
        const total = doEstado.reduce((t, c) => t + (Number(c.valor_estimado) || 0), 0);
        return (
          <section
            key={col}
            onDragOver={(e) => {
              e.preventDefault();
              setSobre(col);
            }}
            onDragLeave={() => setSobre((s) => (s === col ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setSobre(null);
              const id = e.dataTransfer.getData("text/plain") || aArrastar;
              const c = clientes.find((x) => x.id === id);
              if (c) mover(c.id, col, c.estado);
              setAArrastar(null);
            }}
            className={`rounded-xl border p-2.5 transition ${
              sobre === col ? "border-gold bg-gold/5" : "border-line bg-white/60"
            }`}
          >
            <header className="mb-2 px-1">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wide text-grey">
                  {ESTADO_LABEL[col]}
                </h2>
                <span className="numero text-sm">{doEstado.length}</span>
              </div>
              {total > 0 && <p className="font-mono text-[11px] text-soft">{euros(total)}</p>}
            </header>

            <div className="space-y-2">
              {doEstado.map((c) => (
                <article
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", c.id);
                    setAArrastar(c.id);
                  }}
                  onDragEnd={() => setAArrastar(null)}
                  className={`rounded-lg border border-line bg-white p-2.5 ${
                    aArrastar === c.id ? "opacity-40" : ""
                  } md:cursor-grab md:active:cursor-grabbing`}
                >
                  <Link href={`/clientes/${c.id}`} className="block">
                    <p className="truncate text-sm font-bold">{c.nome_marca}</p>
                    {c.setor && <p className="truncate text-xs text-grey">{c.setor}</p>}
                    {c.valor_estimado ? (
                      <p className="mt-0.5 font-mono text-[11px] text-gold-dark">
                        {euros(c.valor_estimado)}
                      </p>
                    ) : null}
                  </Link>
                  {/* Caminho alternativo — essencial no telemóvel */}
                  <select
                    aria-label={`Mudar estado de ${c.nome_marca}`}
                    value={c.estado}
                    onChange={(e) => mover(c.id, e.target.value as Estado, c.estado)}
                    className="mt-2 w-full rounded border border-line bg-cream px-1.5 py-1 text-[11px] text-grey"
                  >
                    {colunas.map((e) => (
                      <option key={e} value={e}>
                        {ESTADO_LABEL[e]}
                      </option>
                    ))}
                  </select>
                </article>
              ))}
              {doEstado.length === 0 && (
                <p className="px-1 py-3 text-center text-xs text-soft">vazio</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
