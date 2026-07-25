"use client";

import { useState } from "react";
import Link from "next/link";
import { Simbolo } from "@/components/marca/Simbolo";
import { OBJETIVOS } from "@/lib/dominio/diagnostico/recomendacoes";
import { PRESENCA, type Idioma } from "@/lib/dominio/intake";
import { criarLeadPublico } from "@/app/diagnostico/acoes";

const campo =
  "w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-gold";
const chip = (on: boolean) =>
  `rounded-full border px-3.5 py-2 text-sm font-bold transition ${
    on ? "border-gold bg-gold text-ink" : "border-line bg-white text-grey hover:border-gold"
  }`;

const TX = {
  pt: {
    eyebrow: "diagnóstico gratuito",
    titulo: "Vamos dar cá cinco?",
    sub: "Conta-nos o essencial em menos de um minuto. Analisamos a tua marca e voltamos com ideias concretas — quer trabalhes connosco quer não. 🖐️",
    quemEs: "Quem és",
    marca: "Nome da marca *",
    marcaPH: "Ex.: Casa Alecrim",
    teuNome: "O teu nome",
    setor: "Setor",
    setorPH: "Ex.: restauração",
    email: "Email *",
    telefone: "Telefone",
    telefonePH: "Com indicativo",
    ondeEstas: "Onde estás",
    duas: "Duas perguntas rápidas para já irmos preparados.",
    presencaQ: "Como está a tua presença digital hoje?",
    objQ: "O que gostavas de alcançar?",
    escolhe: "Escolhe as que quiseres.",
    algoQ: "Algo que queiras dizer-nos? (opcional)",
    algoPH: "Uma dor, um objetivo, um sonho…",
    erroMarca: "Diz-nos o nome da tua marca. 🖐️",
    erroEmail: "Precisamos de um email válido para te responder.",
    enviarBtn: "Quero o meu diagnóstico 🖐️",
    aEnviar: "A enviar…",
    rodape: "Os teus dados servem só para falarmos contigo, sem spam.",
    ver: "Ver a",
    politica: "política de privacidade",
    okTitulo: "Recebido! Dá cá cinco 🖐️",
    okTexto: (m: string) =>
      `Já ficámos com o essencial da ${m}. Vamos analisar e falamos contigo em breve — sem compromisso.`,
    contarT: "Queres uma proposta ainda mais à tua medida?",
    contarS: "Conta-nos mais 2 minutos sobre a marca — e preparamos algo mesmo pensado para ti.",
    continuar: "Continuar o diagnóstico →",
  },
  en: {
    eyebrow: "free diagnostic",
    titulo: "Shall we high-five?",
    sub: "Tell us the essentials in under a minute. We'll analyse your brand and come back with concrete ideas — whether you work with us or not. 🖐️",
    quemEs: "Who you are",
    marca: "Brand name *",
    marcaPH: "e.g. Casa Alecrim",
    teuNome: "Your name",
    setor: "Industry",
    setorPH: "e.g. restaurants",
    email: "Email *",
    telefone: "Phone",
    telefonePH: "With country code",
    ondeEstas: "Where you are",
    duas: "Two quick questions so we come prepared.",
    presencaQ: "How's your digital presence today?",
    objQ: "What would you like to achieve?",
    escolhe: "Choose any.",
    algoQ: "Anything you'd like to tell us? (optional)",
    algoPH: "A pain point, a goal, a dream…",
    erroMarca: "Tell us your brand name. 🖐️",
    erroEmail: "We need a valid email to get back to you.",
    enviarBtn: "I want my diagnostic 🖐️",
    aEnviar: "Sending…",
    rodape: "Your details are used only to get in touch, no spam.",
    ver: "See the",
    politica: "privacy policy",
    okTitulo: "Got it! High five 🖐️",
    okTexto: (m: string) =>
      `We've got the essentials on ${m}. We'll take a look and be in touch soon — no obligation.`,
    contarT: "Want an even more tailored proposal?",
    contarS: "Tell us 2 more minutes about the brand — and we'll prepare something truly made for you.",
    continuar: "Continue the diagnostic →",
  },
};

