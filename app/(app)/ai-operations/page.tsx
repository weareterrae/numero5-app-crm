import type { Metadata } from "next";
import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { euros } from "@/lib/dominio/metricas";
import { ControloTrafego } from "@/components/ai-ops/ControloTrafego";

export const metadata: Metadata = { title: "AI Operations · Nº 5" };
export const dynamic = "force-dynamic";

/** Custos vêm em USD dos fornecedores. Mostramos como tal — sem inventar câmbio. */
const usd = (v: number | null | undefined) =>
  `$${(Number(v) || 0).toFixed(Number(v) >= 1 ? 2 : 4)}`;

const ms = (v: number | null | undefined) =>
  v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`;

function Selo({ estado }: { estado: string }) {
  const cor =
    estado === "HEALTHY" || estado === "ACTIVE" || estado === "CLOSED"
      ? "bg-good/15 text-good"
      : estado === "DEGRADED" || estado === "HALF_OPEN" || estado === "UNKNOWN"
        ? "bg-warn/15 text-warn"
        : "bg-bad/15 text-bad";
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${cor}`}>
      {estado}
    </span>
  );
}

export default async function AiOperationsPage() {
  const sb = await criarClienteServidor();

  const [assistentes, modelos, fornecedores, incidentes, ultimos] = await Promise.all([
    sb.from("ai_resumo_assistente").select("*").order("pedidos_hoje", { ascending: false }),
    sb.from("ai_resumo_modelo").select("*").order("pedidos_24h", { ascending: false }),
    sb.from("ai_resumo_fornecedor").select("*").order("provider_id"),
    sb.from("ai_incidents").select("*").eq("resolvido", false).order("created_at", { ascending: false }).limit(8),
    sb.from("ai_requests")
      .select("request_id, status, provider_model_id, routing_reason, fallback_used, ttft_ms, estimated_cost, error_code, created_at")
      .order("created_at", { ascending: false }).limit(12),
  ]);

  const A = assistentes.data ?? [];
  const M = modelos.data ?? [];
  const F = fornecedores.data ?? [];
  const I = incidentes.data ?? [];
  const U = ultimos.data ?? [];

  // Totais do dia, somados a partir dos assistentes.
  const pedidosHoje = A.reduce((n, a) => n + Number(a.pedidos_hoje || 0), 0);
  const errosHoje = A.reduce((n, a) => n + Number(a.erros_hoje || 0), 0);
  const fallbacksHoje = A.reduce((n, a) => n + Number(a.fallbacks_hoje || 0), 0);
  const custoHoje = A.reduce((n, a) => n + Number(a.custo_hoje || 0), 0);
  const custoMes = A.reduce((n, a) => n + Number(a.custo_mes || 0), 0);
  const taxaOk = pedidosHoje > 0 ? ((pedidosHoje - errosHoje) / pedidosHoje) * 100 : null;
  // TTFT global: o pior P95 entre assistentes com tráfego é o que conta.
  const p95 = A.map((a) => Number(a.ttft_p95)).filter((x) => x > 0);
  const piorP95 = p95.length ? Math.max(...p95) : null;

  const noGateway = A.filter((a) => a.gateway_enabled && Number(a.traffic_percentage) > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">AI Operations</h1>
        <p className="mt-1 text-sm text-soft">
          N5 AI OS · {A.length} assistentes registados · {noGateway} a receber tráfego pelo gateway
        </p>
      </div>

      {/* ---- estado do sistema ---- */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { r: "pedidos hoje", v: String(pedidosHoje) },
          { r: "sucesso", v: taxaOk == null ? "—" : `${taxaOk.toFixed(1)}%`, mau: taxaOk != null && taxaOk < 99 },
          { r: "fallbacks", v: String(fallbacksHoje), mau: fallbacksHoje > 0 },
          { r: "ttft p95", v: ms(piorP95), mau: piorP95 != null && piorP95 > 2500 },
          { r: "custo hoje", v: usd(custoHoje) },
          { r: "custo mês", v: usd(custoMes) },
        ].map((c) => (
          <div key={c.r} className="rounded-xl border border-line bg-white p-4">
            <p className="rotulo">{c.r}</p>
            <p className={`mt-1 font-display text-2xl font-extrabold ${c.mau ? "text-bad" : ""}`}>{c.v}</p>
          </div>
        ))}
      </section>

      {/* ---- incidentes ---- */}
      {I.length > 0 && (
        <section className="rounded-xl border-2 border-warn bg-warn/5 p-5">
          <h2 className="font-display text-lg font-extrabold">Incidentes por resolver</h2>
          <ul className="mt-2 space-y-1.5">
            {I.map((i) => (
              <li key={i.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <Selo estado={i.severidade === "crit" ? "CRIT" : "WARN"} />
                <b>{i.titulo}</b>
                <span className="font-mono text-[11px] text-soft">
                  {i.tipo} · {new Date(i.created_at).toLocaleString("pt-PT")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- fornecedores ---- */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-display text-lg font-extrabold">Fornecedores</h2>
        <p className="mb-3 text-xs text-soft">
          Regra da casa: o primário e o primeiro fallback nunca são do mesmo fornecedor.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {F.map((f) => (
            <div key={f.provider_id} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <b className="text-sm">{f.display_name}</b>
                <Selo estado={f.enabled ? "ATIVO" : "DESLIGADO"} />
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-grey">
                {f.modelos_saudaveis}/{f.modelos_ativos} modelos saudáveis
                {Number(f.circuitos_abertos) > 0 && (
                  <span className="text-bad"> · {f.circuitos_abertos} circuito(s) aberto(s)</span>
                )}
              </p>
              {f.ultima_verificacao && (
                <p className="font-mono text-[10px] text-soft">
                  verificado {new Date(f.ultima_verificacao).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---- modelos ---- */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-display text-lg font-extrabold">Modelos</h2>
        <p className="mb-3 text-xs text-soft">
          Trocar um modelo é uma alteração no registo — sem deploy. Efeito em menos de 60 s.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-wide text-grey">
                <th className="py-2 pr-3">Modelo</th>
                <th className="py-2 px-3">Estado</th>
                <th className="py-2 px-3">Saúde</th>
                <th className="py-2 px-3 text-right">24h</th>
                <th className="py-2 px-3 text-right">Erros</th>
                <th className="py-2 px-3 text-right">TTFT p95</th>
                <th className="py-2 pl-3 text-right">Custo 24h</th>
              </tr>
            </thead>
            <tbody>
              {M.map((m) => (
                <tr key={m.model_id} className={`border-b border-line/50 ${m.enabled ? "" : "opacity-45"}`}>
                  <td className="py-2 pr-3">
                    <span className="font-mono text-[12px]">{m.provider_model_id}</span>
                    <span className="ml-2 font-mono text-[10px] text-soft">{m.provider_id}</span>
                    {m.shutdown_date && (
                      <span className="ml-2 rounded bg-bad/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-bad">
                        fim {m.shutdown_date}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3"><Selo estado={m.status} /></td>
                  <td className="py-2 px-3">
                    <Selo estado={m.health_status} />
                    {m.circuit_state !== "CLOSED" && (
                      <span className="ml-1"><Selo estado={m.circuit_state} /></span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">{m.pedidos_24h}</td>
                  <td className={`py-2 px-3 text-right font-mono tabular-nums ${Number(m.erros_24h) > 0 ? "text-bad" : ""}`}>
                    {m.erros_24h}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">{ms(m.ttft_p95)}</td>
                  <td className="py-2 pl-3 text-right font-mono tabular-nums">{usd(m.custo_24h)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- assistentes + controlo de tráfego ---- */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-display text-lg font-extrabold">Assistentes</h2>
        <p className="mb-3 text-xs text-soft">
          A percentagem controla quanto tráfego vai pelo gateway. 0 % = tudo pelo caminho antigo.
          Voltar a 0 é o rollback, e não precisa de deploy.
        </p>
        <div className="space-y-2">
          {A.map((a) => (
            <div key={a.assistant_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
              <div className="min-w-0 flex-1">
                <b className="text-sm">{a.nome}</b>
                {a.marca && <span className="ml-2 text-xs text-soft">{a.marca}</span>}
                <p className="font-mono text-[11px] text-grey">
                  hoje: {a.pedidos_hoje} pedidos · {a.erros_hoje} erros · {a.fallbacks_hoje} fallbacks ·
                  {" "}p95 {ms(a.ttft_p95)} · {usd(a.custo_hoje)}
                </p>
              </div>
              <ControloTrafego
                assistantId={a.assistant_id}
                nome={a.nome}
                gatewayEnabled={!!a.gateway_enabled}
                percentagem={Number(a.traffic_percentage)}
              />
            </div>
          ))}
          {A.length === 0 && <p className="text-sm text-soft">Nenhum assistente registado ainda.</p>}
        </div>
      </section>

      {/* ---- últimos pedidos ---- */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-display text-lg font-extrabold">Últimos pedidos</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-wide text-grey">
                <th className="py-2 pr-3">Hora</th>
                <th className="py-2 px-3">Estado</th>
                <th className="py-2 px-3">Modelo</th>
                <th className="py-2 px-3">Routing</th>
                <th className="py-2 px-3 text-right">TTFT</th>
                <th className="py-2 pl-3 text-right">Custo</th>
              </tr>
            </thead>
            <tbody>
              {U.map((r) => (
                <tr key={r.request_id + r.created_at} className="border-b border-line/50">
                  <td className="py-2 pr-3 font-mono text-[11px] text-grey">
                    {new Date(r.created_at).toLocaleTimeString("pt-PT")}
                  </td>
                  <td className="py-2 px-3">
                    <Selo estado={r.status === "ok" ? "OK" : (r.error_code ?? r.status).toString().toUpperCase()} />
                    {r.fallback_used && <span className="ml-1 font-mono text-[10px] text-warn">fallback</span>}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px]">{r.provider_model_id ?? "—"}</td>
                  <td className="py-2 px-3 font-mono text-[10px] text-soft">{r.routing_reason}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">{ms(r.ttft_ms)}</td>
                  <td className="py-2 pl-3 text-right font-mono tabular-nums">{usd(r.estimated_cost)}</td>
                </tr>
              ))}
              {U.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-sm text-soft">Sem pedidos registados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-soft">
          Custos em dólares, como faturados pelos fornecedores — sem conversão inventada.
        </p>
      </section>

      <p className="text-xs text-soft">
        Ver também o <Link href="/estado" className="font-bold text-gold-dark">Estado dos Sistemas</Link>{" "}
        (assistentes ainda no caminho antigo).
      </p>
    </div>
  );
}
