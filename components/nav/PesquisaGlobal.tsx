"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Cliente = { id: string; nome: string; estado: string };
type Lead = { id: string; nome: string; orgSlug: string; orgNome: string };
type Resultado = { href: string; titulo: string; sub: string };

// Pesquisa global do operador. ⌘/Ctrl+K foca; setas + Enter navegam; Esc fecha.
export function PesquisaGlobal() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [itens, setItens] = useState<Resultado[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [aCarregar, setACarregar] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Atalho ⌘K / Ctrl+K
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, []);

  // Fechar ao clicar fora
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  // Procurar (debounce 200ms)
  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) {
      setItens([]);
      setACarregar(false);
      return;
    }
    setACarregar(true);
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pesquisa?q=${encodeURIComponent(termo)}`);
        const d = (await r.json()) as { clientes: Cliente[]; leads: Lead[] };
        const res: Resultado[] = [
          ...(d.clientes ?? []).map((c) => ({ href: `/clientes/${c.id}`, titulo: c.nome, sub: `Cliente · ${c.estado}` })),
          ...(d.leads ?? []).map((l) => ({ href: `/leads/${l.orgSlug}`, titulo: l.nome, sub: `Lead · ${l.orgNome}` })),
        ];
        setItens(res);
        setAtivo(0);
        setAberto(true);
      } catch {
        setItens([]);
      } finally {
        setACarregar(false);
      }
    }, 200);
    return () => clearTimeout(id);
  }, [q]);

  const irPara = useCallback(
    (href: string) => {
      setAberto(false);
      setQ("");
      setItens([]);
      input.current?.blur();
      router.push(href);
    },
    [router],
  );

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setAberto(false);
      input.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((a) => Math.min(a + 1, itens.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && itens[ativo]) {
      e.preventDefault();
      irPara(itens[ativo].href);
    }
  };

  return (
    <div ref={ref} className="relative hidden min-w-0 flex-1 sm:block">
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => itens.length && setAberto(true)}
        onKeyDown={teclas}
        placeholder="Procurar cliente ou lead…  ⌘K"
        aria-label="Pesquisa global"
        className="w-full rounded-lg border border-line bg-cream/60 px-3 py-1.5 text-sm text-ink placeholder:text-soft focus:border-gold focus:bg-white focus:outline-none"
      />
      {aberto && (itens.length > 0 || (!aCarregar && q.trim().length >= 2)) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          {itens.length === 0 ? (
            <div className="px-3 py-3 text-sm text-soft">Sem resultados.</div>
          ) : (
            <ul className="max-h-80 overflow-auto py-1">
              {itens.map((it, i) => (
                <li key={it.href + i}>
                  <button
                    type="button"
                    onMouseEnter={() => setAtivo(i)}
                    onClick={() => irPara(it.href)}
                    className={`flex w-full flex-col items-start px-3 py-2 text-left ${i === ativo ? "bg-cream" : ""}`}
                  >
                    <span className="text-sm font-medium text-ink">{it.titulo}</span>
                    <span className="font-mono text-xs text-soft">{it.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
