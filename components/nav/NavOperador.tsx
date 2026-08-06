"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Item = { href: string; label: string };
type Grupo = { label: string; items: Item[] };
type Entrada = Item | Grupo;

const NAV: Entrada[] = [
  { href: "/", label: "Cockpit" },
  { href: "/dia", label: "O meu dia" },
  { href: "/radar", label: "Radar" },
  {
    label: "Comercial",
    items: [
      { href: "/clientes", label: "Clientes" },
      { href: "/clientes/funil", label: "Funil" },
      { href: "/guias", label: "Guias" },
      { href: "/leads", label: "Leads" },
      { href: "/leads/faturacao", label: "Assinaturas" },
      { href: "/avencas", label: "Avenças" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/anuncios", label: "Anúncios" },
      { href: "/metricas", label: "Métricas" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { href: "/faturacao", label: "Faturação" },
      { href: "/capacidade", label: "Capacidade" },
      { href: "/definicoes/precos", label: "Preços" },
    ],
  },
];

const ehGrupo = (e: Entrada): e is Grupo => "items" in e;

export function NavOperador() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const ativo = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  useEffect(() => setAberto(null), [pathname]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(null);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const pill = "block whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-bold transition";

  return (
    <nav ref={ref} className="flex-1">
      <ul className="flex flex-wrap items-center gap-1">
        {NAV.map((e) => {
          if (!ehGrupo(e)) {
            return (
              <li key={e.href}>
                <Link href={e.href} className={`${pill} ${ativo(e.href) ? "bg-ink text-cream" : "text-grey hover:bg-cream hover:text-ink"}`}>
                  {e.label}
                </Link>
              </li>
            );
          }
          const grupoAtivo = e.items.some((i) => ativo(i.href));
          const estaAberto = aberto === e.label;
          return (
            <li key={e.label} className="relative">
              <button
                type="button"
                onClick={() => setAberto(estaAberto ? null : e.label)}
                aria-expanded={estaAberto}
                className={`${pill} flex items-center gap-1 ${grupoAtivo || estaAberto ? "bg-cream text-ink" : "text-grey hover:bg-cream hover:text-ink"}`}
              >
                {e.label}
                <span className={`text-[10px] transition-transform ${estaAberto ? "rotate-180" : ""}`}>▾</span>
              </button>
              {estaAberto ? (
                <div className="absolute left-0 top-full z-30 mt-1.5 min-w-[180px] rounded-2xl border border-line bg-white p-1.5 shadow-xl">
                  {e.items.map((i) => (
                    <Link
                      key={i.href}
                      href={i.href}
                      className={`block rounded-xl px-3.5 py-2 text-sm font-bold ${ativo(i.href) ? "bg-ink text-cream" : "text-grey hover:bg-cream hover:text-ink"}`}
                    >
                      {i.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
