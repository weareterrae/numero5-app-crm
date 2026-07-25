import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { euros, dataCurta } from "@/lib/dominio/metricas";
import {
  calcular,
  normalizarEscopo,
  type Preco,
} from "@/lib/dominio/orcamento";
import {
  resumoReunioes,
  reuniaoExcedePercentagem,
  type Reuniao,
} from "@/lib/dominio/operacao";
import { guardarReuniao, alternarFaturada, apagarReuniao } from "./acoes";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold";
const lab = "mb-1 block text-[11px] font-bold text-grey";

type LinhaReuniao = Reuniao & {
  id: string;
  data: string;
  participantes: string | null;
  objetivo: string | null;
  decisoes: string | null;
  tarefas: string | null;
};

export default async function ReunioesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome_marca, setor")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  const inicioMes = new Date();
  inicioMes.setDate(1);
  const inicioMesISO = inicioMes.toISOString().slice(0, 10);

  const [reunioesRes, cfgRes, propRes, precosRes] = await Promise.all([
    supabase
      .from("reunioes")
      .select(
        "id, data, duracao_planeada_min, duracao_real_min, participantes, objetivo, decisoes, tarefas, formato, incluida, faturar, faturada",
      )
      .eq("cliente_id", id)
      .gte("data", inicioMesISO)
      .order("data", { ascending: false }),
    supabase
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", [
        "reunioes_incluidas",
        "duracao_reuniao_min",
        "preco_reuniao_extra",
        "suplemento_presencial",
        "reuniao_pct_alerta",
      ]),
    supabase
      .from("propostas")
      .select("escopo")
      .eq("cliente_id", id)
      .eq("estado", "aceite")
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("precos_unitarios")
      .select("chave, rotulo, tipo, unidade, preco, minutos, tempo_planeado_min")
      .neq("estado", "inativo"),
  ]);

  const reunioes = (reunioesRes.data ?? []) as LinhaReuniao[];
  const cfg = Object.fromEntries((cfgRes.data ?? []).map((r) => [r.chave, r.valor]));
  const num = (v: string | null | undefined) => (v == null || v === "" ? null : Number(v));

  const incluidasLim = num(cfg.reunioes_incluidas);
  const pctAlerta = num(cfg.reuniao_pct_alerta);
  const resumo = resumoReunioes(reunioes, incluidasLim);

  // Horas contratadas = tempo mensal planeado da proposta aceite (se houver preços/tempos).
  let horasContratadas: number | null = null;
  if (propRes.data?.escopo) {
    const orc = calcular(normalizarEscopo(propRes.data.escopo), (precosRes.data ?? []) as Preco[]);
    if (orc.tempoMensalMin > 0) horasContratadas = orc.tempoMensalMin / 60;
  }
  const excedePct = reuniaoExcedePercentagem(resumo.minutosReais, horasContratadas, pctAlerta);

  const aDef = (v: number | null, suf = "") => (v == null ? "[A DEFINIR]" : `${v}${suf}`);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-xs font-bold text-gold-dark">
          ← {cliente.nome_marca}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Reuniões</h1>
        <p className="mt-1 text-sm text-grey">
          Cada reunião conta. As horas reais entram na rentabilidade do cliente.
        </p>
      </div>

      {/* Regras do plano */}
      <div className="rounded-xl border border-line bg-white p-4 text-sm">
        <p className="rotulo">regras deste plano</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-grey">
          <span>
            Incluídas/mês: <b className="text-ink">{aDef(incluidasLim)}</b>
          </span>
          <span>
            Duração máx.: <b className="text-ink">{aDef(num(cfg.duracao_reuniao_min), " min")}</b>
          </span>
          <span>
            Reunião extra: <b className="text-ink">{cfg.preco_reuniao_extra ? euros(Number(cfg.preco_reuniao_extra)) : "[A DEFINIR]"}</b>
          </span>
          <span>
            Suplemento presencial:{" "}
            <b className="text-ink">{cfg.suplemento_presencial ? euros(Number(cfg.suplemento_presencial)) : "[A DEFINIR]"}</b>
          </span>
        </div>
      </div>

      {/* Resumo do mês */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi valor={String(resumo.total)} rotulo="reuniões este mês" />
        <Kpi valor={`${resumo.horasReais.toFixed(1)}h`} rotulo="tempo real" />
        <Kpi valor={String(resumo.extras)} rotulo="extras" />
        <Kpi valor={String(resumo.extrasPorFaturar)} rotulo="por faturar" alerta={resumo.extrasPorFaturar > 0} />
      </div>

      {(resumo.excedeIncluidas || excedePct || resumo.extrasPorFaturar > 0) && (
        <div className="rounded-xl border-2 border-warn bg-warn/10 p-4 text-sm">
          <ul className="space-y-1">
            {resumo.excedeIncluidas && (
              <li>⚠️ Ultrapassaste as {incluidasLim} reuniões incluídas este mês.</li>
            )}
            {excedePct && (
              <li>
                ⚠️ O tempo de reunião ({resumo.horasReais.toFixed(1)}h) passou {pctAlerta}% das horas
                contratadas.
              </li>
            )}
            {resumo.extrasPorFaturar > 0 && (
              <li>⚠️ Há {resumo.extrasPorFaturar} reunião(ões) extra por faturar.</li>
            )}
          </ul>
        </div>
      )}

      {/* Lista */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-3 font-display text-lg font-extrabold">Este mês</h2>
        {reunioes.length === 0 ? (
          <p className="text-sm text-soft">Ainda não registaste reuniões este mês.</p>
        ) : (
          <div className="space-y-2">
            {reunioes.map((r) => (
              <div key={r.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <b>{dataCurta(r.data)}</b>
                    <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] text-grey">
                      {r.formato === "presencial" ? "presencial" : "online"}
                    </span>
                    {r.incluida === false ? (
                      <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold-dark">
                        extra
                      </span>
                    ) : (
                      <span className="rounded-full bg-good/15 px-2 py-0.5 text-[11px] font-bold text-good">
                        incluída
                      </span>
                    )}
                    <span className="text-soft">
                      {r.duracao_real_min ?? r.duracao_planeada_min ?? 0} min
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.incluida === false && r.faturar && (
                      <form action={alternarFaturada.bind(null, r.id, cliente.id)}>
                        <button
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            r.faturada ? "bg-good/15 text-good" : "border border-gold-dark text-gold-dark"
                          }`}
                        >
                          {r.faturada ? "faturada ✓" : "marcar faturada"}
                        </button>
                      </form>
                    )}
                    <form action={apagarReuniao.bind(null, r.id, cliente.id)}>
                      <button className="text-[11px] text-bad">apagar</button>
                    </form>
                  </div>
                </div>
                {r.objetivo && <p className="mt-1 text-grey">{r.objetivo}</p>}
                {r.decisoes && (
                  <p className="mt-1 text-xs text-soft">
                    <b>Decisões:</b> {r.decisoes}
                  </p>
                )}
                {r.tarefas && (
                  <p className="mt-0.5 text-xs text-soft">
                    <b>Tarefas:</b> {r.tarefas}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Registar */}
      <section className="rounded-xl border-2 border-gold/40 bg-gold/5 p-5">
        <h2 className="font-display text-lg font-extrabold">Registar reunião</h2>
        <form action={guardarReuniao} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="cliente_id" value={cliente.id} />
          <div>
            <label className={lab}>Data</label>
            <input type="date" name="data" className={inp} />
          </div>
          <div>
            <label className={lab}>Formato</label>
            <select name="formato" className={inp}>
              <option value="online">Online</option>
              <option value="presencial">Presencial</option>
            </select>
          </div>
          <div>
            <label className={lab}>Duração planeada (min)</label>
            <input type="number" min="0" name="duracao_planeada_min" className={`${inp} tabular-nums`} />
          </div>
          <div>
            <label className={lab}>Duração real (min)</label>
            <input type="number" min="0" name="duracao_real_min" className={`${inp} tabular-nums`} />
          </div>
          <div>
            <label className={lab}>Tipo</label>
            <select name="incluida" className={inp}>
              <option value="incluida">Incluída no plano</option>
              <option value="extra">Extra (fora do plano)</option>
            </select>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="faturar" className="size-4 accent-[#E8A13C]" />
            Precisa de faturação
          </label>
          <div className="sm:col-span-2">
            <label className={lab}>Participantes</label>
            <input name="participantes" placeholder="quem esteve" className={inp} />
          </div>
          <div className="sm:col-span-2">
            <label className={lab}>Objetivo</label>
            <input name="objetivo" className={inp} />
          </div>
          <div className="sm:col-span-2">
            <label className={lab}>Decisões</label>
            <textarea name="decisoes" rows={2} className={inp} />
          </div>
          <div className="sm:col-span-2">
            <label className={lab}>Tarefas, responsáveis e prazos</label>
            <textarea name="tarefas" rows={2} className={inp} />
          </div>
          <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink sm:col-span-2">
            Guardar reunião
          </button>
        </form>
      </section>
    </div>
  );
}

function Kpi({ valor, rotulo, alerta }: { valor: string; rotulo: string; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alerta ? "border-warn bg-warn/10" : "border-line bg-white"}`}>
      <p className="font-display text-2xl font-extrabold tabular-nums">{valor}</p>
      <p className="text-[11px] text-grey">{rotulo}</p>
    </div>
  );
}
