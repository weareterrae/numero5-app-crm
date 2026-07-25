import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { euros } from "@/lib/dominio/metricas";
import { calcular, normalizarEscopo, semaforo, type Preco } from "@/lib/dominio/orcamento";
import {
  rentabilidade,
  sugestoesRentabilidade,
  minutosReuniao,
  indiceEsforco,
  indicadorAprovacao,
  resumoRevisoesPeca,
  sugerirComplexidade,
  COMPLEXIDADE_ROTULO,
  type Reuniao,
  type Aprovacao,
} from "@/lib/dominio/operacao";
import { guardarComplexidade } from "@/app/(app)/clientes/acoes";

const ESFORCO = {
  baixo: { rotulo: "Saudável", cls: "text-good" },
  medio: { rotulo: "Exigente", cls: "text-warn" },
  alto: { rotulo: "Risco operacional", cls: "text-bad" },
  muito_alto: { rotulo: "Muito exigente", cls: "text-bad" },
} as const;

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

  const [
    propRes,
    precosRes,
    extRes,
    cfgRes,
    reunioesRes,
    producaoRes,
    revisoesRes,
    aprovacoesRes,
    revisoesAllRes,
    clienteJsonRes,
  ] = await Promise.all([
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
          "revisoes_incluidas",
        ]),
      supabase
        .from("reunioes")
        .select("duracao_planeada_min, duracao_real_min, incluida")
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
      supabase
        .from("aprovacoes")
        .select("estado, enviado_em, prazo, resolvido_em")
        .eq("cliente_id", id)
        .then((r) => r, () => ({ data: [] })),
      supabase
        .from("revisoes")
        .select("peca, tipo, incluido")
        .eq("cliente_id", id)
        .then((r) => r, () => ({ data: [] })),
      supabase.from("clientes").select("aprovacao, financeiro, complexidade").eq("id", id).maybeSingle().then(
        (r) => r,
        () => ({ data: null }),
      ),
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

  // Índice de esforço — a partir dos sinais reais da operação.
  const reunioesExtra = ((reunioesRes.data ?? []) as { incluida?: boolean }[]).filter(
    (x) => x.incluida === false,
  ).length;
  const revAll = (revisoesAllRes.data ?? []) as { peca: string; tipo: string | null; incluido: boolean }[];
  const retrabalhos = revAll.filter((x) => x.tipo === "retrabalho").length;
  const revIncluidas = cfg.revisoes_incluidas || null;
  const pecas = new Map<string, typeof revAll>();
  for (const rv of revAll) {
    if (!pecas.has(rv.peca)) pecas.set(rv.peca, []);
    pecas.get(rv.peca)!.push(rv);
  }
  const revisoesSobreLimite = [...pecas.values()].some(
    (lista) => resumoRevisoesPeca(lista, revIncluidas).sobreLimite,
  );
  const hojeISO = new Date().toISOString().slice(0, 10);
  const indAp = indicadorAprovacao((aprovacoesRes.data ?? []) as Aprovacao[], hojeISO);
  const jsonRow = (clienteJsonRes.data ?? null) as {
    aprovacao?: { decisores?: number; validacao_juridica?: boolean; validacao_tecnica?: boolean } | null;
    financeiro?: { estado?: string } | null;
    complexidade?: string | null;
  } | null;
  const esforco = indiceEsforco({
    reunioesExtra,
    retrabalhos,
    revisoesSobreLimite,
    aprovacoesBloqueadas: indAp.bloqueados,
    tempoAprovacaoDias: indAp.tempoMedioDias,
    decisores: jsonRow?.aprovacao?.decisores ?? null,
    estadoFinanceiro: jsonRow?.financeiro?.estado ?? null,
  });
  const esf = ESFORCO[esforco.nivel];

  // Complexidade — sugestão a partir dos sinais + o que o operador definiu.
  const sugComplex = sugerirComplexidade({
    decisores: jsonRow?.aprovacao?.decisores ?? null,
    validacaoJuridica: !!jsonRow?.aprovacao?.validacao_juridica,
    validacaoTecnica: !!jsonRow?.aprovacao?.validacao_tecnica,
    multiIdioma: false,
    setorRegulado: false,
  });
  const complexidadeAtual = jsonRow?.complexidade ?? null;

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

      {/* Índice de esforço — quanto custa gerir este cliente (interno) */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-extrabold">Esforço de gestão</h2>
          <span className={`text-sm font-bold ${esf.cls}`}>
            {esf.rotulo} · {esforco.pontos} pt
          </span>
        </div>
        {esforco.criterios.length === 0 ? (
          <p className="mt-1 text-sm text-soft">Cliente tranquilo — sem sinais de esforço extra.</p>
        ) : (
          <>
            <ul className="mt-2 space-y-1 text-sm">
              {esforco.criterios.map((c, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="text-grey">{c.nome}</span>
                  <span className="font-mono text-xs text-soft">+{c.contribuicao}</span>
                </li>
              ))}
            </ul>
            {(esforco.nivel === "alto" || esforco.nivel === "muito_alto") && luz.cor !== "vermelho" && (
              <p className="mt-2 rounded-lg bg-warn/10 p-2 text-xs text-warn">
                Exigente, mas ainda a dar margem — vale a pena rever âmbito/reuniões na renovação.
              </p>
            )}
            {(esforco.nivel === "alto" || esforco.nivel === "muito_alto") && luz.cor === "vermelho" && (
              <p className="mt-2 rounded-lg bg-bad/10 p-2 text-xs text-bad">
                Muito esforço e pouca margem — risco operacional. Renegociar ou rever o âmbito.
              </p>
            )}
          </>
        )}
        <p className="mt-2 text-[11px] text-soft">
          Interno · nunca visível ao cliente. Somado a partir de reuniões, aprovações, revisões e
          pagamentos reais.
        </p>
      </section>

      {/* Complexidade — nível definido pelo operador, com sugestão */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-extrabold">Complexidade</h2>
          {complexidadeAtual && (
            <span className="rounded-full bg-cream px-3 py-1 text-xs font-bold text-grey">
              {COMPLEXIDADE_ROTULO[complexidadeAtual] ?? complexidadeAtual}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-soft">
          Sugestão: <b className="text-ink">{COMPLEXIDADE_ROTULO[sugComplex.nivel]}</b>
          {sugComplex.motivos.length > 0 && <> · {sugComplex.motivos.join(", ")}</>}. Só a
          plataforma sugere — a complexidade pode pedir mais horas ou fee superior; decides tu.
        </p>
        <form action={guardarComplexidade} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={cliente.id} />
          <select
            name="complexidade"
            defaultValue={complexidadeAtual ?? sugComplex.nivel}
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
          >
            {["baixa", "media", "alta", "personalizada"].map((k) => (
              <option key={k} value={k}>
                {COMPLEXIDADE_ROTULO[k]}
              </option>
            ))}
          </select>
          <button className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream">Guardar</button>
        </form>
      </section>

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
