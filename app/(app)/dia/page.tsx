import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { euros } from "@/lib/dominio/metricas";
import { gerarBriefingDia } from "./acoes";

export const dynamic = "force-dynamic";

type Tarefa = { texto: string; detalhe?: string; href: string; urgente?: boolean };

function briefingHtml(t: string) {
  const esc = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");
}

export default async function OMeuDia() {
  const supabase = await criarClienteServidor();
  const hojeISO = new Date().toISOString().slice(0, 10);
  const ha24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const mesAtual = `${hojeISO.slice(0, 7)}-01`;

  const [clientesRes, followupsRes, planosRes, propostasRes, pedidosRes, leadsRes, cobrancasRes, reunioesRes, orgsRes, comunicacaoRes, briefingRes] =
    await Promise.all([
      supabase.from("clientes").select("id, nome_marca").neq("estado", "perdido"),
      supabase
        .from("atividades")
        .select("cliente_id, followup_nota, descricao, followup_em")
        .lte("followup_em", hojeISO)
        .eq("concluido", false)
        .order("followup_em"),
      supabase.from("planos").select("cliente_id").eq("estado", "enviado").eq("arquivado", false),
      supabase.from("propostas").select("cliente_id, updated_at").eq("estado", "enviada"),
      supabase
        .from("pedidos")
        .select("cliente_id, texto, tipo, estado")
        .neq("estado", "feito")
        .then((r) => r, () => ({ data: null })),
      supabase
        .from("crm_leads")
        .select("org_id, created_at, primeira_resposta_at, resultado, arquivado")
        .eq("arquivado", false)
        .eq("resultado", "aberto")
        .is("primeira_resposta_at", null),
      supabase
        .from("cobrancas")
        .select("cliente_id, mes, valor, estado")
        .eq("estado", "por_cobrar")
        .lt("mes", mesAtual)
        .then((r) => r, () => ({ data: null })),
      supabase
        .from("reunioes")
        .select("cliente_id, objetivo, formato")
        .eq("data", hojeISO)
        .then((r) => r, () => ({ data: null })),
      supabase.from("orgs").select("id, nome"),
      supabase
        .from("marca_comunicacao")
        .select("cliente_id, estado, dias_cobertos, proximo_post, resumo, falhas")
        .then((r) => r, () => ({ data: null })),
      supabase
        .from("configuracoes")
        .select("valor")
        .eq("chave", `briefing_dia_${hojeISO}`)
        .maybeSingle()
        .then((r) => r, () => ({ data: null })),
    ]);

  const nome = new Map(((clientesRes.data ?? []) as { id: string; nome_marca: string }[]).map((c) => [c.id, c.nome_marca]));
  const nomeOrg = new Map(((orgsRes.data ?? []) as { id: string; nome: string }[]).map((o) => [o.id, o.nome]));

  const tarefas: Tarefa[] = [];

  // Reuniões de hoje primeiro (têm hora marcada na vida real)
  for (const r of (reunioesRes.data ?? []) as { cliente_id: string; objetivo: string | null; formato: string | null }[])
    tarefas.push({
      texto: `Reunião hoje — ${nome.get(r.cliente_id) ?? "cliente"}`,
      detalhe: [r.objetivo, r.formato === "presencial" ? "presencial" : null].filter(Boolean).join(" · ") || undefined,
      href: `/clientes/${r.cliente_id}/reunioes`,
      urgente: true,
    });

  // Follow-ups de hoje e atrasados
  for (const f of (followupsRes.data ?? []) as { cliente_id: string; followup_nota: string | null; descricao: string | null; followup_em: string }[]) {
    if (!nome.has(f.cliente_id)) continue;
    const atrasado = f.followup_em < hojeISO;
    tarefas.push({
      texto: `${atrasado ? "⚠️ Atrasado — " : ""}${nome.get(f.cliente_id)}`,
      detalhe: f.followup_nota || f.descricao || "follow-up marcado",
      href: `/clientes/${f.cliente_id}`,
      urgente: atrasado,
    });
  }

  // Leads por responder há mais de 24h (todas as marcas)
  const lentasPorOrg = new Map<string, number>();
  for (const l of (leadsRes.data ?? []) as { org_id: string; created_at: string }[])
    if (l.created_at < ha24h) lentasPorOrg.set(l.org_id, (lentasPorOrg.get(l.org_id) ?? 0) + 1);
  for (const [orgId, n] of lentasPorOrg)
    tarefas.push({
      texto: `${n} lead${n > 1 ? "s" : ""} por responder há +24h — ${nomeOrg.get(orgId) ?? "org"}`,
      detalhe: "responder rápido é vender mais",
      href: "/leads",
      urgente: true,
    });

  // Pedidos de clientes na Sede
  for (const p of (pedidosRes.data ?? []) as { cliente_id: string; texto: string; tipo: string | null; estado: string }[]) {
    if (!nome.has(p.cliente_id)) continue;
    tarefas.push({
      texto: `${p.tipo === "servico" ? "💼 Pedido de serviço" : "🎫 Pedido"} — ${nome.get(p.cliente_id)}`,
      detalhe: p.texto.slice(0, 90),
      href: `/clientes/${p.cliente_id}/pedidos`,
      urgente: p.tipo === "servico",
    });
  }

  // Propostas à espera + planos enviados por aprovar (contexto, não urgente)
  for (const p of (propostasRes.data ?? []) as { cliente_id: string; updated_at: string | null }[]) {
    if (!nome.has(p.cliente_id)) continue;
    const dias = p.updated_at ? Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86_400_000) : 0;
    tarefas.push({
      texto: `Proposta sem resposta — ${nome.get(p.cliente_id)}`,
      detalhe: dias > 0 ? `enviada há ${dias} dia${dias > 1 ? "s" : ""}` : "enviada hoje",
      href: `/clientes/${p.cliente_id}`,
    });
  }
  const planosPorCliente = new Map<string, number>();
  for (const pl of (planosRes.data ?? []) as { cliente_id: string }[])
    planosPorCliente.set(pl.cliente_id, (planosPorCliente.get(pl.cliente_id) ?? 0) + 1);
  for (const [cid, n] of planosPorCliente)
    if (nome.has(cid))
      tarefas.push({
        texto: `${n} plano${n > 1 ? "s" : ""} à espera do cliente — ${nome.get(cid)}`,
        detalhe: "um toque a lembrar não faz mal",
        href: `/clientes/${cid}`,
      });

  // Cobranças de meses anteriores por regularizar
  const vencidas = (cobrancasRes.data ?? []) as { cliente_id: string; valor: number }[];
  const totalVencido = vencidas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  if (totalVencido > 0)
    tarefas.push({
      texto: `💶 ${euros(totalVencido)} de meses anteriores por cobrar`,
      detalhe: vencidas
        .map((c) => nome.get(c.cliente_id))
        .filter(Boolean)
        .join(", "),
      href: "/faturacao",
      urgente: true,
    });

  // Radar de comunicação — marcas às escuras, a ficar curtas, ou com falhas
  const radar = (comunicacaoRes?.data ?? []) as {
    cliente_id: string;
    estado: string;
    dias_cobertos: number | null;
    proximo_post: string | null;
    resumo: string | null;
    falhas: unknown[] | null;
  }[];
  for (const m of radar) {
    if (!nome.has(m.cliente_id)) continue;
    const falhas = Array.isArray(m.falhas) ? m.falhas.length : 0;
    if (falhas > 0)
      tarefas.push({
        texto: `🔴 ${falhas} publicação${falhas > 1 ? "ões" : ""} falhou — ${nome.get(m.cliente_id)}`,
        detalhe: m.resumo || "verifica o agendamento no Metricool",
        href: `/clientes/${m.cliente_id}`,
        urgente: true,
      });
    else if (m.estado === "vermelho")
      tarefas.push({
        texto: `🔴 Sem comunicação agendada — ${nome.get(m.cliente_id)}`,
        detalhe: m.proximo_post ? `próximo post só a ${m.proximo_post}` : "o feed está vazio",
        href: `/clientes/${m.cliente_id}`,
        urgente: true,
      });
    else if (m.estado === "amarelo")
      tarefas.push({
        texto: `🟡 Comunicação a ficar curta — ${nome.get(m.cliente_id)}`,
        detalhe: m.resumo || `só ${m.dias_cobertos ?? 0} dias cobertos`,
        href: `/clientes/${m.cliente_id}`,
      });
  }
  const radarResumo = radar
    .filter((m) => nome.has(m.cliente_id))
    .map((m) => `${nome.get(m.cliente_id)}: ${m.estado}${Array.isArray(m.falhas) && m.falhas.length ? ` (${m.falhas.length} falhas)` : ""}`)
    .join("; ");

  const urgentes = tarefas.filter((t) => t.urgente);
  const normais = tarefas.filter((t) => !t.urgente);
  const briefing = (briefingRes?.data as { valor?: string } | null)?.valor ?? null;

  // Contexto compacto para o Quinto (só factos, já com nomes).
  const contexto = [
    `Tarefas urgentes (${urgentes.length}): ${urgentes.map((t) => `${t.texto}${t.detalhe ? ` (${t.detalhe})` : ""}`).join("; ") || "nenhuma"}.`,
    `Outras (${normais.length}): ${normais.map((t) => t.texto).join("; ") || "nenhuma"}.`,
    totalVencido > 0 ? `Dinheiro vencido por cobrar: €${totalVencido}.` : "Sem cobranças vencidas de meses anteriores.",
    `Radar de comunicação das marcas: ${radarResumo || "sem dados ainda"}.`,
  ].join("\n");

  const dataLegivel = new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="rotulo">o que precisa de ti</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">O meu dia</h1>
        <p className="mt-1 text-sm text-grey">{dataLegivel}</p>
      </div>

      {/* Briefing do Quinto */}
      <section className="rounded-2xl bg-ink p-6 text-cream">
        <div className="flex items-center justify-between gap-2">
          <p className="rotulo" style={{ color: "var(--color-gold)" }}>
            o quinto diz
          </p>
        </div>
        {briefing ? (
          <div
            className="mt-2 text-sm leading-relaxed text-cream/85 [&_strong]:text-gold"
            dangerouslySetInnerHTML={{ __html: briefingHtml(briefing) }}
          />
        ) : (
          <form action={gerarBriefingDia} className="mt-2">
            <input type="hidden" name="contexto" value={contexto} />
            <p className="text-sm text-cream/75">
              O Quinto lê o estado do negócio e diz-te por onde atacar. Uma vez por dia.
            </p>
            <button className="mt-3 rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink hover:brightness-105">
              Gerar o briefing de hoje 🖐️
            </button>
          </form>
        )}
      </section>

      {/* Tarefas */}
      {tarefas.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-8 text-center">
          <p className="font-display text-xl font-extrabold">Tudo em dia. 🖐️</p>
          <p className="mt-1 text-sm text-grey">
            Nada urgente — bom dia para trabalhar no negócio em vez de para o negócio.
          </p>
        </div>
      ) : (
        <>
          {urgentes.length > 0 ? (
            <section>
              <p className="rotulo mb-2">agora ({urgentes.length})</p>
              <ul className="space-y-2">
                {urgentes.map((t, i) => (
                  <li key={i}>
                    <Link
                      href={t.href}
                      className="flex items-center gap-3 rounded-xl border-2 border-warn/40 bg-warn/5 px-4 py-3 transition hover:border-warn"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{t.texto}</p>
                        {t.detalhe ? <p className="truncate text-xs text-grey">{t.detalhe}</p> : null}
                      </div>
                      <span className="shrink-0 text-xs font-bold text-gold-dark">ir →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {normais.length > 0 ? (
            <section>
              <p className="rotulo mb-2">depois ({normais.length})</p>
              <ul className="space-y-2">
                {normais.map((t, i) => (
                  <li key={i}>
                    <Link
                      href={t.href}
                      className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 transition hover:border-gold/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{t.texto}</p>
                        {t.detalhe ? <p className="truncate text-xs text-grey">{t.detalhe}</p> : null}
                      </div>
                      <span className="shrink-0 text-xs font-bold text-gold-dark">ir →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <p className="text-center text-[11px] text-soft">
        Isto também chega por email todas as manhãs (digest das 08h). 🖐️
      </p>
    </div>
  );
}
