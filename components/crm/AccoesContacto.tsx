"use client";

import { useTransition } from "react";
import { registarContacto } from "@/app/(app)/leads/[org]/acoes";
import {
  linkEmail,
  linkTelefone,
  linkWhatsapp,
  assuntoEmailPadrao,
  corpoEmailPadrao,
  mensagemWhatsappPadrao,
  type Lead,
} from "@/lib/dominio/crm";

/**
 * Ligar · WhatsApp · Email. Cada ação regista a atividade (e marca a 1.ª
 * resposta) e depois abre o canal com uma mensagem-modelo editável.
 */
export function AccoesContacto({
  lead,
  orgId,
  orgNome,
  slug,
}: {
  lead: Lead;
  orgId: string;
  orgNome: string;
  slug: string;
}) {
  const [pendente, iniciar] = useTransition();

  function registar(canal: "chamada" | "whatsapp" | "email") {
    const fd = new FormData();
    fd.set("lead", lead.id);
    fd.set("orgId", orgId);
    fd.set("org", slug);
    fd.set("canal", canal);
    iniciar(() => void registarContacto(fd));
  }

  const tel = linkTelefone(lead.telefone);
  const wa = linkWhatsapp(lead.telefone, mensagemWhatsappPadrao(orgNome, lead.nome));
  const mail = linkEmail(
    lead.email,
    assuntoEmailPadrao(orgNome),
    corpoEmailPadrao(orgNome, lead.nome),
  );

  const base =
    "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition disabled:opacity-40";

  return (
    <div className={`flex flex-wrap gap-2 ${pendente ? "opacity-70" : ""}`}>
      {tel ? (
        <a
          href={tel}
          onClick={() => registar("chamada")}
          className={`${base} bg-ink text-cream hover:brightness-110`}
        >
          📞 Ligar
        </a>
      ) : null}

      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => registar("whatsapp")}
          className={`${base} bg-good text-white hover:brightness-105`}
        >
          💬 WhatsApp
        </a>
      ) : null}

      {mail ? (
        <a
          href={mail}
          onClick={() => registar("email")}
          className={`${base} bg-gold text-ink hover:brightness-95`}
        >
          ✉️ Email
        </a>
      ) : null}

      {!tel && !wa && !mail && (
        <p className="text-sm text-soft">Esta lead não deixou contacto.</p>
      )}
    </div>
  );
}
