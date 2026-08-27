"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type Plataforma = "ios" | "android" | "desktop";

// Evento não-standard do Chrome/Edge — sem tipo oficial no lib.dom.
type EventoInstalar = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detetarPlataforma(): Plataforma {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  // iPad em modo "computador" não tem "iPad" na UA — apanha-se pelo touch + Mac.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

function jaInstalada(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // Safari/iOS: propriedade própria, sem equivalente no evento standalone acima.
  return (navigator as unknown as { standalone?: boolean }).standalone === true;
}

const IconePartilhar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
    <path d="M12 3v12" />
    <path d="m8 7 4-4 4 4" />
    <rect x="5" y="10" width="14" height="11" rx="2" />
  </svg>
);
const IconeMais = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconeMenu = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-5 w-5 shrink-0">
    <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

function Passo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-line bg-white p-3.5 text-left">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream">{n}</span>
      <span className="flex flex-1 flex-wrap items-center gap-1.5 text-sm text-grey">{children}</span>
    </li>
  );
}

export default function InstalarPage() {
  const [plataforma, setPlataforma] = useState<Plataforma | null>(null);
  const [instalada, setInstalada] = useState(false);
  const [prompt, setPrompt] = useState<EventoInstalar | null>(null);
  const [aInstalar, setAInstalar] = useState(false);
  const [resultado, setResultado] = useState<"ok" | "recusado" | null>(null);

  useEffect(() => {
    setPlataforma(detetarPlataforma());
    setInstalada(jaInstalada());

    const captar = (e: Event) => {
      e.preventDefault();
      setPrompt(e as EventoInstalar);
    };
    window.addEventListener("beforeinstallprompt", captar);
    const instalou = () => setInstalada(true);
    window.addEventListener("appinstalled", instalou);
    return () => {
      window.removeEventListener("beforeinstallprompt", captar);
      window.removeEventListener("appinstalled", instalou);
    };
  }, []);

  async function instalar() {
    if (!prompt) return;
    setAInstalar(true);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setResultado(outcome === "accepted" ? "ok" : "recusado");
    setAInstalar(false);
    setPrompt(null);
  }

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm text-center">
        <Image src="/icons/icon-512.png" alt="" width={88} height={88} className="mx-auto mb-5 rounded-2xl shadow-lg" />
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Instalar a app Nº 5</h1>
        <p className="mt-1.5 mb-7 text-sm text-grey">
          Fica com um ícone no ecrã principal e abre em ecrã inteiro, como qualquer outra app.
        </p>

        {!plataforma ? null : instalada ? (
          <div className="rounded-xl border border-line bg-white p-6">
            <p className="mb-1 font-bold">Já tens a app instalada. 🖐️</p>
            <p className="text-sm text-grey">Procura o ícone da Nº 5 no ecrã principal.</p>
          </div>
        ) : resultado === "ok" ? (
          <div className="rounded-xl border border-line bg-white p-6">
            <p className="mb-1 font-bold">Instalada! 🖐️</p>
            <p className="text-sm text-grey">Já podes fechar isto — procura o ícone da Nº 5 no ecrã principal.</p>
          </div>
        ) : plataforma === "android" ? (
          prompt ? (
            <button
              type="button"
              onClick={instalar}
              disabled={aInstalar}
              className="w-full rounded-full bg-gold px-6 py-3 font-bold text-ink transition hover:brightness-105 disabled:opacity-60"
            >
              {aInstalar ? "Um momento…" : "Instalar agora 🖐️"}
            </button>
          ) : (
            <div className="text-left">
              <p className="mb-3 text-sm text-grey">O teu browser ainda não avisou que está pronto — instala pelo menu:</p>
              <ol className="space-y-2">
                <Passo n={1}>
                  Toca no menu <IconeMenu /> (canto superior direito)
                </Passo>
                <Passo n={2}>Toca em «Instalar aplicação» ou «Adicionar ao ecrã principal»</Passo>
              </ol>
              {resultado === "recusado" && <p className="mt-3 text-xs text-soft">Sem problema — podes voltar aqui quando quiseres.</p>}
            </div>
          )
        ) : plataforma === "ios" ? (
          <ol className="space-y-2 text-left">
            <Passo n={1}>
              Toca no botão Partilhar <IconePartilhar /> (barra debaixo do Safari)
            </Passo>
            <Passo n={2}>
              Desce e toca em «Adicionar ao Ecrã Principal» <IconeMais />
            </Passo>
            <Passo n={3}>Toca em «Adicionar», no canto superior direito</Passo>
          </ol>
        ) : (
          <div className="rounded-xl border border-line bg-white p-6">
            <p className="mb-1 font-bold">Isto é para o telemóvel 📱</p>
            <p className="text-sm text-grey">
              Abre <b>app.numerocinco.pt/instalar</b> no browser do teu telemóvel para instalar a app aí.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