export function FormularioComecar({ idioma = "pt" }: { idioma?: Idioma }) {
  const t = TX[idioma];
  const L = (o: readonly [string, string, string]) => (idioma === "en" ? o[2] : o[1]);

  const [marca, setMarca] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [setor, setSetor] = useState("");
  const [presenca, setPresenca] = useState("");
  const [objetivos, setObjetivos] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState("");
  const [hp, setHp] = useState("");
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
    if (!marca.trim()) return setErro(t.erroMarca);
    if (!email.includes("@")) return setErro(t.erroEmail);
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
      idioma,
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
          <h1 className="font-display text-3xl font-extrabold">{t.okTitulo}</h1>
          <p className="mt-3 text-grey">
            {t.okTexto(marca)}
          </p>
          {token && (
            <div className="mt-6 rounded-xl border-2 border-gold bg-gold/5 p-5">
              <p className="text-sm font-bold">{t.contarT}</p>
              <p className="mt-1 text-sm text-grey">{t.contarS}</p>
              <Link
                href={`/intake/${token}`}
                className="mt-3 inline-block rounded-full bg-gold px-6 py-3 text-sm font-bold text-ink"
              >
                {t.continuar}
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
        <p className="rotulo !text-gold">{t.eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight">{t.titulo}</h1>
        <p className="mt-3 text-[15px] text-soft">{t.sub}</p>
      </header>

      <form onSubmit={enviar} className="mt-5 space-y-5">
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
          <h2 className="mb-3 font-display text-lg font-extrabold">{t.quemEs}</h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-grey">{t.marca}</label>
              <input value={marca} onChange={(e) => setMarca(e.target.value)} className={campo} placeholder={t.marcaPH} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-grey">{t.teuNome}</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-grey">{t.setor}</label>
                <input value={setor} onChange={(e) => setSetor(e.target.value)} className={campo} placeholder={t.setorPH} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-grey">{t.email}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-grey">{t.telefone}</label>
                <input value={telefone} onChange={(e) => setTelefone(e.target.value)} className={campo} placeholder={t.telefonePH} />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border-2 border-gold bg-gold/5 p-5">
          <h2 className="mb-1 font-display text-lg font-extrabold">{t.ondeEstas}</h2>
          <p className="mb-3 text-xs text-soft">{t.duas}</p>

          <p className="mb-2 text-sm font-bold">{t.presencaQ}</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESENCA.map((o) => (
              <button key={o[0]} type="button" onClick={() => setPresenca(presenca === o[0] ? "" : o[0])} className={chip(presenca === o[0])}>
                {L(o)}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-4 text-sm font-bold">
            {t.objQ} <span className="font-normal text-soft">{t.escolhe}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {OBJETIVOS.map((o) => (
              <button key={o[0]} type="button" onClick={() => toggleObj(o[0])} className={chip(objetivos.includes(o[0]))}>
                {L(o)}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-white p-5">
          <label className="mb-1 block text-xs font-bold text-grey">{t.algoQ}</label>
          <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={2} className={campo} placeholder={t.algoPH} />
        </section>

        {erro && <p className="text-sm font-bold text-bad">{erro}</p>}

        <button
          type="submit"
          disabled={estado === "a-enviar"}
          className="w-full rounded-full bg-gold px-6 py-3.5 text-lg font-bold text-ink transition hover:brightness-105 disabled:opacity-60"
        >
          {estado === "a-enviar" ? t.aEnviar : t.enviarBtn}
        </button>
        <p className="text-center text-xs text-soft">
          {t.rodape} {t.ver}{" "}
          <a href="https://numerocinco.pt/politica-de-privacidade/" target="_blank" rel="noopener" className="underline">
            {t.politica}
          </a>
          .
        </p>
      </form>
    </main>
  );
}
