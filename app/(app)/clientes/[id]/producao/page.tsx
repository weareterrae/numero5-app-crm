import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { euros } from "@/lib/dominio/metricas";
import { normalizarEscopo, PRODUCAO_VAZIA } from "@/lib/dominio/orcamento";
import {
  TIPOS_ITEM,
  deslocarMes,
  mesISO,
  mesLegivel,
  resumir,
  type ItemProducao,
} from "@/lib/dominio/producao";
import { alternarFaturado, apagarItem, juntarItem, marcarExtra } from "./acoes";

export const dynamic = "force-dynamic";

export default async function ProducaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes: mesQuery } = await searchParams;
  const mes = mesQuery ?? mesISO();

  const supabase = await criarClienteServidor();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome_marca, setor")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  const [itensRes, avencaRes, propRes] = await Promise.all([
    supabase
      .from("producao_itens")
      .select("id, mes, tipo, descricao, quantidade, minutos, extra, valor, faturado, data")
      .eq("cliente_id", id)
      .eq("mes", mes)
      .order("data", { ascending: true }),
    supabase
      .from("avencas")
      .select("valor_mensal")
      .eq("cliente_id", id)
      .eq("estado", "ativa")
      .maybeSingle(),
    supabase
      .from("propostas")
      .select("escopo")
      .eq("cliente_id", id)
      .eq("estado", "aceite")
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const itens = (itensRes.data ?? []) as ItemProducao[];
  const avenca = avencaRes.data?.valor_mensal ?? null;
  const planeado = propRes.data?.escopo
    ? normalizarEscopo(propRes.data.escopo).producao
    : { ...PRODUCAO_VAZIA };

  const r = resumir(itens, planeado, avenca);
  const semContrato = !propRes.data;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/clientes/${id}`} className="text-xs font-bold text-gold-dark">
            ← {cliente.nome_marca}
          </Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Folha de produção</h1>
          <p className="text-sm text-grey">{mesLegivel(mes)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/clientes/${id}/producao?mes=${deslocarMes(mes, -1)}`}
            className="rounded-full border border-line px-3 py-1.5 text-sm font-bold text-grey"
          >
            ←
          </Link>
          <Link
            href={`/clientes/${id}/producao?mes=${mesISO()}`}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-grey"
          >
            este mês
          </Link>
          <Link
            href={`/clientes/${id}/producao?mes=${deslocarMes(mes, 1)}`}
            className="rounded-full border border-line px-3 py-1.5 text-sm font-bold text-grey"
          >
            →
          </Link>
        </div>
      </div>

      {/* Números do mês */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi valor={String(itens.reduce((t, i) => t + i.quantidade, 0))} rotulo="peças produzidas" />
        <Kpi valor={`${r.horas.toFixed(1)}h`} rotulo="tempo apontado" />
        <Kpi valor={euros(r.valorExtras)} rotulo="extras do mês" />
        <Kpi
          valor={r.euroHora ? euros(r.euroHora) : "—"}
          rotulo="por hora, neste cliente"
          destaque={r.euroHora !== null && r.euroHora < 25}
        />
      </div>

      {/* Avisos */}
      {r.avisos.length > 0 && (
        <div className="rounded-xl border-2 border-warn bg-warn/10 p-4">
          <h2 className="mb-1.5 text-sm font-bold">A ter em conta</h2>
          <ul className="space-y-1 text-sm">
            {r.avisos.map((a, i) => (
              <li key={i}>⚠️ {a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Planeado vs produzido */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-1 font-display text-lg font-extrabold">Planeado vs. produzido</h2>
        {semContrato ? (
          <p className="text-sm text-soft">
            Ainda não há proposta aceite, por isso não há plano contratado para comparar. Tudo o que
            registares conta como trabalho avulso.
          </p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-lg border border-line">
            {r.comparacao.map((l) => (
              <div
                key={l.tipo}
                className="flex items-center gap-3 border-b border-line/60 px-3 py-2.5 text-sm last:border-0"
              >
                <span className="flex-1 font-bold">{l.rotulo}</span>
                <span className="w-24 text-right text-grey">
                  {l.planeado} <span className="text-soft">plano</span>
                </span>
                <span className="w-24 text-right">
                  <b>{l.produzido}</b> <span className="text-soft">feito</span>
                </span>
                <span
                  className={`w-16 text-right font-mono text-xs ${
                    l.desvio > 0 ? "text-warn" : l.desvio < 0 ? "text-bad" : "text-good"
                  }`}
                >
                  {l.desvio > 0 ? `+${l.desvio}` : l.desvio === 0 ? "✓" : l.desvio}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Registar */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-3 font-display text-lg font-extrabold">Registar o que fizeste</h2>
        <form action={juntarItem} className="grid gap-2 sm:grid-cols-12">
          <input type="hidden" name="cliente_id" value={id} />
          <input type="hidden" name="mes" value={mes} />
          <select
            name="tipo"
            className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm sm:col-span-2"
          >
            {TIPOS_ITEM.map(([v, rotulo]) => (
              <option key={v} value={v}>
                {rotulo}
              </option>
            ))}
          </select>
          <input
            name="descricao"
            placeholder="O que foi (opcional)"
            className="rounded-lg border border-line px-2.5 py-2 text-sm sm:col-span-4"
          />
          <input
            name="quantidade"
            type="number"
            min={1}
            defaultValue={1}
            aria-label="Quantidade"
            className="rounded-lg border border-line px-2.5 py-2 text-sm tabular-nums sm:col-span-1"
          />
          <input
            name="minutos"
            type="number"
            min={0}
            placeholder="min"
            aria-label="Minutos"
            className="rounded-lg border border-line px-2.5 py-2 text-sm tabular-nums sm:col-span-1"
          />
          <label className="flex items-center gap-1.5 text-xs font-bold text-grey sm:col-span-2">
            <input type="checkbox" name="extra" className="size-4 accent-[#E8A13C]" />
            é extra
          </label>
          <input
            name="valor"
            type="number"
            step="0.01"
            placeholder="€ extra"
            aria-label="Valor do extra"
            className="rounded-lg border border-line px-2.5 py-2 text-sm tabular-nums sm:col-span-1"
          />
          <button className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-ink sm:col-span-1">
            +
          </button>
        </form>
        <p className="mt-2 text-xs text-soft">
          Aponta os <b>minutos</b> — é o que te vai dizer se este cliente compensa.
        </p>
      </section>

      {/* O que já está registado */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-3 font-display text-lg font-extrabold">
          O mês, peça a peça{" "}
          <span className="font-normal text-soft">({itens.length} registos)</span>
        </h2>
        {itens.length === 0 ? (
          <p className="text-sm text-soft">Ainda nada registado neste mês.</p>
        ) : (
          itens.map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center gap-2 border-b border-line/60 py-2.5 text-sm last:border-0"
            >
              <span className="w-24 shrink-0 font-bold">
                {TIPOS_ITEM.find(([t]) => t === i.tipo)?.[1] ?? i.tipo}
                {i.quantidade > 1 && <span className="text-soft"> ×{i.quantidade}</span>}
              </span>
              <span className="min-w-30 flex-1 text-grey">{i.descricao || "—"}</span>
              <span className="w-16 text-right font-mono text-xs text-soft">
                {i.minutos ? `${i.minutos}m` : "—"}
              </span>
              {i.extra ? (
                <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs font-bold text-gold-dark">
                  extra {i.valor ? euros(i.valor) : ""}
                </span>
              ) : (
                <form action={marcarExtra}>
                  <input type="hidden" name="item_id" value={i.id} />
                  <input type="hidden" name="cliente_id" value={id} />
                  <button className="text-xs text-gold-dark underline">marcar extra</button>
                </form>
              )}
              {i.extra && (
                <form action={alternarFaturado}>
                  <input type="hidden" name="item_id" value={i.id} />
                  <input type="hidden" name="cliente_id" value={id} />
                  <input type="hidden" name="faturado" value={i.faturado ? "0" : "1"} />
                  <button
                    className={`text-xs ${i.faturado ? "text-good" : "text-bad font-bold"}`}
                  >
                    {i.faturado ? "faturado ✓" : "por faturar"}
                  </button>
                </form>
              )}
              <form action={apagarItem}>
                <input type="hidden" name="item_id" value={i.id} />
                <input type="hidden" name="cliente_id" value={id} />
                <button className="text-xs text-soft hover:text-bad">×</button>
              </form>
            </div>
          ))
        )}

        {r.valorExtrasPorFaturar > 0 && (
          <div className="mt-3 rounded-lg border-2 border-bad/40 bg-bad/5 p-3 text-sm">
            <b>{euros(r.valorExtrasPorFaturar)} por faturar</b> em extras deste mês. Junta à próxima
            fatura antes que o mês feche.
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({
  valor,
  rotulo,
  destaque,
}: {
  valor: string;
  rotulo: string;
  destaque?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 ${destaque ? "bg-bad text-white" : "bg-ink text-cream"}`}>
      <div
        className={`font-display text-2xl font-extrabold tabular-nums ${destaque ? "text-white" : "text-gold"}`}
      >
        {valor}
      </div>
      <div className={`mt-0.5 text-xs ${destaque ? "text-white/80" : "text-soft"}`}>{rotulo}</div>
    </div>
  );
}
