import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { euros } from "@/lib/dominio/metricas";
import { calcular, normalizarEscopo, semaforo, type Preco } from "@/lib/dominio/orcamento";
import {
  rentabilidade,
  sugestoesRentabilidade,
  minutosReuniao,
  type Reuniao,
} from "@/lib/dominio/operacao";

export const dynamic = "force-dynamic";

const COR = {
  verde: { cls: "border-good bg-good/10 text-good", rotulo: "Saudável" },
  amarelo: { cls: "border-warn bg-warn/10 text-warn", rotulo: "A vigiar" },
  vermelho: { cls: "border-bad bg-bad/10 text-bad", rotulo: "Deficitária" },
};

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const hora = (v: number | null) => (v == null ? "—" : euros(Math.round(v)) + "/h");

export default async function RentabilidadePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome_marca")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  const inicioMes = new Date();
  inicioMes.setDate(1);
  const inicioMesISO = inicioMes.toISOString().slice(0, 10);

  const [propRes, precosRes, extRes, cfgRes, reunioesRes, producaoRes, revisoesRes] =
    await Promise.all([
      supabase
        .from("propostas")
        .select("avenca_valor, setup_valor, escopo")
        .eq("cliente_id", id)
        .eq("estado", "aceite")
        .order("versao", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("precos_unitarios")
        .select("chave, rotulo, tipo, unidade, preco, minutos, custo_interno, tempo_planeado_min")
        .neq("estado", "inativo"),
      supabase.from("precos_unitarios").select("chave, custo_externo").neq("estado", "inativo").then(
        (r) => r,
        () => ({ data: null }),
      ),
      supabase
        .from("configuracoes")
        .select("chave, valor")
        .in("chave", [
          "valor_hora_alvo",
          "limiar_amarelo_hora",
          "limiar_vermelho_hora",
          "limiar_amarelo_margem",
          "limiar_vermelho_margem",
        ]),
      supabase
        .from("reunioes")
        .select("duracao_planeada_min, duracao_real_min")
        .eq("cliente_id", id)
        .gte("data", inicioMesISO)
        .then((r) => r, () => ({ data: [] })),
      supabase
        .from("producao_itens")
        .select("minutos, quantidade")
        .eq("cliente_id", id)
        .eq("mes", inicioMesISO)
        .then((r) => r, () => ({ data: [] })),
      supabase
        .from("revisoes")
        .select("valor, incluido, faturada")
        .eq("cliente_id", id)
        .eq("incluido", false)
        .eq("faturada", false)
        .then((r) => r, () => ({ data: [] })),
    ]);

  if (!propRes.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href={`/clientes/${cliente.id}`} className="text-xs font-bold text-gold-dark">
          ← {cliente.nome_marca}
        </Link>
        <h1 className="font-display text-3xl font-extrabold">Rentabilidade</h1>
        <div className="rounded-xl border-2 border-warn bg-warn/10 p-5 text-sm">
          Ainda não há proposta aceite para este cliente — sem contrato não há rentabilidade a medir.
        </div>
      </div>
    );
  }

  // Preços com custo externo (tolerante).
  let precos = (precosRes.data ?? []) as Preco[];
  if (extRes.data) {
    const ext = new Map(extRes.data.map((r) => [r.chave, r.custo_externo]));
    precos = precos.map((p) => ({ ...p, custo_externo: ext.get(p.chave) ?? null }));
  }

  const cfg = Object.fromEntries((cfgRes.data ?? []).map((r) => [r.chave, Number(r.valor)]));
  const limiares = {
    valorHoraAlvo: cfg.valor_hora_alvo || 65,
    amareloHora: cfg.limiar_amarelo_hora || 45,
    vermelhoHora: cfg.limiar_vermelho_hora || 30,
    amareloMargem: (cfg.limiar_amarelo_margem || 40) / 100,
    vermelhoMargem: (cfg.limiar_vermelho_margem || 25) / 100,
  };

  const orc = calcular(normalizarEscopo(propRes.data.escopo), precos);
  const receitaMensal = Number(propRes.data.avenca_valor) || 0;

  const minReunioes = ((reunioesRes.data ?? []) as Reuniao[]).reduce((s, r) => s + minutosReuniao(r), 0);
  const minProducao = ((producaoRes.data ?? []) as { minutos: number | null; quantidade: number | null }[]).reduce(
    (s, p) => s + (Number(p.minutos) || 0) * (Number(p.quantidade) || 1),
    0,
  );
  const horasReais = (minReunioes + minProducao) / 60;
  const horasPlaneadas = orc.tempoMensalMin / 60;

  const trabalhoNaoFaturado = ((revisoesRes.data ?? []) as { valor: number | null }[]).reduce(
    (s, r) => s + (Number(r.valor) || 0),
    0,
  );

  const r = rentabilidade({
    receitaMensal,
    custo: orc.custoMensal,
    horasPlaneadas,
    horasReais,
    trabalhoNaoFaturado,
  });
  const luz = semaforo(r.margemReal, r.receitaHoraReal, limiares);
  const cor = COR[luz.cor];
  const sugestoes = sugestoesRentabilidade(luz.cor, r.desvioHoras);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-xs font-bold text-gold-dark">
          ← {cliente.nome_marca}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Rentabilidade</h1>
        <p className="mt-1 text-sm text-grey">Do que foi vendido ao que foi realmente executado.</p>
      </div>

      <div className={`rounded-xl border-2 p-5 ${cor.cls}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-display text-xl font-extrabold">{cor.rotulo}</span>
          <span className="text-sm">
            margem real <b>{pct(r.margemReal)}</b> · {hora(r.receitaHoraReal)}
          </span>
        </div>
        {luz.motivos.length > 0 && <p className="mt-1 text-xs">{luz.motivos.join(" · ")}</p>}
      </div>

      {/* Previsto vs real */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-3 font-display text-lg font-extrabold">Previsto vs. real (este mês)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-grey">
              <th className="pb-2 font-bold"> </th>
              <th className="pb-2 text-right font-bold">Previsto</th>
              <th className="pb-2 text-right font-bold">Real</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <Linha rot="Horas" prev={`${horasPlaneadas.toFixed(1)}h`} real={`${horasReais.toFixed(1)}h`} destaque={r.desvioHoras > 0} />
            <Linha rot="Receita / hora" prev={hora(r.receitaHoraPlaneada)} real={hora(r.receitaHoraReal)} />
            <Linha rot="Margem" prev={pct(r.margemPrevista)} real={pct(r.margemReal)} />
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-xs text-grey">
          <span>
            Receita mensal <b className="text-ink">{euros(receitaMensal)}</b>
          </span>
          <span>
            Custo (interno + externo) <b className="text-ink">{euros(orc.custoMensal)}</b>
          </span>
          {trabalhoNaoFaturado > 0 && (
            <span className="text-bad">
              Trabalho por faturar <b>{euros(trabalhoNaoFaturado)}</b>
            </span>
          )}
        </div>
      </section>

      {sugestoes.length > 0 && (
        <section className="rounded-xl border border-line bg-cream p-5">
          <h2 className="mb-2 font-display text-lg font-extrabold">Sugestões (internas)</h2>
          <ul className="space-y-1 text-sm text-grey">
            {sugestoes.map((sug, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-gold-dark">→</span>
                {sug}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-soft">
            Nunca aplicadas sozinhas — são um ponto de partida para a tua decisão.
          </p>
        </section>
      )}

      <p className="text-[11px] text-soft">
        Horas reais = reuniões ({(minReunioes / 60).toFixed(1)}h) + produção (
        {(minProducao / 60).toFixed(1)}h) deste mês. Define o tempo planeado dos serviços no catálogo
        para o previsto ter base.
      </p>
    </div>
  );
}

function Linha({
  rot,
  prev,
  real,
  destaque,
}: {
  rot: string;
  prev: string;
  real: string;
  destaque?: boolean;
}) {
  return (
    <tr className="border-t border-line/60">
      <td className="py-1.5 text-grey">{rot}</td>
      <td className="py-1.5 text-right">{prev}</td>
      <td className={`py-1.5 text-right font-bold ${destaque ? "text-bad" : ""}`}>{real}</td>
    </tr>
  );
}
