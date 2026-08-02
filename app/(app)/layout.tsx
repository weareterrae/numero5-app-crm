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
  { href: "/leads", label: "Leads" },
  { href: "/leads/faturacao", label: "Assinaturas" },
  { href: "/metricas", label: "Métricas" },
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

  // Clientes externos vivem na Sede — nunca nas rotas do operador (que expõem
  // dados da agência). Segurança: qualquer externo que chegue a (app) vai à Sede.
  const { data: perfil } = await supabase
    .from("profiles")
    .select("externo")
    .eq("id", user.id)
    .maybeSingle();
  if (perfil?.externo) redirect("/sede");
  const links = LINKS;

  // White-label: o cliente externo vê a app com a SUA marca (cor/logótipo).
  let marcaCliente: { nome: string; cor?: string; logo?: string } | null = null;
  if (perfil?.externo) {
    const { data: mem } = await supabase
      .from("org_membros")
      .select("org_id")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle();
    if (mem?.org_id) {
      const { data: o } = await supabase.from("orgs").select("nome, marca").eq("id", mem.org_id).maybeSingle();
      if (o) marcaCliente = { nome: o.nome, cor: o.marca?.cor, logo: o.marca?.logo_url };
    }
  }

  return (
    <div className="min-h-dvh">
      <ManterSessao />
      <header className="border-b border-line bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href={marcaCliente ? "/leads" : "/"} className="flex items-center gap-2.5 shrink-0">
            {marcaCliente ? (
              marcaCliente.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={marcaCliente.logo} alt={marcaCliente.nome} className="h-9 w-auto max-w-[170px] object-contain" />
              ) : (
                <>
                  <span
                    className="inline-block h-8 w-8 rounded-lg"
                    style={{ background: marcaCliente.cor || "#E8A13C" }}
                  />
                  <span className="font-display text-lg font-extrabold tracking-tight">
                    {marcaCliente.nome}
                  </span>
                </>
              )
            ) : (
              <>
                <Simbolo className="w-10" titulo="Nº 5" />
                <span className="font-display text-lg font-extrabold tracking-tight">Nº 5</span>
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
      <Quinto />
    </div>
  );
}
