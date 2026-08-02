import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServico } from "@/lib/supabase/server";
import { abrirPedidoSede } from "./acoes";

export const dynamic = "force-dynamic";

const PILL: Record<string, { txt: string; cls: string }> = {
  novo: { txt: "recebido", cls: "bg-gold/20 text-gold-dark" },
  em_curso: { txt: "em curso", cls: "bg-cobalt/10 text-cobalt" },
  feito: { txt: "feito ✓", cls: "bg-good/15 text-good" },
};

function quando(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}

export default async function SedePedidos({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const ctx = await contextoSede();
  const { ok } = await searchParams;

  if (!ctx.clienteId) {
    return (
      <div>
        <h1 className="font-display text-2xl font-extrabold">Pedidos</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Estamos a preparar o teu espaço. Muito em breve podes abrir pedidos por aqui. 🖐️
        </p>
      </div>
    );
  }

  const svc = criarClienteServico();
  const { data: lista } = await svc
    .from("pedidos")
    .select("id, texto, estado, nota_equipa, criado_em, resolvido_em")
    .eq("cliente_id", ctx.clienteId)
    .order("criado_em", { ascending: false });
  const pedidos = lista ?? [];

  return (
    <div className="max-w-2xl">
      <div className="rotulo">balcão de pedidos</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Precisas de alguma coisa?</h1>
      <p className="mt-1 text-sm text-grey">
        Abre um pedido e nós tratamos. Aqui vês sempre em que ponto está — sem mensagens perdidas.
      </p>

      {ok ? (
        <p className="mt-4 rounded-xl border-2 border-good/40 bg-good/5 px-4 py-3 text-sm font-bold text-good">
          ✓ Pedido recebido. Vamos tratar disso. 🖐️
        </p>
      ) : null}

      <form action={abrirPedidoSede} className="mt-6 rounded-xl border border-line bg-white p-4">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-soft">Novo pedido</span>
          <textarea
            name="texto"
            required
            rows={3}
            placeholder="Ex.: um post para a Festa da Vila no dia 15; ou muda o horário de domingo no site."
            className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm outline-none focus:border-gold"
          />
        </label>
        <div className="mt-3">
          <button type="submit" className="rounded-full bg-gold px-6 py-2.5 font-bold text-ink transition hover:brightness-105">
            Enviar pedido 🖐️
          </button>
        </div>
      </form>

      <div className="mt-8">
        <div className="rotulo mb-3">os teus pedidos</div>
        {pedidos.length === 0 ? (
          <p className="text-sm text-soft">Ainda não há pedidos. Abre o primeiro aí em cima. 🖐️</p>
        ) : (
          <ul className="space-y-3">
            {pedidos.map((p) => {
              const pill = PILL[p.estado] ?? PILL.novo;
              return (
                <li key={p.id} className="rounded-xl border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex-1 text-sm">{p.texto}</p>
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${pill.cls}`}>
                      {pill.txt}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-soft">aberto {quando(p.criado_em)}</p>
                  {p.nota_equipa ? (
                    <p className="mt-2 rounded-lg bg-cream px-3 py-2 text-[13px] text-grey">
                      <b className="text-gold-dark">Nº 5:</b> {p.nota_equipa}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
