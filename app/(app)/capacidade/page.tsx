import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { euros } from "@/lib/dominio/metricas";
import { calcular, normalizarEscopo, type Preco } from "@/lib/dominio/orcamento";
import {
  horasProdutivas,
  ocupacao,
  nivelCapacidade,
  minutosReuniao,
  type Reuniao,
} from "@/lib/dominio/operacao";

export const dynamic = "force-dynamic";

const NIVEL = {
  folgada: { rotulo: "Folgada", cls: "text-good" },
  saudavel: { rotulo: "Saudável", cls: "text-good" },
  cheia: { rotulo: "Cheia", cls: "text-warn" },
  sobrecarga: { rotulo: "Sobrecarga", cls: "text-bad" },
};

type ClienteEmbed = { nome_marca: string } | { nome_marca: string }[] | null;
const nomeDe = (c: ClienteEmbed) => (Array.isArray(c) ? c[0]?.nome_marca : c?.nome_marca) ?? "Cliente";

export default async function CapacidadePage() {
  const supabase = await criarClienteServidor();

  const inicioMes = new Date();
  inicioMes.setDate(1);
  const inicioMesISO = inicioMes.toISOString().slice(0, 10);

  const [cfgRes, propRes, precosRes, reunioesRes] = await Promise.all([
    supabase.from("configuracoes").select("chave, valor").in("chave", ["horas_mes_total", "pct_nao_faturavel"]),
    supabase
      .from("propostas")
      .select("cliente_id, escopo, versao, avenca_valor, clientes(nome_marca)")
      .eq("estado", "aceite")
      .order("versao", { ascending: false }),
    supabase
      .from("precos_unitarios")
      .select("chave, rotulo, tipo, unidade, preco, minutos, tempo_planeado_min")
      .neq("estado", "inativo"),
    supabase
      .from("reunioes")
      .select("duracao_planeada_min, duracao_real_min")
      .gte("data", inicioMesISO)
      .then((r) => r, () => ({ data: [] })),
  ]);

  const cfg = Object.fromEntries((cfgRes.data ?? []).map((r) => [r.chave, r.valor]));
  const num = (v: string | null | undefined) => (v == null || v === "" ? null : Number(v));
  const horasTotais = num(cfg.horas_mes_total);
  const pctNaoFaturavel = num(cfg.pct_nao_faturavel);
  const produtivas = horasProdutivas(horasTotais, pctNaoFaturavel);
  const precos = (precosRes.data ?? []) as Preco[];

  // Horas planeadas por cliente (proposta aceite mais recente de cada um).
  const vistos = new Set<string>();
  const porCliente: { nome: string; horas: number }[] = [];
  let mrr = 0;
  for (const p of (propRes.data ?? []) as {
    cliente_id: string;
    escopo: unknown;
    avenca_valor: number | null;
    clientes: ClienteEmbed;
  }[]) {
    if (vistos.has(p.cliente_id)) continue;
    vistos.add(p.cliente_id);
    mrr += Number(p.avenca_valor) || 0;
    const orc = calcular(normalizarEscopo(p.escopo), precos);
    const horas = orc.tempoMensalMin / 60;
    if (horas > 0) porCliente.push({ nome: nomeDe(p.clientes), horas });
  }
  porCliente.sort((a, b) => b.horas - a.horas);
  const planeadas = porCliente.reduce((s, c) => s + c.horas, 0);
  const mrrPorHora = planeadas > 0 ? mrr / planeadas : null;

  const reais =
    ((reunioesRes.data ?? []) as Reuniao[]).reduce((s, r) => s + minutosReuniao(r), 0) / 60;

  const oc = ocupacao(planeadas, produtivas);
  const nivel = nivelCapacidade(oc);
  const disponiveis = produtivas == null ? null : Math.max(0, produtivas - planeadas);

  return (
    <div className="space-y-6">
      <div>
        <p className="rotulo">quanto cabe na operação</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Capacidade</h1>
        <p className="mt-1 text-sm text-grey">
          Nem todas as horas do calendário são produtivas. Uma fatia fica para vendas, administração e
          desenvolvimento do Nº 5.
        </p>
      </div>

      {horasTotais == null || pctNaoFaturavel == null ? (
        <div className="rounded-xl border-2 border-warn bg-warn/10 p-5 text-sm">
          <b>Falta definir a capacidade.</b> Em{" "}
          <Link href="/definicoes/precos" className="font-bold underline">
            Definições
          </Link>{" "}
          (ou direto na tabela <code>configuracoes</code>) preenche <b>horas_mes_total</b> e{" "}
          <b>pct_nao_faturavel</b> (sugestão 30–40%). Sem isto, a ocupação não tem base.
        </div>
      ) : (
        <>
          {/* Barra de ocupação */}
          <section className="rounded-xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-grey">
                Ocupação:{" "}
                <b className={`text-lg ${nivel ? NIVEL[nivel].cls : ""}`}>
                  {oc == null ? "—" : `${Math.round(oc * 100)}%`}
                </b>{" "}
                {nivel && <span className={NIVEL[nivel].cls}>· {NIVEL[nivel].rotulo}</span>}
              </p>
              <p className="text-xs text-soft">
                {planeadas.toFixed(1)}h planeadas / {produtivas?.toFixed(1)}h produtivas
              </p>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-cream">
              <div
                className={`h-full ${
                  nivel === "sobrecarga" ? "bg-bad" : nivel === "cheia" ? "bg-warn" : "bg-gold"
                }`}
                style={{ width: `${Math.min(100, oc == null ? 0 : oc * 100)}%` }}
              />
            </div>
            {nivel === "sobrecarga" && (
              <p className="mt-2 text-xs font-bold text-bad">
                A operação está acima da capacidade. Antes de aceitar mais trabalho: rever prazos,
                subcontratar ou contratar.
              </p>
            )}
          </section>

          {/* KPIs */}
          <section className="grid gap-3 sm:grid-cols-4">
            <Kpi valor={`${horasTotais}h`} rotulo="totais / mês" />
            <Kpi valor={`${produtivas?.toFixed(0)}h`} rotulo={`produtivas (−${pctNaoFaturavel}%)`} />
            <Kpi valor={`${planeadas.toFixed(0)}h`} rotulo="planeadas (contratadas)" />
            <Kpi
              valor={disponiveis == null ? "—" : `${disponiveis.toFixed(0)}h`}
              rotulo="ainda disponíveis"
              alerta={disponiveis != null && disponiveis <= 0}
            />
          </section>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-soft">
            <span>
              Horas reais de reuniões este mês: <b className="text-ink">{reais.toFixed(1)}h</b>
            </span>
            {mrrPorHora != null && (
              <span>
                MRR por hora comprometida: <b className="text-cobalt">{euros(Math.round(mrrPorHora))}/h</b>
              </span>
            )}
          </div>

          {/* Por cliente */}
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="mb-3 font-display text-lg font-extrabold">Horas planeadas por cliente</h2>
            {porCliente.length === 0 ? (
              <p className="text-sm text-soft">
                Ainda não há propostas aceites com tempo planeado. Define o tempo dos serviços no
                catálogo para as horas aparecerem.
              </p>
            ) : (
              <div className="space-y-1.5">
                {porCliente.map((c) => (
                  <div key={c.nome} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0 truncate">{c.nome}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream">
                      <div
                        className="h-full bg-gold"
                        style={{ width: `${planeadas > 0 ? (c.horas / planeadas) * 100 : 0}%` }}
                      />
                    </div>
                    <b className="w-14 shrink-0 text-right tabular-nums">{c.horas.toFixed(1)}h</b>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ valor, rotulo, alerta }: { valor: string; rotulo: string; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alerta ? "border-bad bg-bad/5" : "border-line bg-white"}`}>
      <p className="font-display text-2xl font-extrabold tabular-nums">{valor}</p>
      <p className="text-[11px] text-grey">{rotulo}</p>
    </div>
  );
}
