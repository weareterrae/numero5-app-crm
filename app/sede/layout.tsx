import Link from "next/link";
import { ManterSessao } from "@/components/auth/ManterSessao";
import { contextoSede } from "@/lib/sede/contexto";

const LINKS = [
  { href: "/sede", label: "Início" },
  { href: "/sede/mes", label: "O teu mês" },
  { href: "/sede/assistente", label: "Assistente" },
  { href: "/sede/documentos", label: "Documentos" },
  { href: "/sede/plano", label: "Plano" },
  { href: "/sede/leads", label: "Leads" },
  { href: "/sede/pedidos", label: "Pedidos" },
  { href: "/sede/servicos", label: "Serviços" },
  { href: "/sede/biblioteca", label: "Biblioteca" },
  { href: "/sede/pagamentos", label: "Pagamentos" },
  { href: "/sede/ficha", label: "A minha ficha" },
];

export default async function SedeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await contextoSede();
  const marca = ctx.marca;

  return (
    <div className="min-h-dvh">
      <ManterSessao />
      {ctx.isStaff ? (
        <div className="bg-ink text-cream">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-1.5 text-xs">
            <span>
              🔎 Pré-visualização como cliente — <b>{marca.nome}</b>
            </span>
            <Link href="/clientes" className="ml-auto font-bold text-gold hover:underline">
              ← Voltar ao Nº 5
            </Link>
          </div>
        </div>
      ) : null}
      <header className="sticky top-0 z-20 border-b border-line bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/sede" className="flex shrink-0 items-center gap-2.5">
            {marca.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={marca.logo}
                alt={marca.nome}
                className="h-9 w-auto max-w-[170px] object-contain"
              />
            ) : (
              <>
                <span
                  className="inline-block h-8 w-8 rounded-lg"
                  style={{ background: marca.cor || "#E8A13C" }}
                />
                <span className="font-display text-lg font-extrabold tracking-tight">
                  {marca.nome}
                </span>
              </>
            )}
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
      <footer className="border-t border-line py-6 text-center text-xs text-soft">
        Espaço de cliente · seguro e privado
      </footer>
    </div>
  );
}
