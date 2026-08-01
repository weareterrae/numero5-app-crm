"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { moverLead, registarContacto } from "@/app/(app)/leads/[org]/acoes";
import { haQuantoTempo, nomeLead, urgencia, type Etapa, type Lead } from "@/lib/dominio/crm";

/**
 * Kanban de leads de um cliente (org). Arrastar-e-largar no computador;
 * no telemóvel, seletor de etapa. O cronómetro pinta as leads por responder.
 */
export function KanbanLeads({
  org,
  orgId,
  etapas,
  leads,
}: {
  org: string;
  orgId: string;
  etapas: Etapa[];
  leads: Lead[];
}) {
  const [aArrastar, setAArrastar] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function mover(leadId: string, etapaId: string, atualId: string | null) {
    if (etapaId === atualId) return;
    const destino = etapas.find((e) => e.id === etapaId);
    let motivo: string | null = null;
    if (destino?.tipo === "perdido") {
      motivo = window.prompt("Porque é que esta lead se perdeu?");
      if (!motivo || !motivo.trim()) return;
    }
    const fd = new FormData();
    fd.set("lead", leadId);
    fd.set("etapa", etapaId);
    fd.set("org", org);
    if (motivo) fd.set("motivo", motivo.trim());
    iniciar(() => void moverLead(fd));
  }

  function contactar(lead: Lead) {
    const fd = new FormData();
    fd.set("lead", lead.id);
    fd.set("orgId", orgId);
    fd.set("org", org);
    iniciar(() => void registarContacto(fd));
    const tel = lead.telefone?.replace(/[^\d+]/g, "");
    if (tel) window.open(`tel:${tel}`, "_self");
  }

  const cor = {
    ok: "border-good/50 bg-good/5",
    atencao: "border-warn/50 bg-warn/5",
    tarde: "border-bad/50 bg-bad/5",
  } as const;

  return (
    <div
      className={`grid gap-3 md:grid-cols-3 xl:grid-cols-6 ${pendente ? "opacity-60" : ""}`}
    >
      {etapas.map((col) => {
        const daEtapa = leads.filter((l) => l.etapa_id === col.id);
        return (
          <section
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setSobre(col.id);
            }}
            onDragLeave={() => setSobre((s) => (s === col.id ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setSobre(null);
              const id = e.dataTransfer.getData("text/plain") || aArrastar;
              const l = leads.find((x) => x.id === id);
              if (l) mover(l.id, col.id, l.etapa_id);
              setAArrastar(null);
            }}
            className={`rounded-xl border p-2.5 transition ${
              sobre === col.id ? "border-gold bg-gold/5" : "border-line bg-white/60"
            }`}
          >
            <header className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wide text-grey">{col.titulo}</h2>
              <span className="numero text-sm">{daEtapa.length}</span>
            </header>

            <div className="space-y-2">
              {daEtapa.map((l) => {
                const u = urgencia(l);
                return (
                  <article
                    key={l.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", l.id);
                      setAArrastar(l.id);
                    }}
                    onDragEnd={() => setAArrastar(null)}
                    className={`rounded-lg border bg-white p-2.5 ${
                      u ? cor[u] : "border-line"
                    } ${aArrastar === l.id ? "opacity-40" : ""} md:cursor-grab md:active:cursor-grabbing`}
                  >
                    <Link
                      href={`/leads/${org}/${l.id}`}
                      className="block truncate text-sm font-bold hover:underline"
                    >
                      {nomeLead(l)}
                    </Link>
                    {l.telefone && (
                      <p className="truncate font-mono text-[11px] text-grey">{l.telefone}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-soft">
                      {l.primeira_resposta_at ? "respondida" : haQuantoTempo(l.created_at)}
                      {l.fonte_detalhe ? ` · ${l.fonte_detalhe}` : ""}
                    </p>

                    <div className="mt-2 flex items-center gap-1.5">
                      {!l.primeira_resposta_at && l.telefone && (
                        <button
                          type="button"
                          onClick={() => contactar(l)}
                          className="rounded-full bg-gold px-2.5 py-1 text-[11px] font-bold text-ink hover:brightness-95"
                        >
                          Ligar ✓
                        </button>
                      )}
                      <select
                        aria-label={`Mudar etapa de ${nomeLead(l)}`}
                        value={col.id}
                        onChange={(e) => mover(l.id, e.target.value, l.etapa_id)}
                        className="min-w-0 flex-1 rounded border border-line bg-cream px-1.5 py-1 text-[11px] text-grey"
                      >
                        {etapas.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.titulo}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                );
              })}
              {daEtapa.length === 0 && (
                <p className="px-1 py-3 text-center text-xs text-soft">vazio</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
