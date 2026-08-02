import Link from "next/link";
import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServidor, criarClienteServico } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function inicioDoMesISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
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

  // Leads (orgs-keyed): RLS isola + filtro explícito por org.
  let leadsMes = 0;
  let porResponder = 0;
  {
    const { data } = await supabase
      .from("crm_leads")
      .select("created_at, primeira_resposta_at, resultado, arquivado, org_id")
      .eq("org_id", ctx.org.id)
      .eq("arquivado", false);
    const leads = data ?? [];
    leadsMes = leads.filter((l) => l.created_at && l.created_at >= desdeMes).length;
    porResponder = leads.filter((l) => !l.primeira_resposta_at && l.resultado === "aberto").length;
  }

  // ROI (0054) — consulta à parte e tolerante: se a migração ainda não correu, fica a 0.
  let roiMes = 0;
  let roiTotal = 0;
  {
    const { data } = await supabase
      .from("crm_leads")
      .select("valor_negocio, ganho_em, resultado")
      .eq("org_id", ctx.org.id)
      .eq("resultado", "ganho");
    for (const l of data ?? []) {
      const v = Number((l as { valor_negocio?: number | null }).valor_negocio) || 0;
      if (!v) continue;
      roiTotal += v;
      const g = (l as { ganho_em?: string | null }).ganho_em;
      if (g && g >= desdeMes) roiMes += v;
    }
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
