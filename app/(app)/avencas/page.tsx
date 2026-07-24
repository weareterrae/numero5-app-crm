import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { dataCurta, euros, receitaRecorrente } from "@/lib/dominio/metricas";

export const dynamic = "force-dynamic";

type Linha = {
  id: string;
  cliente_id: string;
  valor_mensal: number;
  dia_cobranca: number | null;
  inicio: string;
  fim: string | null;
  estado: "ativa" | "suspensa" | "terminada";
  clientes: { nome_marca: string } | { nome_marca: string }[] | null;
};

export default async function AvencasPage() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("avencas")
    .select("id, cliente_id, valor_mensal, dia_cobranca, inicio, fim, estado, clientes(nome_marca)")
    .order("estado", { ascending: true })
    .order("valor_mensal", { ascending: false });

  const avencas = (data ?? []) as unknown as Linha[];
  const nomeDe = (c: Linha["clientes"]) =>
    (Array.isArray(c) ? c[0]?.nome_marca : c?.nome_marca) ?? "Cliente";
  const mrr = receitaRecorrente(avencas);
  const ativas = avencas.filter((a) => a.estado === "ativa");

  return (
    <div className="space-y-5">
      <div>
        <p className="rotulo">o que entra todos os meses</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Avenças</h1>
      </div>

      {avencas.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-8 text-center">
          <p className="font-display text-xl font-extrabold">Ainda sem avenças.</p>
          <p className="mt-2 text-sm text-grey">
            Quando uma proposta for aceite, a avença é criada automaticamente.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-ink p-5 text-cream">
              <div className="font-display text-3xl font-extrabold text-gold tabular-nums">
                {euros(mrr)}
              </div>
              <div className="mt-1 text-[13px] text-soft">receita recorrente / mês</div>
            </div>
            <div className="rounded-xl bg-ink p-5 text-cream">
              <div className="font-display text-3xl font-extrabold text-gold tabular-nums">
                {ativas.length}
              </div>
              <div className="mt-1 text-[13px] text-soft">avenças ativas</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-line bg-white">
            {avencas.map((a) => (
              <Link
                key={a.id}
                href={`/clientes/${a.cliente_id}`}
                className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-3 last:border-0 hover:bg-cream"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{nomeDe(a.clientes)}</p>
                  <p className="text-xs text-grey">
                    desde {dataCurta(a.inicio)}
                    {a.dia_cobranca ? ` · cobra dia ${a.dia_cobranca}` : ""}
                    {a.estado !== "ativa" ? ` · ${a.estado}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 font-mono text-sm ${a.estado === "ativa" ? "font-bold text-ink" : "text-soft line-through"}`}
                >
                  {euros(a.valor_mensal)}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
