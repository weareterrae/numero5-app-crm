import Link from "next/link";
import { listarClientes } from "@/lib/db/clientes";
import { ListaClientes } from "@/components/crm/ListaClientes";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const clientes = await listarClientes();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="rotulo">a carteira</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Clientes</h1>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/exportar/clientes"
            className="rounded-full border-2 border-line px-4 py-2 text-sm font-bold text-grey transition hover:text-ink"
          >
            ⬇ CSV
          </a>
          <Link
            href="/clientes/funil"
            className="rounded-full border-2 border-gold-dark px-4 py-2 text-sm font-bold text-gold-dark"
          >
            Ver funil
          </Link>
          <Link
            href="/clientes/novo"
            className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-ink"
          >
            + Novo
          </Link>
        </div>
      </div>

      {clientes.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-8 text-center">
          <p className="font-display text-xl font-extrabold">A carteira está vazia.</p>
          <p className="mt-2 text-sm text-grey">Cria o primeiro lead e a máquina começa a trabalhar.</p>
          <Link
            href="/clientes/novo"
            className="mt-5 inline-block rounded-full bg-gold px-6 py-2.5 font-bold text-ink"
          >
            Criar o primeiro 🖐️
          </Link>
        </div>
      ) : (
        <ListaClientes clientes={clientes} estadoInicial={estado} />
      )}
    </div>
  );
}
