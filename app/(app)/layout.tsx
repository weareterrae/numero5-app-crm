import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Simbolo } from "@/components/marca/Simbolo";
import { Quinto } from "@/components/assistente/Quinto";
import { ManterSessao } from "@/components/auth/ManterSessao";
import { NavOperador } from "@/components/nav/NavOperador";
import { PesquisaGlobal } from "@/components/nav/PesquisaGlobal";
import { EstadoBadge } from "@/components/estado/EstadoBadge";
import { contarGuiasNovos } from "@/lib/db/guias";

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

  // Aviso: guias da marca concluídos que ainda não foram vistos.
  const guiasNovos = await contarGuiasNovos(user.id);

  return (
    <div className="min-h-dvh">
      <ManterSessao />
      <header className="border-b border-line bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <Simbolo className="w-10" titulo="Nº 5" />
            <span className="font-display text-lg font-extrabold tracking-tight">Nº 5</span>
          </Link>
          <PesquisaGlobal />
          <NavOperador badges={{ "/guias": guiasNovos }} />
          <EstadoBadge />
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
