import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Simbolo } from "@/components/marca/Simbolo";
import { Quinto } from "@/components/assistente/Quinto";
import { ManterSessao } from "@/components/auth/ManterSessao";

const LINKS = [
  { href: "/", label: "Cockpit" },
  { href: "/clientes", label: "Clientes" },
  { href: "/clientes/funil", label: "Funil" },
  { href: "/avencas", label: "Avenças" },
  { href: "/faturacao", label: "Faturação" },
  { href: "/capacidade", label: "Capacidade" },
  { href: "/definicoes/precos", label: "Preços" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh">
      <ManterSessao />
      <header className="border-b border-line bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Simbolo className="w-10" titulo="Nº 5" />
            <span className="font-display text-lg font-extrabold tracking-tight">Nº 5</span>
          </Link>
          <nav className="flex-1 overflow-x-auto">
            <ul className="flex gap-1">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-bold text-grey hover:bg-cream hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <form action="/auth/sair" method="post" className="shrink-0">
            <button className="text-xs font-bold text-soft hover:text-ink" type="submit">
              sair
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-24">{children}</main>
      <Quinto />
    </div>
  );
}
