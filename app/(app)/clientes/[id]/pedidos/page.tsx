import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { atualizarPedido } from "./acoes";

export const dynamic = "force-dynamic";

const ESTADOS = [
  ["novo", "Recebido"],
  ["em_curso", "Em curso"],
  ["feito", "Feito"],
] as const;

export default async function PedidosOperador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome_marca")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  const { data: lista } = await supabase
    .from("pedidos")
    .select("id, texto, estado, tipo, nota_equipa, criado_em, resolvido_em")
    .eq("cliente_id", id)
    .order("criado_em", { ascending: false });
  const pedidos = (lista ?? []) as {
    id: string;
    texto: string;
    estado: string;
    tipo?: string | null;
    nota_equipa: string | null;
    criado_em: string;
  }[];

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/clientes/${id}`} className="text-xs font-bold text-soft hover:text-ink">
          ← {cliente.nome_marca}
        </Link>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Pedidos do cliente</h1>
        <p className="text-sm text-grey">Abertos pelo cliente na Sede. Atualiza o estado e deixa uma nota.</p>
      </div>

      {pedidos.length === 0 ? (
        <p className="rounded-xl border border-line bg-white/60 p-6 text-sm text-soft">
          Ainda não há pedidos deste cliente.
        </p>
      ) : (
        <ul className="space-y-3">
          {pedidos.map((p) => (
            <li
              key={p.id}
              className={`rounded-xl border bg-white p-4 ${p.tipo === "servico" ? "border-gold" : "border-line"}`}
            >
              {p.tipo === "servico" ? (
                <span className="mb-2 inline-block rounded-full bg-gold/20 px-2.5 py-0.5 text-[11px] font-bold text-gold-dark">
                  💼 Pedido de serviço · fazer proposta
                </span>
              ) : null}
              <p className="text-sm font-medium">{p.texto}</p>
              <p className="mt-1 text-[11px] text-soft">
                aberto {new Date(p.criado_em).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
              <form action={atualizarPedido} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="cliente_id" value={id} />
                <select name="estado" defaultValue={p.estado} className="rounded-lg border border-line bg-cream px-2.5 py-2 text-sm">
                  {ESTADOS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                <input
                  name="nota_equipa"
                  defaultValue={p.nota_equipa ?? ""}
                  placeholder="Nota para o cliente (opcional)"
                  className="min-w-[200px] flex-1 rounded-lg border border-line bg-cream px-3 py-2 text-sm"
                />
                <button type="submit" className="rounded-lg bg-ink px-3 py-2 text-sm font-bold text-cream">
                  Guardar
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
