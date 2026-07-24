import Link from "next/link";
import { listarClientes } from "@/lib/db/clientes";
import { Kanban } from "@/components/crm/Kanban";

export const dynamic = "force-dynamic";

export default async function FunilPage() {
  const clientes = await listarClientes();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="rotulo">onde está cada negócio</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Funil</h1>
        </div>
        <Link
          href="/clientes"
          className="rounded-full border-2 border-gold-dark px-4 py-2 text-sm font-bold text-gold-dark"
        >
          Ver lista
        </Link>
      </div>

      {clientes.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-8 text-center">
          <p className="font-display text-xl font-extrabold">O funil está vazio.</p>
          <Link
            href="/clientes/novo"
            className="mt-4 inline-block rounded-full bg-gold px-6 py-2.5 font-bold text-ink"
          >
            Criar o primeiro lead 🖐️
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs text-soft">
            No computador, arrasta os cartões entre colunas. No telemóvel, usa o seletor de cada
            cartão.
          </p>
          <Kanban clientes={clientes} />
        </>
      )}
    </div>
  );
}
