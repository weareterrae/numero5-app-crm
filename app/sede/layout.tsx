import Link from "next/link";
import { ManterSessao } from "@/components/auth/ManterSessao";
import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServidor } from "@/lib/supabase/server";
import { trocarMarcaSede } from "./acoes";

const LINKS = [
  { href: "/sede", label: "Início" },
  { href: "/sede/mes", label: "O teu mês" },
  { href: "/sede/resultados", label: "Resultados" },
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

  // «Anúncios» só entra no menu quando a marca tem conta ligada (0061, tolerante).
  let temAnuncios = false;
  {
    const supabase = await criarClienteServidor();
    const { data } = await supabase
      .from("orgs")
      .select("meta_ads_id")
      .eq("id", ctx.org.id)
      .maybeSingle()
      .then((r) => r, () => ({ data: null }));
    temAnuncios = !!(data as { meta_ads_id?: string | null } | null)?.meta_ads_id;
  }
  const links = temAnuncios
    ? [...LINKS.slice(0, 5), { href: "/sede/anuncios", label: "Anúncios" }, ...LINKS.slice(5)]
    : LINKS;

  return (
    <div className="min-h-dvh">
      <ManterSessao />
      {ctx.isStaff ? (
        <div className="bg-ink text-cream">
          <div className="mx-auto flex max-w-6xl items-center gap-3 overflow-x-auto px-4 py-1.5 text-xs">
            <span className="shrink-0">🔎 Pré-visualização —</span>
            {ctx.marcas.map((m) => {
              const ativa = m.slug === ctx.org.slug;
              return (
                <form key={m.slug} action={trocarMarcaSede} className="shrink-0">
                  <input type="hidden" name="slug" value={m.slug} />
                  <button
                    type="submit"
                    className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      ativa ? "bg-gold text-ink" : "text-cream/70 hover:text-cream"
                    }`}
                  >
                    {m.nome}
                  </button>
                </form>
              );
            })}
            <Link href="/clientes" className="ml-auto shrink-0 font-bold text-gold hover:underline">
              ← Voltar ao Nº 5
            </Link>
          </div>
        </div>
      ) : null}
      {/* Seletor de marcas — só quando a sessão tem acesso a mais do que uma */}
      {!ctx.isStaff && ctx.marcas.length > 1 ? (
        <div className="border-b border-line bg-cream/70">
          <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-4 py-1.5">
            <span className="rotulo shrink-0 !text-[10px]">as tuas marcas</span>
            {ctx.marcas.map((m) => {
              const ativa = m.slug === ctx.org.slug;
              return (
                <form key={m.slug} action={trocarMarcaSede} className="shrink-0">
                  <input type="hidden" name="slug" value={m.slug} />
                  <button
                    type="submit"
                    className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${
                      ativa ? "bg-ink text-cream" : "border border-line bg-white text-grey hover:text-ink"
                    }`}
                  >
                    {m.nome}
                  </button>
                </form>
              );
            })}
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
              {links.map((l) => (
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
