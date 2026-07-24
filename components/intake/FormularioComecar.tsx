"use client";

import { useState } from "react";
import Link from "next/link";
import { Simbolo } from "@/components/marca/Simbolo";
import { OBJETIVOS } from "@/lib/dominio/diagnostico/recomendacoes";
import { PRESENCA } from "@/lib/dominio/intake";
import { criarLeadPublico } from "@/app/diagnostico/acoes";

const campo =
  "w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-gold";
const chip = (on: boolean) =>
  `rounded-full border px-3.5 py-2 text-sm font-bold transition ${
    on ? "border-gold bg-gold text-ink" : "border-line bg-white text-grey hover:border-gold"
  }`;

export function FormularioComecar() {
  const [marca, setMarca] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [setor, setSetor] = useState("");
  const [presenca, setPresenca] = useState("");
  const [objetivos, setObjetivos] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState("");
  const [hp, setHp] = useState(""); // armadilha
  const [estado, setEstado] = useState<"a-preencher" | "a-enviar" | "enviado" | "erro">(
    "a-preencher",
  );
  const [erro, setErro] = useState("");
  const [token, setToken] = useState<string | null>(null);

  function toggleObj(k: string) {
    setObjetivos((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!marca.trim()) return setErro("Diz-nos o nome da tua marca. 🖐️");
    if (!email.includes("@")) return setErro("Precisamos de um email válido para te responder.");
    setEstado("a-enviar");
    setErro("");
    const r = await criarLeadPublico({
      marca,
      nome,
      email,
      telefone,
      setor,
      presenca,
      objetivos,
      mensagem,
      hp,
    });
    if (r.ok) {
      setToken(r.token);
      setEstado("enviado");
    } else {
      setErro(r.erro);
      setEstado("erro");
    }
  }

  if (estado === "enviado") {
    return (
      <main className="grid min-h-dvh place-items-center px-5">
        <div className="w-full max-w-md text-center">
          <Simbolo className="mx-auto mb-6 w-20" titulo="Nº 5" />
          <h1 className="font-display text-3xl font-extrabold">Recebido! Dá cá cinco 🖐️</h1>
          <p className="mt-3 text-grey">
            Já ficámos com o essencial da <b>{marca}</b>. Vamos analisar e falamos contigo em breve —
            sem compromisso.
          </p>
          {token && (
            <div className="mt-6 rounded-xl border-2 border-gold bg-gold/5 p-5">
              <p className="text-sm font-bold">Queres uma proposta ainda mais à tua medida?</p>
              <p className="mt-1 text-sm text-grey">
                Conta-nos mais 2 minutos sobre a marca — e preparamos algo mesmo pensado para ti.
              </p>
              <Link
                href={`/intake/${token}`}
                className="mt-3 inline-block rounded-full bg-gold px-6 py-3 text-sm font-bold text-ink"
              >
                Continuar o diagnóstico →
              </Link>
            </div>
          )}
          <p className="mt-6 text-xs text-soft">numerocinco.pt</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <header className="rounded-2xl bg-ink px-7 py-8 text-cream">
        <Simbolo fundo="escuro" className="mb-5 w-14" titulo="Nº 5" />
        <p className="rotulo !text-gold">diagnóstico gratuito</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight">
          Vamos dar cá cinco?
        </h1>
        <p className="mt-3 text-[15px] text-soft">
          Conta-nos o essencial em menos de um minuto. Analisamos a tua marca e voltamos com ideias
          concretas — quer trabalhes connosco quer não. 🖐️
        </p>
      </header>

      <form onSubmit={enviar} className="mt-5 space-y-5">
        {/* Armadilha para bots — escondida das pessoas */}
        <input
          type="text"
          name="empresa_site"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />

        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-3 font-display text-lg font-extrabold">Quem és</h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-grey">Nome da marca *</label>
              <input value={marca} onChange={(e) => setMarca(e.target.value)} className={campo} placeholder="Ex.: Casa Alecrim" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-grey">O teu nome</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-grey">Setor</label>
                <input value={setor} onChange={(e) => setSetor(e.target.value)} className={campo} placeholder="Ex.: restauração" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-grey">Email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-grey">Telefone</label>
                <input value={telefone} onChange={(e) => setTelefone(e.target.value)} className={campo} placeholder="Com indicativo" />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border-2 border-gold bg-gold/5 p-5">
          <h2 className="mb-1 font-display text-lg font-extrabold">Onde estás</h2>
          <p className="mb-3 text-xs text-soft">Duas perguntas rápidas para já irmos preparados.</p>

          <p className="mb-2 text-sm font-bold">Como está a tua presença digital hoje?</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESENCA.map(([k, r]) => (
              <button key={k} type="button" onClick={() => setPresenca(presenca === k ? "" : k)} className={chip(presenca === k)}>
                {r}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-4 text-sm font-bold">
            O que gostavas de alcançar? <span className="font-normal text-soft">Escolhe as que quiseres.</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {OBJETIVOS.map(([k, r]) => (
              <button key={k} type="button" onClick={() => toggleObj(k)} className={chip(objetivos.includes(k))}>
                {r}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-white p-5">
          <label className="mb-1 block text-xs font-bold text-grey">Algo que queiras dizer-nos? (opcional)</label>
          <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={2} className={campo} placeholder="Uma dor, um objetivo, um sonho…" />
        </section>

        {erro && <p className="text-sm font-bold text-bad">{erro}</p>}

        <button
          type="submit"
          disabled={estado === "a-enviar"}
          className="w-full rounded-full bg-gold px-6 py-3.5 text-lg font-bold text-ink transition hover:brightness-105 disabled:opacity-60"
        >
          {estado === "a-enviar" ? "A enviar…" : "Quero o meu diagnóstico 🖐️"}
        </button>
        <p className="text-center text-xs text-soft">
          Os teus dados servem só para falarmos contigo. Sem spam, prometido.
        </p>
      </form>
    </main>
  );
}
