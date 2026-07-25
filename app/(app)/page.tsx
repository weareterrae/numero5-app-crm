import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  ESTADO_LABEL,
  ESTADOS,
  PERCURSO,
  formatarPercentagem,
  taxaConversao,
  type Estado,
} from "@/lib/dominio/funil";
import {
  clientesAtivos,
  contarPorEstado,
  dataCurta,
  euros,
  receitaRecorrente,
  valorPipeline,
  type AvencaMetrica,
  type ClienteMetrica,
} from "@/lib/dominio/metricas";

export const dynamic = "force-dynamic";

export default async function Cockpit() {
  const supabase = await criarClienteServidor();

  const [clientesRes, avencasRes, followupsRes, historicoRes] = await Promise.all([
    supabase.from("clientes").select("id, nome_marca, estado, valor_estimado, ultima_interacao_at, setor"),
    supabase.from("avencas").select("valor_mensal, estado"),
    supabase
      .from("atividades")
      .select("id, cliente_id, descricao, followup_em, followup_nota, clientes(nome_marca)")
      .eq("concluido", false)
      .not("followup_em", "is", null)
      .order("followup_em", { ascending: true })
      .limit(20),
    supabase.from("estado_historico").select("cliente_id, para_estado"),
  ]);

  const clientes = (clientesRes.data ?? []) as (ClienteMetrica & {
    nome_marca: string;
    setor: string | null;
    ultima_interacao_at: string | null;
  })[];
  const avencas = (avencasRes.data ?? []) as AvencaMetrica[];
  const historico = (historicoRes.data ?? []) as { cliente_id: string; para_estado: string }[];

  const contagem = contarPorEstado(clientes);
  const mrr = receitaRecorrente(avencas);
  const pipeline = valorPipeline(clientes);
  const ativos = clientesAtivos(clientes);

  const hoje = new Date().toISOString().slice(0, 10);
  // O PostgREST devolve a junção como objeto, mas os tipos gerados dizem array.
  // Aceitamos as duas formas para não partir em nenhum dos casos.
  type ClienteEmbed = { nome_marca: string } | { nome_marca: string }[] | null;
  const followups = (followupsRes.data ?? []) as unknown as {
    id: string;
    cliente_id: string;
    descricao: string;
    followup_em: string;
    followup_nota: string | null;
    clientes: ClienteEmbed;
  }[];
  const nomeDe = (c: ClienteEmbed): string =>
    (Array.isArray(c) ? c[0]?.nome_marca : c?.nome_marca) ?? "Cliente";

  const recentes = [...clientes]
    .sort((a, b) => (b.ultima_interacao_at ?? "").localeCompare(a.ultima_interacao_at ?? ""))
    .slice(0, 6);

  // Descontos a terminar nos próximos 30 dias (tolerante: 0023 pode não ter corrido).
  const daqui30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const { data: descRows } = await supabase
    .from("descontos")
    .select("id, cliente_id, alvo, preco_durante, preco_apos, fim, clientes(nome_marca)")
    .eq("estado", "ativo")
    .not("fim", "is", null)
    .lte("fim", daqui30)
    .order("fim", { ascending: true });
  type DescontoFim = {
    id: string;
    cliente_id: string;
    alvo: string;
    preco_durante: number | null;
    preco_apos: number | null;
    fim: string;
    clientes: ClienteEmbed;
  };
  const descontosFim = (descRows ?? []) as unknown as DescontoFim[];
  const upliftMensal = descontosFim
    .filter((d) => d.alvo === "avenca")
    .reduce((s, d) => s + Math.max(0, (d.preco_apos ?? 0) - (d.preco_durante ?? 0)), 0);

  const vazio = clientes.length === 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="rotulo">números antes de adjetivos</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Cockpit</h1>
      </div>

      {vazio ? (
        <div className="rounded-xl border border-line bg-white p-8 text-center">
          <p className="font-display text-xl font-extrabold">Ainda não há nada para contar.</p>
          <p className="mt-2 text-sm text-grey">
            Assim que criares o primeiro lead, os números aparecem aqui.
          </p>
          <Link
            href="/clientes/novo"
            className="mt-5 inline-block rounded-full bg-gold px-6 py-2.5 font-bold text-ink"
          >
            Criar o primeiro lead 🖐️
          </Link>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <section className="grid gap-3 sm:grid-cols-3">
            <Kpi valor={String(ativos)} rotulo="clientes ativos" />
            <Kpi valor={euros(mrr)} rotulo="receita recorrente / mês" />
            <Kpi valor={euros(pipeline)} rotulo="valor em pipeline" />
          </section>

          {descontosFim.length > 0 && (
            <section className="rounded-xl border-2 border-gold/40 bg-gold/5 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-extrabold">Descontos a terminar (30 dias)</h2>
                {upliftMensal > 0 && (
                  <span className="text-sm text-grey">
                    quando terminarem: <b className="text-cobalt">+{euros(upliftMensal)}/mês</b>
                  </span>
                )}
              </div>
              <p className="mb-3 text-xs text-soft">
                Fala com o cliente antes da data — nada muda sem aviso.
              </p>
              <ul className="space-y-1.5">
                {descontosFim.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  >
                    <Link href={`/clientes/${d.cliente_id}`} className="font-bold hover:underline">
                      {nomeDe(d.clientes)}
                    </Link>
                    <span className="text-grey">
                      {d.alvo === "avenca" ? "avença" : "arranque"}:{" "}
                      {d.preco_durante != null ? euros(d.preco_durante) : "—"} →{" "}
                      <b>{d.preco_apos != null ? euros(d.preco_apos) : "—"}</b>
                      <span className="ml-2 text-soft">até {dataCurta(d.fim)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Funil */}
          <section>
            <h2 className="mb-3 font-display text-lg font-extrabold">Funil</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ESTADOS.map((e) => (
                <Link
                  key={e}
                  href={`/clientes?estado=${e}`}
                  className="rounded-xl border border-line bg-white p-3 text-center transition hover:border-gold"
                >
                  <div className="numero text-2xl">{contagem[e as Estado]}</div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wide text-grey">
                    {ESTADO_LABEL[e as Estado]}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Conversão */}
          <section>
            <h2 className="mb-3 font-display text-lg font-extrabold">Conversão entre passos</h2>
            <div className="grid gap-2 sm:grid-cols-4">
              {PERCURSO.slice(0, -1).map((de, i) => {
                const para = PERCURSO[i + 1];
                return (
                  <div key={de} className="rounded-xl border border-line bg-white p-3">
                    <div className="numero text-xl">
                      {formatarPercentagem(taxaConversao(historico, de, para))}
                    </div>
                    <div className="mt-0.5 text-[11px] text-grey">
                      {ESTADO_LABEL[de]} → {ESTADO_LABEL[para]}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Follow-ups */}
          <section>
            <h2 className="mb-3 font-display text-lg font-extrabold">A precisar de ti</h2>
            <div className="overflow-hidden rounded-xl border border-line bg-white">
              {followups.length === 0 ? (
                <p className="p-4 text-sm text-soft">Nada em atraso. 🖐️</p>
              ) : (
                followups.map((f) => {
                  const atrasado = f.followup_em <= hoje;
                  return (
                    <Link
                      key={f.id}
                      href={`/clientes/${f.cliente_id}`}
                      className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-3 last:border-0 hover:bg-cream"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{nomeDe(f.clientes)}</p>
                        <p className="truncate text-xs text-grey">
                          {f.followup_nota || f.descricao}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-mono text-xs ${atrasado ? "font-bold text-bad" : "text-soft"}`}
                      >
                        {atrasado ? "⏰ " : ""}
                        {dataCurta(f.followup_em)}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          {/* Recentes */}
          <section>
            <h2 className="mb-3 font-display text-lg font-extrabold">Mexidos recentemente</h2>
            <div className="overflow-hidden rounded-xl border border-line bg-white">
              {recentes.map((c) => (
                <Link
                  key={c.id}
                  href={`/clientes/${c.id}`}
                  className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-3 last:border-0 hover:bg-cream"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{c.nome_marca}</p>
                    <p className="truncate text-xs text-grey">{c.setor ?? "—"}</p>
                  </div>
                  <span className="shrink-0 text-xs text-soft">
                    {ESTADO_LABEL[c.estado]} · {dataCurta(c.ultima_interacao_at)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="rounded-xl bg-ink p-5 text-cream">
      <div className="font-display text-3xl font-extrabold text-gold tabular-nums">{valor}</div>
      <div className="mt-1 text-[13px] text-soft">{rotulo}</div>
    </div>
  );
}
