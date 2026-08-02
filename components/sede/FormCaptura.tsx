"use client";

import { useState } from "react";

export function FormCaptura({ token, cor }: { token: string; cor: string }) {
  const [estado, setEstado] = useState<"pronto" | "a_enviar" | "enviado" | "erro">("pronto");

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (estado === "a_enviar") return;
    const f = new FormData(e.currentTarget);
    const corpo = {
      nome: f.get("nome")?.toString() ?? "",
      email: f.get("email")?.toString() ?? "",
      telefone: f.get("telefone")?.toString() ?? "",
      mensagem: f.get("mensagem")?.toString() ?? "",
      hp: f.get("website")?.toString() ?? "", // honeypot
      pagina: typeof document !== "undefined" ? document.referrer : "",
    };
    setEstado("a_enviar");
    try {
      const r = await fetch(`/api/captura/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await r.json().catch(() => ({ ok: false }));
      setEstado(d.ok ? "enviado" : "erro");
    } catch {
      setEstado("erro");
    }
  }

  if (estado === "enviado") {
    return (
      <div className="rounded-2xl border-2 bg-white p-8 text-center" style={{ borderColor: cor }}>
        <p className="text-3xl">✅</p>
        <p className="mt-2 font-display text-xl font-extrabold">Recebido!</p>
        <p className="mt-1 text-sm text-grey">Entramos em contacto muito em breve. Obrigado!</p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-3 rounded-2xl border border-line bg-white p-6">
      {/* honeypot — invisível para pessoas */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div>
        <label htmlFor="nome" className="text-xs font-bold text-grey">O teu nome</label>
        <input id="nome" name="nome" required className="mt-1 w-full rounded-xl border border-line bg-cream/40 px-3 py-2.5 text-sm" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="text-xs font-bold text-grey">Email</label>
          <input id="email" name="email" type="email" className="mt-1 w-full rounded-xl border border-line bg-cream/40 px-3 py-2.5 text-sm" />
        </div>
        <div>
          <label htmlFor="telefone" className="text-xs font-bold text-grey">Telemóvel</label>
          <input id="telefone" name="telefone" className="mt-1 w-full rounded-xl border border-line bg-cream/40 px-3 py-2.5 text-sm" />
        </div>
      </div>
      <div>
        <label htmlFor="mensagem" className="text-xs font-bold text-grey">Em que podemos ajudar?</label>
        <textarea id="mensagem" name="mensagem" rows={3} className="mt-1 w-full rounded-xl border border-line bg-cream/40 px-3 py-2.5 text-sm" />
      </div>
      {estado === "erro" ? (
        <p className="text-xs font-bold text-bad">Não foi possível enviar — tenta outra vez, por favor.</p>
      ) : null}
      <button
        type="submit"
        disabled={estado === "a_enviar"}
        className="w-full rounded-full px-6 py-3 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-60"
        style={{ background: cor }}
      >
        {estado === "a_enviar" ? "A enviar…" : "Enviar contacto"}
      </button>
    </form>
  );
}
