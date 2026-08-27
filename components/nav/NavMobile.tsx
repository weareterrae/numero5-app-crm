"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV, ehGrupo, type Grupo } from "./nav-data";

// Barra inferior — só até ao tablet (md). É a navegação principal no
// telemóvel: os 4 destinos mais usados sempre à mão do polegar, e "Mais"
// abre os grupos (Comercial, Marketing, Financeiro, IA) num painel a
// deslizar de baixo, como um menu nativo.
const PRINCIPAIS = NAV.filter((e) => !ehGrupo(e)) as { href: string; label: string }[];
const GRUPOS = NAV.filter(ehGrupo) as Grupo[];

const ICONES: Record<string, (props: { className?: string }) => React.ReactElement> = {
  "/": (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  ),
  "/dia": (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v3M15.5 3.5v3" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  ),
  "/producao": (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <path d="M4 20V11l5 3.5V11l5 3.5V9l5.5 3v8Z" />
      <path d="M4 20h16" />
    </svg>
  ),
  "/radar": (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12 17 7" />
    </svg>
  ),
};

const IconeMais = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={p.className}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
const IconeFechar = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className={p.className}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export function NavMobile({ badges }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  useEffect(() => setAberto(false), [pathname]);
  useEffect(() => {
    if (!aberto) return;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const ativo = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  const badge = (href: string) => badges?.[href] ?? 0;
  const grupoTemNovidade = (g: Grupo) => g.items.some((i) => badge(i.href) > 0);
  const menuTemNovidade = GRUPOS.some(grupoTemNovidade);
  const menuAtivo = GRUPOS.some((g) => g.items.some((i) => ativo(i.href)));

  const tab = "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-bold";

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Navegação principal"
      >
        {PRINCIPAIS.map((item) => {
          const Icone = ICONES[item.href];
          const on = ativo(item.href);
          return (
            <Link key={item.href} href={item.href} className={`${tab} ${on ? "text-ink" : "text-soft"}`}>
              {Icone ? <Icone className="h-5 w-5" /> : null}
              {item.label}
              {badge(item.href) > 0 && <span className="absolute right-[22%] top-1 h-1.5 w-1.5 rounded-full bg-gold" aria-label="novidades" />}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-expanded={aberto}
          aria-label="Mais opções"
          className={`${tab} ${menuAtivo ? "text-ink" : "text-soft"}`}
        >
          <IconeMais className="h-5 w-5" />
          Mais
          {menuTemNovidade && <span className="absolute right-[22%] top-1 h-1.5 w-1.5 rounded-full bg-gold" aria-label="novidades" />}
        </button>
      </nav>

      {aberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setAberto(false)}
          />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-line bg-white p-4 shadow-2xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-ink">Mais</span>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded-full p-1.5 text-soft hover:bg-cream hover:text-ink">
                <IconeFechar className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              {GRUPOS.map((g) => (
                <div key={g.label}>
                  <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-soft">{g.label}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {g.items.map((i) => (
                      <Link
                        key={i.href}
                        href={i.href}
                        className={`flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold ${ativo(i.href) ? "bg-ink text-cream" : "bg-cream/60 text-grey"}`}
                      >
                        <span>{i.label}</span>
                        {badge(i.href) > 0 && <span className="rounded-full bg-gold px-1.5 text-[10px] font-bold text-ink">{badge(i.href)}</span>}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              <form action="/auth/sair" method="post">
                <button type="submit" className="w-full rounded-xl bg-cream/60 px-3.5 py-2.5 text-left text-sm font-bold text-grey">
                  Sair
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
