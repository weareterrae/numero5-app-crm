"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EstadoPill } from "./EstadoPill";
import { ESTADOS, ESTADO_LABEL, type Estado } from "@/lib/dominio/funil";
import { dataCurta, euros } from "@/lib/dominio/metricas";
import type { Cliente } from "@/lib/db/clientes";

export function ListaClientes({
  clientes,
  estadoInicial,
}: {
  clientes: Cliente[];
  estadoInicial?: string;
}) {
  const [procura, setProcura] = useState("");
  const [estado, setEstado] = useState(estadoInicial ?? "");
  const [setor, setSetor] = useState("");

  const setores = useMemo(
    () => Array.from(new Set(clientes.map((c) => c.setor).filter(Boolean))).sort() as string[],
    [clientes],
  );

  const visiveis = useMemo(() => {
    const q = procura.trim().toLowerCase();
    return clientes.filter((c) => {
      if (estado && c.estado !== estado) return false;
      if (setor && c.setor !== setor) return false;
      if (q && !`${c.nome_marca} ${c.setor ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clientes, procura, estado, setor]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={procura}
          onChange={(e) => setProcura(e.target.value)}
          placeholder="Procurar marca ou setor…"
          className="min-w-45 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-gold"
        />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
        >
          <option value="">Todos os estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {ESTADO_LABEL[e as Estado]}
            </option>
          ))}
        </select>
        {setores.length > 0 && (
          <select
            value={setor}
            onChange={(e) => setSetor(e.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
          >
            <option value="">Todos os setores</option>
            {setores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="mb-2 text-xs text-soft">
        {visiveis.length} de {clientes.length}
      </p>

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        {visiveis.length === 0 ? (
          <p className="p-5 text-sm text-soft">Nenhum cliente com estes filtros.</p>
        ) : (
          visiveis.map((c) => (
            <Link
              key={c.id}
              href={`/clientes/${c.id}`}
              className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0 hover:bg-cream"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{c.nome_marca}</p>
                <p className="truncate text-xs text-grey">
                  {[c.setor, c.website].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <EstadoPill estado={c.estado} />
              <span className="hidden w-24 text-right font-mono text-xs text-grey sm:block">
                {c.valor_estimado ? euros(c.valor_estimado) : ""}
              </span>
              <span className="hidden w-24 text-right text-xs text-soft md:block">
                {dataCurta(c.ultima_interacao_at)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
