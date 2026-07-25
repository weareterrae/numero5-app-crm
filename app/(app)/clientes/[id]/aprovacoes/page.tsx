import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { dataCurta } from "@/lib/dominio/metricas";
import {
  aprovacaoAtrasada,
  indicadorAprovacao,
  MICROCOPY_ATRASO_APROVACAO,
  type Aprovacao,
} from "@/lib/dominio/operacao";
import { idiomaDe } from "@/lib/dominio/intake";
import {
  guardarResponsavel,
  guardarAprovacao,
  mudarEstadoAprovacao,
  adicionarLembrete,
  apagarAprovacao,
} from "./acoes";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold";
const lab = "mb-1 block text-[11px] font-bold text-grey";

const ESTADO_ROTULO: Record<string, string> = {
  pendente: "à espera",
  aprovado: "aprovado",
  alteracoes: "com alterações",
  recusado: "recusado",
  sem_resposta: "sem resposta",
};

type LinhaAprovacao = Aprovacao & {
  id: string;
  titulo: string;
  canal: string | null;
  lembretes: number;
  nota: string | null;
};

export default async function AprovacoesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome_marca, idioma")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  // aprovacao (0028) e a lista são tolerantes: podem não existir antes da migração.
  const [{ data: apRow }, aprovacoesRes] = await Promise.all([
    supabase.from("clientes").select("aprovacao").eq("id", id).maybeSingle().then(
      (r) => r,
      () => ({ data: null }),
    ),
    supabase
      .from("aprovacoes")
      .select("id, titulo, canal, enviado_em, prazo, estado, resolvido_em, lembretes, nota")
      .eq("cliente_id", id)
      .order("enviado_em", { ascending: false })
      .then((r) => r, () => ({ data: [] })),
  ]);

  const resp = ((apRow?.aprovacao ?? {}) as Record<string, unknown>) || {};
  const aprovacoes = (aprovacoesRes.data ?? []) as LinhaAprovacao[];
  const hojeISO = new Date().toISOString().slice(0, 10);
  const ind = indicadorAprovacao(aprovacoes, hojeISO);
  const idioma = idiomaDe(cliente.idioma);

  const s = (k: string) => (resp[k] == null ? "" : String(resp[k]));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-xs font-bold text-gold-dark">
          ← {cliente.nome_marca}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Aprovações</h1>
        <p className="mt-1 text-sm text-grey">
          Nada é publicado sem aprovação expressa. Aqui vês quem decide, o que espera e o que atrasa.
        </p>
      </div>

      {/* Indicador (interno) */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi
          valor={ind.tempoMedioDias == null ? "—" : `${ind.tempoMedioDias.toFixed(1)}d`}
          rotulo="tempo médio de aprovação"
        />
        <Kpi
          valor={ind.pctNoPrazo == null ? "—" : `${Math.round(ind.pctNoPrazo * 100)}%`}
          rotulo="dentro do prazo"
        />
        <Kpi valor={String(ind.bloqueados)} rotulo="bloqueados" alerta={ind.bloqueados > 0} />
        <Kpi
          valor={String(ind.diasAtrasoAcumulados)}
          rotulo="dias de atraso acumulados"
          alerta={ind.diasAtrasoAcumulados > 0}
        />
      </div>

      {/* Quem aprova */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-3 font-display text-lg font-extrabold">Quem aprova</h2>
        <form action={guardarResponsavel} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="cliente_id" value={cliente.id} />
          <div>
            <label className={lab}>Responsável principal</label>
            <input name="responsavel" defaultValue={s("responsavel")} className={inp} />
          </div>
          <div>
            <label className={lab}>Suplente</label>
            <input name="suplente" defaultValue={s("suplente")} className={inp} />
          </div>
          <div>
            <label className={lab}>Email</label>
            <input name="email" type="email" defaultValue={s("email")} className={inp} />
          </div>
          <div>
            <label className={lab}>Telefone</label>
            <input name="telefone" defaultValue={s("telefone")} className={inp} />
          </div>
          <div>
            <label className={lab}>Prazo normal de aprovação (dias)</label>
            <input name="prazo_dias" type="number" min="0" defaultValue={s("prazo_dias")} className={`${inp} tabular-nums`} />
          </div>
          <div>
            <label className={lab}>Nº de decisores</label>
            <input name="decisores" type="number" min="0" defaultValue={s("decisores")} className={`${inp} tabular-nums`} />
          </div>
          <div className="sm:col-span-2">
            <label className={lab}>Canais de aprovação permitidos</label>
            <input name="canais" defaultValue={s("canais")} placeholder="ex.: email, WhatsApp" className={inp} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="validacao_juridica" defaultChecked={!!resp.validacao_juridica} className="size-4 accent-[#E8A13C]" />
            Precisa de validação jurídica
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="validacao_tecnica" defaultChecked={!!resp.validacao_tecnica} className="size-4 accent-[#E8A13C]" />
            Precisa de validação técnica
          </label>
          <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-cream sm:col-span-2">
            Guardar responsável
          </button>
        </form>
      </section>

      {/* Fluxo */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-3 font-display text-lg font-extrabold">A aguardar e histórico</h2>
        {aprovacoes.length === 0 ? (
          <p className="text-sm text-soft">Ainda não pediste nenhuma aprovação.</p>
        ) : (
          <div className="space-y-2">
            {aprovacoes.map((a) => {
              const atrasada = aprovacaoAtrasada(a, hojeISO);
              const pendente = a.estado === "pendente" || a.estado === "sem_resposta";
              return (
                <div
                  key={a.id}
                  className={`rounded-lg border p-3 text-sm ${atrasada ? "border-bad bg-bad/5" : "border-line"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>{a.titulo}</b>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          a.estado === "aprovado"
                            ? "bg-good/15 text-good"
                            : a.estado === "recusado"
                              ? "bg-bad/15 text-bad"
                              : atrasada
                                ? "bg-bad/15 text-bad"
                                : "bg-cream text-grey"
                        }`}
                      >
                        {ESTADO_ROTULO[a.estado ?? "pendente"]}
                      </span>
                      {a.canal && <span className="text-[11px] text-soft">via {a.canal}</span>}
                    </div>
                    <form action={apagarAprovacao.bind(null, a.id, cliente.id)}>
                      <button className="text-[11px] text-bad">apagar</button>
                    </form>
                  </div>

                  <p className="mt-1 text-xs text-soft">
                    Enviado {a.enviado_em ? dataCurta(a.enviado_em) : "—"}
                    {a.prazo && ` · prazo ${dataCurta(a.prazo)}`}
                    {a.resolvido_em && ` · resolvido ${dataCurta(a.resolvido_em)}`}
                    {a.lembretes > 0 && ` · ${a.lembretes} lembrete(s)`}
                  </p>

                  {atrasada && (
                    <p className="mt-1.5 rounded bg-bad/10 p-2 text-[11px] text-bad">
                      Para o cliente: «{MICROCOPY_ATRASO_APROVACAO[idioma]}»
                    </p>
                  )}

                  {pendente && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <EstadoBtn id={a.id} cid={cliente.id} estado="aprovado" cor="good">
                        Aprovar
                      </EstadoBtn>
                      <EstadoBtn id={a.id} cid={cliente.id} estado="alteracoes" cor="grey">
                        Com alterações
                      </EstadoBtn>
                      <EstadoBtn id={a.id} cid={cliente.id} estado="recusado" cor="bad">
                        Recusar
                      </EstadoBtn>
                      <EstadoBtn id={a.id} cid={cliente.id} estado="sem_resposta" cor="grey">
                        Sem resposta
                      </EstadoBtn>
                      <form action={adicionarLembrete.bind(null, a.id, cliente.id)}>
                        <button className="rounded-full border border-gold-dark px-3 py-1 text-[11px] font-bold text-gold-dark">
                          + lembrete
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Pedir aprovação */}
      <section className="rounded-xl border-2 border-gold/40 bg-gold/5 p-5">
        <h2 className="font-display text-lg font-extrabold">Pedir aprovação</h2>
        <form action={guardarAprovacao} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="cliente_id" value={cliente.id} />
          <div className="sm:col-span-2">
            <label className={lab}>O quê</label>
            <input name="titulo" required placeholder="ex.: Carrossel «5 sinais» — abril" className={inp} />
          </div>
          <div>
            <label className={lab}>Canal</label>
            <input name="canal" placeholder="email, WhatsApp…" className={inp} />
          </div>
          <div>
            <label className={lab}>Prazo (dias, ou data)</label>
            <div className="flex gap-2">
              <input name="prazo_dias" type="number" min="0" placeholder="dias" className={`${inp} tabular-nums`} />
              <input name="prazo" type="date" className={inp} />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={lab}>Nota</label>
            <input name="nota" className={inp} />
          </div>
          <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink sm:col-span-2">
            Registar pedido
          </button>
        </form>
      </section>
    </div>
  );
}

function EstadoBtn({
  id,
  cid,
  estado,
  cor,
  children,
}: {
  id: string;
  cid: string;
  estado: string;
  cor: "good" | "bad" | "grey";
  children: React.ReactNode;
}) {
  const cls =
    cor === "good"
      ? "border-good text-good"
      : cor === "bad"
        ? "border-bad text-bad"
        : "border-line text-grey";
  return (
    <form action={mudarEstadoAprovacao.bind(null, id, cid, estado)}>
      <button className={`rounded-full border px-3 py-1 text-[11px] font-bold ${cls}`}>{children}</button>
    </form>
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
