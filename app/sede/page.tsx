import Link from "next/link";
import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServidor, criarClienteServico } from "@/lib/supabase/server";
import { canaisQueVendem, leadsLentas, rotuloOrigem, type LeadSinal } from "@/lib/sede/sinais";
import { euros } from "@/lib/dominio/metricas";
import { gerarResumoMes } from "./acoes";

export const dynamic = "force-dynamic";

function inicioDoMesISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

/** Formata o resumo do assistente: escapa HTML e trata **negrito** + quebras. */
function resumoHtml(t: string) {
  const esc = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");
}

function Mosaico({
  rotulo,
  valor,
  nota,
  href,
  alerta,
}: {
  rotulo: string;
  valor: string | number;
  nota?: string;
  href?: string;
  alerta?: boolean;
}) {
  const inner = (
    <div className="rounded-xl border border-line bg-white p-5 transition hover:border-gold/50">
      <div className="rotulo">{rotulo}</div>
      <div className="numero mt-1 text-4xl leading-none">{valor}</div>
      {nota ? (
        <div className={`mt-1 text-xs font-bold ${alerta ? "text-bad" : "text-good"}`}>{nota}</div>
      ) : null}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function SedePainel() {
  const ctx = await contextoSede();
  const supabase = await criarClienteServidor();
  const svc = criarClienteServico();
  const desdeMes = inicioDoMesISO();

  // Leads (orgs-keyed): RLS isola + filtro explícito por org. Uma consulta só.
  const { data: leadsRaw } = await supabase
    .from("crm_leads")
    .select("created_at, primeira_resposta_at, resultado, arquivado, origem, valor_negocio, ganho_em")
    .eq("org_id", ctx.org.id)
    .eq("arquivado", false);
  const leads = (leadsRaw ?? []) as LeadSinal[];
  const leadsMes = leads.filter((l) => l.created_at && l.created_at >= desdeMes).length;
  const porResponder = leads.filter((l) => !l.primeira_resposta_at && l.resultado === "aberto").length;
  const lentas = leadsLentas(leads);
  const canais = canaisQueVendem(leads).filter((x) => x.total > 0).slice(0, 3);

  // ROI (0054) — tolerante: se a migração ainda não correu, fica a 0.
  let roiMes = 0;
  let roiTotal = 0;
  for (const l of leads) {
    if (l.resultado !== "ganho") continue;
    const v = Number(l.valor_negocio) || 0;
    if (!v) continue;
    roiTotal += v;
    if (l.ganho_em && l.ganho_em >= desdeMes) roiMes += v;
  }

  // Internos (clientes-keyed): SÓ via service-role, estritamente filtrado por clienteId da sessão.
  let aprovacoesPendentes = 0;
  let ultimoRelatorioMes: string | null = null;
  if (ctx.clienteId) {
    const { data: planos } = await svc
      .from("planos")
      .select("id")
      .eq("cliente_id", ctx.clienteId)
      .eq("estado", "enviado");
    aprovacoesPendentes = planos?.length ?? 0;

    const { data: rel } = await svc
      .from("relatorios")
      .select("mes")
      .eq("cliente_id", ctx.clienteId)
      .order("mes", { ascending: false })
      .limit(1)
      .maybeSingle();
    ultimoRelatorioMes = rel?.mes ?? null;
  }

  // KPIs (clientes.kpis jsonb) + resumo do mês (0057), tolerantes.
  let kpis: [string, string][] = [];
  let resumoMes: string | null = null;
  if (ctx.clienteId) {
    const { data: cli } = await svc.from("clientes").select("kpis").eq("id", ctx.clienteId).maybeSingle();
    const k = (cli?.kpis && typeof cli.kpis === "object" ? cli.kpis : {}) as Record<string, unknown>;
    kpis = Object.entries(k)
      .filter(([, v]) => v != null && String(v).trim() !== "")
      .map(([kk, v]) => [kk, String(v)] as [string, string]);
    const mesISO = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
    const { data: rz } = await svc
      .from("sede_resumos")
      .select("texto")
      .eq("cliente_id", ctx.clienteId)
      .eq("mes", mesISO)
      .maybeSingle();
    resumoMes = rz?.texto ?? null;
  }

  const mesRelatorio = ultimoRelatorioMes
    ? new Date(ultimoRelatorioMes).toLocaleDateString("pt-PT", { month: "long", year: "numeric" })
    : "—";

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">Bem-vindo à tua Sede 🖐️</h1>
      <p className="mt-1 text-grey">
        O teu marketing, num sítio só — com a tua marca. Aqui vês o que se passa e aprovas o que vem
        a caminho.
      </p>

      {lentas > 0 ? (
        <Link
          href="/sede/leads"
          className="mt-6 flex items-center gap-3 rounded-xl border-2 border-bad/40 bg-bad/5 px-4 py-3 text-sm font-bold text-bad transition hover:border-bad"
        >
          <span className="text-lg">⏰</span>
          {lentas === 1
            ? "Tens 1 lead à espera de resposta há mais de um dia. Responder rápido é vender mais."
            : `Tens ${lentas} leads à espera de resposta há mais de um dia. Responder rápido é vender mais.`}
          <span className="ml-auto shrink-0">responder →</span>
        </Link>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Mosaico rotulo="Leads este mês" valor={leadsMes} href="/sede/leads" />
        <Mosaico
          rotulo="Por responder"
          valor={porResponder}
          nota={porResponder > 0 ? "a precisar de ti" : "tudo respondido"}
          alerta={porResponder > 0}
          href="/sede/leads"
        />
        <Mosaico
          rotulo="A aprovar"
          valor={aprovacoesPendentes}
          nota={aprovacoesPendentes > 0 ? "aguardam a tua decisão" : "nada pendente"}
          alerta={aprovacoesPendentes > 0}
          href="/sede/plano"
        />
        <Mosaico rotulo="Último relatório" valor={mesRelatorio} href="/sede/relatorio" />
      </div>

      <div className="mt-4 rounded-2xl bg-ink px-6 py-5 text-cream">
        <div className="rotulo" style={{ color: "var(--color-gold)" }}>o marketing a render</div>
        {roiTotal > 0 ? (
          <>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-display text-4xl font-extrabold text-gold">
                €{roiMes.toLocaleString("pt-PT")}
              </span>
              <span className="text-sm text-cream/80">fechado este mês a partir das tuas leads</span>
            </div>
            {roiTotal > roiMes ? (
              <p className="mt-1 text-[12px] text-cream/60">€{roiTotal.toLocaleString("pt-PT")} no total</p>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm text-cream/80">
            Marca as tuas vendas nas leads (botão «Marcar como venda») e vê aqui, em euros, quanto o
            marketing te rende. 🖐️
          </p>
        )}
      </div>

      {/* Resumo do mês — o assistente proativo (cadência mensal) */}
      {ctx.clienteId ? (
        <section className="mt-4 rounded-2xl border border-line bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="rotulo">o teu mês, pelo assistente</div>
            <span className="text-[11px] text-soft">🤖 escrito para ti</span>
          </div>
          {resumoMes ? (
            <div
              className="mt-3 text-sm leading-relaxed text-grey [&_strong]:text-ink"
              dangerouslySetInnerHTML={{ __html: resumoHtml(resumoMes) }}
            />
          ) : (
            <form action={gerarResumoMes} className="mt-2">
              <p className="text-sm text-grey">
                O teu assistente pode escrever o resumo do mês — o que aconteceu e o que propõe para
                o próximo. Leva uns segundos.
              </p>
              <button
                type="submit"
                className="mt-3 rounded-full bg-ink px-5 py-2 text-sm font-bold text-cream hover:brightness-110"
              >
                Gerar o meu resumo do mês 🖐️
              </button>
            </form>
          )}
        </section>
      ) : null}

      {/* Os canais que te vendem */}
      {canais.length > 0 ? (
        <section className="mt-4 rounded-2xl border border-line bg-white p-6">
          <div className="rotulo">os canais que te vendem</div>
          <ul className="mt-3 space-y-2">
            {canais.map((c) => (
              <li key={c.origem} className="flex items-center gap-3 text-sm">
                <span className="flex-1 font-bold">{rotuloOrigem(c.origem)}</span>
                <span className="text-grey">
                  {c.n} {c.n === 1 ? "venda" : "vendas"}
                </span>
                <span className="numero w-24 text-right">{euros(c.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* As tuas metas */}
      {kpis.length > 0 ? (
        <section className="mt-4 rounded-2xl border border-line bg-white p-6">
          <div className="rotulo">as tuas metas</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {kpis.map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-cream/40 p-3">
                <div className="text-xs font-bold text-grey">{k}</div>
                <div className="text-sm">{v}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!ctx.clienteId ? (
        <p className="mt-6 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Estamos a preparar o teu relatório e o teu plano — ficam disponíveis aqui muito em breve.
          🖐️
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Link
          href="/sede/relatorio"
          className="rounded-xl border border-line bg-white p-5 transition hover:border-gold/50"
        >
          <div className="rotulo">O trabalho do mês</div>
          <p className="mt-1 font-bold">Ver o relatório em números →</p>
          <p className="mt-1 text-sm text-grey">Publicações, alcance, leads e conversão.</p>
        </Link>
        <Link
          href="/sede/ficha"
          className="rounded-xl border border-line bg-white p-5 transition hover:border-gold/50"
        >
          <div className="rotulo">A tua ficha</div>
          <p className="mt-1 font-bold">Manter a informação atualizada →</p>
          <p className="mt-1 text-sm text-grey">O que atualizas aqui chega-nos na hora.</p>
        </Link>
      </div>
    </div>
  );
}
