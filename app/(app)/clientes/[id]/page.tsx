import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DEPARTAMENTOS,
  listarAtividades,
  listarContactos,
  obterCliente,
  obterIntake,
  ONBOARDING,
  ORIGENS,
  REDES,
} from "@/lib/db/clientes";
import { ESTADOS, ESTADO_LABEL, type Estado } from "@/lib/dominio/funil";
import { dataCurta, euros } from "@/lib/dominio/metricas";
import { EstadoPill } from "@/components/crm/EstadoPill";
import { MudarEstado } from "@/components/crm/MudarEstado";
import { Guia } from "@/components/crm/Guia";
import { LinkDiagnostico } from "@/components/crm/LinkDiagnostico";
import { ApagarCliente } from "@/components/crm/ApagarCliente";
import {
  adicionarAtividade,
  adicionarContacto,
  apagarContacto,
  atualizarCliente,
  concluirFollowup,
  editarContacto,
  guardarOnboarding,
  ligarSedeOrg,
  criarAcessoSede,
  removerAcessoSede,
} from "../acoes";
import { criarDiagnostico } from "@/app/(app)/diagnosticos/acoes";
import { criarProposta } from "@/app/(app)/propostas/acoes";
import { SeguimentoSugerido } from "@/components/crm/SeguimentoSugerido";
import { situacaoSeguimento, mensagemSeguimento } from "@/lib/dominio/followups";
import { criarPlano } from "@/app/(app)/clientes/[id]/planos/acoes";
import { criarRelatorio } from "@/app/(app)/clientes/[id]/relatorios/acoes";
import { mesLegivel } from "@/lib/dominio/producao";
import { criarClienteServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TIPOS: [string, string][] = [
  ["nota", "Nota"],
  ["chamada", "Chamada"],
  ["email", "Email"],
  ["reuniao", "Reunião"],
  ["mensagem", "Mensagem"],
];

export default async function FichaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cliente = await obterCliente(id);
  if (!cliente) notFound();

  const supabase = await criarClienteServidor();
  // Orgs da Sede ligadas a este cliente (pode haver mais de uma, ex.: marca +
  // recrutamento). maybeSingle() falhava com 2 linhas e escondia a ligação.
  const { data: orgsLigadasRaw } = await supabase
    .from("orgs")
    .select("id, slug, nome")
    .eq("cliente_id", id)
    .order("slug");
  const orgsLigadas = (orgsLigadasRaw ?? []) as { id: string; slug: string; nome: string }[];

  // Acessos ativos à Sede: membros externos das orgs ligadas a esta ficha.
  type Acesso = { org_id: string; profile_id: string; email: string; nome: string | null };
  let acessos: Acesso[] = [];
  if (orgsLigadas.length) {
    const { data: membrosRaw } = await supabase
      .from("org_membros")
      .select("org_id, profile_id, profiles(email, nome, externo)")
      .in("org_id", orgsLigadas.map((o) => o.id));
    acessos = ((membrosRaw ?? []) as { org_id: string; profile_id: string; profiles: unknown }[])
      .map((m) => {
        const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as {
          email?: string | null;
          nome?: string | null;
          externo?: boolean | null;
        } | null;
        return {
          org_id: m.org_id,
          profile_id: m.profile_id,
          email: p?.email ?? "?",
          nome: p?.nome ?? null,
          externo: p?.externo,
        };
      })
      .filter((a) => a.externo !== false) // esconder adesões da equipa
      .map(({ externo: _e, ...resto }) => resto);
  }
  const orgLigada = orgsLigadas[0] ?? null;
  // Orgs livres (sem cliente) — para associar a Sede a esta ficha.
  const { data: orgsLivresRaw } = await supabase
    .from("orgs")
    .select("id, slug, nome")
    .is("cliente_id", null)
    .order("nome");
  const orgsLivres = (orgsLivresRaw ?? []) as { id: string; slug: string; nome: string }[];
  // Pedidos de serviço abertos na Sede (viram proposta). Tolerante a 0056.
  const { data: pedidosServico } = await supabase
    .from("pedidos")
    .select("id, estado")
    .eq("cliente_id", id)
    .eq("tipo", "servico")
    .neq("estado", "feito");
  const [atividades, contactos, intake, diagRes, propRes, planosRes, relatoriosRes, metricoolRes] =
    await Promise.all([
    listarAtividades(id),
    listarContactos(id),
    obterIntake(id),
    supabase
      .from("diagnosticos")
      .select("id, versao, estado, site_score, created_at")
      .eq("cliente_id", id)
      .order("versao", { ascending: false }),
    supabase
      .from("propostas")
      .select("id, versao, estado, setup_valor, avenca_valor, created_at")
      .eq("cliente_id", id)
      .order("versao", { ascending: false }),
    supabase
      .from("planos")
      .select("id, mes, titulo, estado, arquivado")
      .eq("cliente_id", id)
      .order("mes", { ascending: false }),
    // Tolerante: se a migração 0016 ainda não correu, vem vazio em vez de partir.
    supabase
      .from("relatorios")
      .select("id, mes, titulo, estado, visto_em")
      .eq("cliente_id", id)
      .order("mes", { ascending: false }),
    supabase
      .from("clientes")
      .select(
        "idioma, metricool_blog_id, empresa_fiscal, nif, morada, codigo_postal, localidade, kit_logo, kit_cores, kit_fontes, kit_notas, onboarding",
      )
      .eq("id", id)
      .maybeSingle(),
  ]);
  const propostas = (propRes.data ?? []) as {
    id: string;
    versao: number;
    estado: string;
    setup_valor: number | null;
    avenca_valor: number | null;
    created_at: string;
  }[];
  const planos = (planosRes.data ?? []) as {
    id: string;
    mes: string;
    titulo: string | null;
    estado: string;
    arquivado: boolean;
  }[];
  const planosVisiveis = planos.filter((p) => !p.arquivado);
  const planosArquivados = planos.filter((p) => p.arquivado);
  const relatorios = (relatoriosRes.data ?? []) as {
    id: string;
    mes: string;
    titulo: string | null;
    estado: string;
    visto_em: string | null;
  }[];
  const metricoolBlogId = (metricoolRes.data?.metricool_blog_id ?? "") as string;
  const fat = (metricoolRes.data ?? {}) as {
    empresa_fiscal?: string | null;
    nif?: string | null;
    morada?: string | null;
    codigo_postal?: string | null;
    localidade?: string | null;
    kit_logo?: string | null;
    kit_cores?: string | null;
    kit_fontes?: string | null;
    kit_notas?: string | null;
  };
  const idiomaCliente = (metricoolRes.data?.idioma ?? "pt") as string;
  const onboarding = (metricoolRes.data?.onboarding ?? {}) as Record<string, boolean>;
  const obFeitos = ONBOARDING.filter(([k]) => onboarding[k]).length;
  const diagnosticos = (diagRes.data ?? []) as {
    id: string;
    versao: number;
    estado: string;
    site_score: number | null;
    created_at: string;
  }[];
  const hoje = new Date().toISOString().slice(0, 10);
  const porFazer = atividades.filter((a) => a.followup_em && !a.concluido);
  // Para pré-preencher o WhatsApp/email: o contacto principal, ou o primeiro com contacto.
  const contactoPrincipal =
    contactos.find((c) => c.principal && (c.telefone || c.email)) ??
    contactos.find((c) => c.telefone || c.email) ??
    null;

  // Seguimento sugerido (Fase 7) — mensagem preparada para o estado atual.
  const idiomaCli = (metricoolRes.data?.idioma === "en" ? "en" : "pt") as "pt" | "en";
  const seg = situacaoSeguimento({
    intakeSubmetido: !!intake?.intake_submetido_em,
    temRascunho: false,
    propostaEnviada: propostas.some((p) => p.estado === "enviada"),
    propostaVista: false,
    propostaDecidida: propostas.some((p) => p.estado === "aceite" || p.estado === "recusada"),
  });
  const msgSeguimento = seg
    ? mensagemSeguimento(
        seg,
        { nome: contactoPrincipal?.nome ?? cliente.nome_marca, empresa: cliente.nome_marca },
        idiomaCli,
      )
    : null;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/clientes" className="text-xs font-bold text-gold-dark">
            ← Clientes
          </Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            {cliente.nome_marca}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-grey">
            <EstadoPill estado={cliente.estado} />
            {cliente.setor && <span>{cliente.setor}</span>}
            {cliente.valor_estimado ? (
              <span className="font-mono text-xs">{euros(cliente.valor_estimado)}</span>
            ) : null}
          </div>
          {cliente.estado === "perdido" && cliente.motivo_perda && (
            <p className="mt-2 text-sm text-bad">Perdido: {cliente.motivo_perda}</p>
          )}
        </div>
        <MudarEstado
          clienteId={cliente.id}
          estadoAtual={cliente.estado}
          estados={ESTADOS.map((e) => [e, ESTADO_LABEL[e as Estado]])}
        />
      </div>

      {/* Atalhos do cliente — pills compactas, nunca quebram linha */}
      <nav className="flex flex-wrap items-center gap-1.5">
        <Link
          href={`/clientes/${cliente.id}/conteudo`}
          className="whitespace-nowrap rounded-full bg-gold px-3.5 py-1.5 text-xs font-bold text-ink hover:brightness-105"
        >
          🧠 Brief de conteúdo
        </Link>
        <Link
          href={`/clientes/${cliente.id}/producao`}
          className="whitespace-nowrap rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-cream hover:brightness-110"
        >
          📋 Produção
        </Link>
        {orgLigada ? (
          <a
            href={`/sede/ver/${orgLigada.slug}`}
            className="whitespace-nowrap rounded-full border-2 border-gold px-3.5 py-1 text-xs font-bold text-gold-dark hover:bg-gold hover:text-ink"
          >
            👀 Ver como cliente
          </a>
        ) : null}
        <span className="mx-1 hidden h-4 w-px bg-line sm:block" aria-hidden />
        {(
          [
            ["reunioes", "🗓️", "Reuniões"],
            ["aprovacoes", "✅", "Aprovações"],
            ["revisoes", "✏️", "Revisões"],
            ["financeiro", "💶", "Financeiro"],
            ["rentabilidade", "📈", "Rentabilidade"],
            ["extras", "➕", "Ordens"],
            ["autorizacoes", "🔏", "Autorizações"],
            ["objetivos", "🎯", "Objetivos"],
            ["biblioteca", "📚", "Biblioteca"],
            ["pedidos", "🎫", "Pedidos"],
          ] as const
        ).map(([rota, icone, rotulo]) => (
          <Link
            key={rota}
            href={`/clientes/${cliente.id}/${rota}`}
            className="whitespace-nowrap rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-grey hover:border-gold/60 hover:text-ink"
          >
            {icone} {rotulo}
          </Link>
        ))}
      </nav>

      {/* Na Sede do cliente — o espelho do que o cliente vê e do que espera por nós */}
      {(() => {
        const pedProp = pedidosServico?.length ?? 0;
        const planosPorAprovar = planosVisiveis.filter((p) => p.estado === "enviado").length;
        const propPorDecidir = propostas.filter((p) => p.estado === "enviada").length;
        const relatPorAbrir = relatorios.filter((r) => r.estado === "enviado" && !r.visto_em).length;
        const Chip = ({ n, txt, alerta }: { n: number; txt: string; alerta?: boolean }) => (
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              alerta ? "bg-gold/20 text-gold-dark" : "border border-line text-grey"
            }`}
          >
            {n} · {txt}
          </span>
        );
        return (
          <section className="rounded-xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold">🏠 Na Sede do cliente</h2>
              {orgsLigadas.length > 0 ? (
                <span className="flex flex-wrap gap-2">
                  {orgsLigadas.map((o) => (
                    <a
                      key={o.slug}
                      href={`/sede/ver/${o.slug}`}
                      className="text-xs font-bold text-gold-dark hover:underline"
                    >
                      👀 {orgsLigadas.length > 1 ? o.nome : "Ver como cliente"} →
                    </a>
                  ))}
                </span>
              ) : null}
            </div>
            {orgsLigadas.length > 0 ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pedProp > 0 ? <Chip n={pedProp} txt="pedido(s) de serviço → fazer proposta" alerta /> : null}
                  {propPorDecidir > 0 ? <Chip n={propPorDecidir} txt="proposta(s) à espera do cliente" alerta /> : null}
                  {planosPorAprovar > 0 ? <Chip n={planosPorAprovar} txt="plano(s) a aprovar" alerta /> : null}
                  {relatPorAbrir > 0 ? <Chip n={relatPorAbrir} txt="relatório(s) por abrir" /> : null}
                  {pedProp === 0 && propPorDecidir === 0 && planosPorAprovar === 0 && relatPorAbrir === 0 ? (
                    <span className="text-xs text-soft">Tudo em dia — nada à espera de decisão do cliente. 🖐️</span>
                  ) : null}
                </div>

                {/* Acessos do cliente à Sede */}
                <div className="mt-3 border-t border-line/60 pt-3">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-grey">
                    Quem entra na Sede
                  </p>
                  {acessos.length > 0 ? (
                    <ul className="mb-2 flex flex-wrap gap-1.5">
                      {acessos.map((a) => (
                        <li
                          key={`${a.org_id}-${a.profile_id}`}
                          className="flex items-center gap-1.5 rounded-full border border-line bg-cream/60 py-1 pl-3 pr-1.5 text-xs"
                        >
                          <span className="font-bold">{a.email}</span>
                          {orgsLigadas.length > 1 ? (
                            <span className="text-soft">
                              · {orgsLigadas.find((o) => o.id === a.org_id)?.nome}
                            </span>
                          ) : null}
                          <form action={removerAcessoSede}>
                            <input type="hidden" name="cliente_id" value={cliente.id} />
                            <input type="hidden" name="org_id" value={a.org_id} />
                            <input type="hidden" name="profile_id" value={a.profile_id} />
                            <button
                              type="submit"
                              className="rounded-full px-1.5 font-bold text-soft hover:text-bad"
                              title="Revogar este acesso"
                            >
                              ✕
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-2 text-xs text-soft">Ainda ninguém tem acesso. Convida o primeiro. 🖐️</p>
                  )}
                  <form action={criarAcessoSede} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="cliente_id" value={cliente.id} />
                    {orgsLigadas.length > 1 ? (
                      <select name="org_id" className="rounded-lg border border-line bg-cream px-2 py-1.5 text-xs" required>
                        {orgsLigadas.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nome}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input type="hidden" name="org_id" value={orgsLigadas[0].id} />
                    )}
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="email do cliente"
                      className="w-52 rounded-lg border border-line px-2.5 py-1.5 text-xs outline-none focus:border-gold"
                    />
                    <input
                      name="nome"
                      placeholder="nome (opcional)"
                      className="w-36 rounded-lg border border-line px-2.5 py-1.5 text-xs outline-none focus:border-gold"
                    />
                    <button className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-cream hover:brightness-110">
                      👤 Criar acesso + convite
                    </button>
                  </form>
                  <p className="mt-1 text-[10px] text-soft">
                    Entra por link mágico enviado ao email — sem passwords. Repetir reenvia o convite.
                  </p>
                </div>
              </>
            ) : (
              <div className="mt-2">
                <p className="text-xs text-grey">
                  Este cliente ainda não tem a Sede ligada. Associa uma organização para o portal
                  (leads, relatórios, planos) ficar ligado a esta ficha.
                </p>
                {orgsLivres.length > 0 ? (
                  <form action={ligarSedeOrg} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="cliente_id" value={cliente.id} />
                    <select
                      name="org_id"
                      className="rounded-lg border border-line bg-cream px-2.5 py-2 text-sm"
                      required
                    >
                      <option value="">— escolhe a organização —</option>
                      {orgsLivres.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nome}
                        </option>
                      ))}
                    </select>
                    <button className="rounded-full bg-ink px-4 py-2 text-xs font-bold text-cream hover:brightness-110">
                      Ligar à Sede
                    </button>
                  </form>
                ) : (
                  <p className="mt-1 text-xs text-soft">
                    Não há organizações livres — cria primeiro a org do cliente (em Leads) e volta cá.
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })()}

      {/* Follow-ups por fazer */}
      {porFazer.length > 0 && (
        <section className="rounded-xl border-2 border-gold bg-gold/5 p-4">
          <h2 className="mb-2 text-sm font-bold text-gold-dark">Próximos passos</h2>
          {porFazer.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span>
                <span
                  className={`font-mono text-xs ${a.followup_em! <= hoje ? "font-bold text-bad" : "text-grey"}`}
                >
                  {a.followup_em! <= hoje ? "⏰ " : ""}
                  {dataCurta(a.followup_em)}
                </span>{" "}
                — {a.followup_nota || a.descricao}
              </span>
              <form action={concluirFollowup}>
                <input type="hidden" name="atividade_id" value={a.id} />
                <input type="hidden" name="cliente_id" value={cliente.id} />
                <button className="shrink-0 text-xs font-bold text-good">feito ✓</button>
              </form>
            </div>
          ))}
        </section>
      )}

      {/* Seguimento sugerido para o estado atual (nunca envia sozinho) */}
      {msgSeguimento && (
        <SeguimentoSugerido mensagem={msgSeguimento} telefone={contactoPrincipal?.telefone} />
      )}

      {/* Link de diagnóstico para o cliente preencher */}
      <LinkDiagnostico
        token={intake.intake_token}
        submetidoEm={intake.intake_submetido_em}
        nome={cliente.nome_marca}
        telefone={contactoPrincipal?.telefone}
        email={contactoPrincipal?.email}
        clienteId={cliente.id}
        idioma={idiomaCliente === "en" ? "en" : "pt"}
      />

      {/* Assistente comercial */}
      <Guia clienteId={cliente.id} nome={cliente.nome_marca} />

      {/* Diagnósticos */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold">Diagnósticos</h2>
          <form action={criarDiagnostico}>
            <input type="hidden" name="cliente_id" value={cliente.id} />
            <button className="rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-ink">
              + Novo diagnóstico
            </button>
          </form>
        </div>
        {diagnosticos.length === 0 ? (
          <p className="text-sm text-soft">Ainda sem diagnóstico. É por aqui que se começa. 🖐️</p>
        ) : (
          diagnosticos.map((d) => (
            <Link
              key={d.id}
              href={`/diagnosticos/${d.id}`}
              className="flex items-center justify-between gap-3 border-b border-line/60 py-2.5 last:border-0 hover:text-gold-dark"
            >
              <div>
                <p className="text-sm font-bold">
                  Versão {d.versao}{" "}
                  <span className="font-normal text-soft">
                    · {d.estado === "concluido" ? "concluído" : "rascunho"}
                  </span>
                </p>
                <p className="text-xs text-grey">{dataCurta(d.created_at)}</p>
              </div>
              {d.site_score !== null && (
                <span className="numero text-lg">{d.site_score}/10</span>
              )}
            </Link>
          ))
        )}
      </section>

      {/* Propostas */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold">Propostas</h2>
          <form action={criarProposta}>
            <input type="hidden" name="cliente_id" value={cliente.id} />
            <button className="rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-ink">
              + Nova proposta
            </button>
          </form>
        </div>
        {propostas.length === 0 ? (
          <p className="text-sm text-soft">
            Ainda sem proposta. Herda o diagnóstico mais recente quando criares.
          </p>
        ) : (
          propostas.map((pr) => (
            <Link
              key={pr.id}
              href={`/propostas/${pr.id}`}
              className="flex items-center justify-between gap-3 border-b border-line/60 py-2.5 last:border-0 hover:text-gold-dark"
            >
              <div>
                <p className="text-sm font-bold">
                  Versão {pr.versao} <span className="font-normal text-soft">· {pr.estado}</span>
                </p>
                <p className="text-xs text-grey">{dataCurta(pr.created_at)}</p>
              </div>
              <span className="font-mono text-xs">
                {pr.avenca_valor ? `${euros(pr.avenca_valor)}/mês` : pr.setup_valor ? euros(pr.setup_valor) : ""}
              </span>
            </Link>
          ))
        )}
      </section>

      {/* Planos mensais */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold">Planos mensais</h2>
          <form action={criarPlano}>
            <input type="hidden" name="cliente_id" value={cliente.id} />
            <button className="rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-ink">
              + Novo plano
            </button>
          </form>
        </div>
        {planosVisiveis.length === 0 && planosArquivados.length === 0 ? (
          <p className="text-sm text-soft">
            Ainda sem planos. Cria um, cola o HTML feito no Claude Code e partilha com o cliente.
          </p>
        ) : (
          planosVisiveis.map((pl) => (
            <Link
              key={pl.id}
              href={`/clientes/${cliente.id}/planos/${pl.id}`}
              className="flex items-center justify-between gap-3 border-b border-line/60 py-2.5 last:border-0 hover:text-gold-dark"
            >
              <div>
                <p className="text-sm font-bold">{mesLegivel(pl.mes)}</p>
                {pl.titulo && <p className="text-xs text-grey">{pl.titulo}</p>}
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  pl.estado === "aprovado"
                    ? "bg-good/15 text-good"
                    : pl.estado === "recusado"
                      ? "bg-bad/10 text-bad"
                      : pl.estado === "alteracoes"
                        ? "bg-gold/20 text-gold-dark"
                        : "bg-line/70 text-grey"
                }`}
              >
                {pl.estado}
              </span>
            </Link>
          ))
        )}
        {planosArquivados.length > 0 && (
          <details className="mt-3 border-t border-line/60 pt-3">
            <summary className="cursor-pointer text-xs font-bold text-grey">
              Anexos arquivados ({planosArquivados.length})
            </summary>
            <div className="mt-2">
              {planosArquivados.map((pl) => (
                <Link
                  key={pl.id}
                  href={`/clientes/${cliente.id}/planos/${pl.id}`}
                  className="flex items-center justify-between gap-3 border-b border-line/40 py-2 opacity-70 last:border-0 hover:text-gold-dark hover:opacity-100"
                >
                  <div>
                    {pl.titulo && <p className="text-xs font-bold">{pl.titulo}</p>}
                    <p className="text-[11px] text-grey">{mesLegivel(pl.mes)} · arquivado</p>
                  </div>
                </Link>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* Relatórios mensais */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold">Relatórios mensais</h2>
          <form action={criarRelatorio}>
            <input type="hidden" name="cliente_id" value={cliente.id} />
            <button className="rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-ink">
              + Novo relatório
            </button>
          </form>
        </div>
        {relatorios.length === 0 ? (
          <p className="text-sm text-soft">
            Ainda sem relatórios. No fim do mês, produz um no Claude Code (métricas do Metricool na
            tua voz) e partilha com o cliente.
          </p>
        ) : (
          relatorios.map((rl) => (
            <Link
              key={rl.id}
              href={`/clientes/${cliente.id}/relatorios/${rl.id}`}
              className="flex items-center justify-between gap-3 border-b border-line/60 py-2.5 last:border-0 hover:text-gold-dark"
            >
              <div>
                <p className="text-sm font-bold">{mesLegivel(rl.mes)}</p>
                {rl.titulo && <p className="text-xs text-grey">{rl.titulo}</p>}
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  rl.estado === "enviado" ? "bg-good/15 text-good" : "bg-line/70 text-grey"
                }`}
              >
                {rl.estado === "enviado" ? (rl.visto_em ? "visto ✓" : "enviado") : "rascunho"}
              </span>
            </Link>
          ))
        )}
      </section>

      {/* Onboarding */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold">Onboarding</h2>
          <span
            className={`text-sm font-bold ${obFeitos === ONBOARDING.length ? "text-good" : "text-grey"}`}
          >
            {obFeitos}/{ONBOARDING.length}
          </span>
        </div>
        <form action={guardarOnboarding}>
          <input type="hidden" name="id" value={cliente.id} />
          <div className="space-y-1.5">
            {ONBOARDING.map(([k, label]) => (
              <label
                key={k}
                className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name={`ob_${k}`}
                  defaultChecked={!!onboarding[k]}
                  className="size-4 accent-[#E8A13C]"
                />
                <span className={onboarding[k] ? "text-soft line-through" : ""}>{label}</span>
              </label>
            ))}
          </div>
          <button className="mt-3 rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink">
            Guardar checklist
          </button>
        </form>
      </section>

      {/* Dados */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-3 font-display text-lg font-extrabold">Dados</h2>
        <form action={atualizarCliente} className="space-y-3">
          <input type="hidden" name="id" value={cliente.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="nome_marca" label="Nome da marca *" defaultValue={cliente.nome_marca} required />
            <Campo id="setor" label="Setor" defaultValue={cliente.setor ?? ""} />
            <Campo id="website" label="Website" defaultValue={cliente.website ?? ""} />
            <Campo
              id="metricool_blog_id"
              label="Metricool (blogId)"
              defaultValue={metricoolBlogId}
              placeholder="ex.: 6591324"
            />
            <Campo
              id="valor_estimado"
              label="Valor estimado (€)"
              type="number"
              defaultValue={cliente.valor_estimado ?? ""}
            />
            <div>
              <label htmlFor="origem" className="mb-1.5 block text-xs font-bold text-grey">
                Origem
              </label>
              <select
                id="origem"
                name="origem"
                defaultValue={cliente.origem ?? ""}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {ORIGENS.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="idioma" className="mb-1.5 block text-xs font-bold text-grey">
                Idioma do cliente
              </label>
              <select
                id="idioma"
                name="idioma"
                defaultValue={idiomaCliente}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
              >
                <option value="pt">Português</option>
                <option value="en">English</option>
              </select>
              <p className="mt-1 text-[11px] text-soft">
                Tudo o que o cliente recebe (diagnóstico, proposta, mensagens) fica neste idioma.
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold text-grey">Redes sociais</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {REDES.filter(([k]) => k !== "site").map(([chave, nome]) => (
                <Campo
                  key={chave}
                  id={`rede_${chave}`}
                  label={nome}
                  defaultValue={cliente.redes?.[chave] ?? ""}
                />
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="notas_gerais" className="mb-1.5 block text-xs font-bold text-grey">
              Notas
            </label>
            <textarea
              id="notas_gerais"
              name="notas_gerais"
              rows={3}
              defaultValue={cliente.notas_gerais ?? ""}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
            />
          </div>

          {/* Dados de faturação */}
          <div className="border-t border-line/60 pt-4">
            <p className="mb-2 text-xs font-bold text-grey">Dados de faturação</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                id="empresa_fiscal"
                label="Empresa (nome fiscal)"
                defaultValue={fat.empresa_fiscal ?? ""}
                placeholder="ex.: Os Caetanos, Lda"
              />
              <Campo id="nif" label="NIF / NIPC" defaultValue={fat.nif ?? ""} placeholder="ex.: 504428918" />
              <Campo id="morada" label="Morada" defaultValue={fat.morada ?? ""} />
              <div className="grid grid-cols-2 gap-3">
                <Campo id="codigo_postal" label="Código postal" defaultValue={fat.codigo_postal ?? ""} />
                <Campo id="localidade" label="Localidade" defaultValue={fat.localidade ?? ""} />
              </div>
            </div>
          </div>

          {/* Marca & acessos */}
          <div className="border-t border-line/60 pt-4">
            <p className="mb-2 text-xs font-bold text-grey">Marca &amp; acessos</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                id="kit_logo"
                label="Logótipo / ativos (link)"
                defaultValue={fat.kit_logo ?? ""}
                placeholder="link Drive/Dropbox…"
              />
              <Campo
                id="kit_cores"
                label="Cores"
                defaultValue={fat.kit_cores ?? ""}
                placeholder="ex.: #E8A13C, #15181D"
              />
              <Campo id="kit_fontes" label="Tipografia" defaultValue={fat.kit_fontes ?? ""} />
              <div className="sm:col-span-2">
                <label htmlFor="kit_notas" className="mb-1.5 block text-xs font-bold text-grey">
                  Notas de marca / acessos{" "}
                  <span className="font-normal text-soft">(nunca passwords)</span>
                </label>
                <textarea
                  id="kit_notas"
                  name="kit_notas"
                  rows={2}
                  defaultValue={fat.kit_notas ?? ""}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
                />
              </div>
            </div>
          </div>

          <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink">
            Guardar
          </button>
        </form>
      </section>

      {/* Contactos */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-3 font-display text-lg font-extrabold">Contactos</h2>
        {contactos.length === 0 ? (
          <p className="mb-3 text-sm text-soft">Ainda sem contactos.</p>
        ) : (
          <div className="mb-3">
            {contactos.map((c) => (
              <details key={c.id} className="group border-b border-line/60 last:border-0">
                <summary className="flex cursor-pointer list-none items-center gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {c.nome}
                      {c.departamento && (
                        <span className="ml-2 rounded-full bg-cobalt/10 px-2 py-0.5 text-[11px] font-bold text-cobalt">
                          {DEPARTAMENTOS.find(([k]) => k === c.departamento)?.[1] ?? c.departamento}
                        </span>
                      )}
                      {c.principal && <span className="ml-2 text-xs text-gold-dark">· principal</span>}
                    </p>
                    <p className="truncate text-xs text-grey">
                      {[c.cargo, c.email, c.telefone].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-gold-dark group-open:hidden">
                    editar
                  </span>
                  <span className="shrink-0 text-soft transition group-open:rotate-90">›</span>
                </summary>
                <form action={editarContacto} className="grid gap-2 pb-3 sm:grid-cols-3">
                  <input type="hidden" name="contacto_id" value={c.id} />
                  <input type="hidden" name="cliente_id" value={cliente.id} />
                  <input
                    name="nome"
                    defaultValue={c.nome}
                    required
                    placeholder="Nome *"
                    className="rounded-lg border border-line px-3 py-2 text-sm"
                  />
                  <select
                    name="departamento"
                    defaultValue={c.departamento ?? ""}
                    className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Departamento…</option>
                    {DEPARTAMENTOS.map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    name="cargo"
                    defaultValue={c.cargo ?? ""}
                    placeholder="Cargo (ex.: CEO)"
                    className="rounded-lg border border-line px-3 py-2 text-sm"
                  />
                  <input
                    name="email"
                    type="email"
                    defaultValue={c.email ?? ""}
                    placeholder="Email"
                    className="rounded-lg border border-line px-3 py-2 text-sm"
                  />
                  <input
                    name="telefone"
                    defaultValue={c.telefone ?? ""}
                    placeholder="Telefone (com indicativo)"
                    className="rounded-lg border border-line px-3 py-2 text-sm"
                  />
                  <label className="flex items-center gap-2 text-xs text-grey">
                    <input
                      type="checkbox"
                      name="principal"
                      defaultChecked={c.principal}
                      className="size-4 accent-[#E8A13C]"
                    />
                    principal
                  </label>
                  <div className="flex items-center gap-4 sm:col-span-3">
                    <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink">
                      Guardar
                    </button>
                    <button formAction={apagarContacto} formNoValidate className="text-xs font-bold text-bad">
                      remover
                    </button>
                  </div>
                </form>
              </details>
            ))}
          </div>
        )}
        <form action={adicionarContacto} className="grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="cliente_id" value={cliente.id} />
          <input name="nome" placeholder="Nome *" required className="rounded-lg border border-line px-3 py-2 text-sm" />
          <select name="departamento" className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
            <option value="">Departamento…</option>
            {DEPARTAMENTOS.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
          <input name="cargo" placeholder="Cargo (ex.: CEO)" className="rounded-lg border border-line px-3 py-2 text-sm" />
          <input name="email" type="email" placeholder="Email" className="rounded-lg border border-line px-3 py-2 text-sm" />
          <input name="telefone" placeholder="Telefone (com indicativo, ex.: 351…)" className="rounded-lg border border-line px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-xs text-grey">
            <input type="checkbox" name="principal" className="size-4 accent-[#E8A13C]" /> principal
          </label>
          <button className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream sm:col-span-3">
            + Adicionar contacto
          </button>
        </form>
      </section>

      {/* Atividades */}
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="mb-3 font-display text-lg font-extrabold">Histórico</h2>

        <form action={adicionarAtividade} className="mb-4 space-y-2 rounded-lg bg-cream p-3">
          <input type="hidden" name="cliente_id" value={cliente.id} />
          <div className="flex flex-wrap gap-2">
            <select name="tipo" className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
              {TIPOS.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
            <input
              name="descricao"
              required
              placeholder="O que aconteceu…"
              className="min-w-45 flex-1 rounded-lg border border-line px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              name="followup_em"
              type="date"
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
              aria-label="Data do próximo passo"
            />
            <input
              name="followup_nota"
              placeholder="Próximo passo (opcional)"
              className="min-w-45 flex-1 rounded-lg border border-line px-3 py-2 text-sm"
            />
            <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink">
              Registar
            </button>
          </div>
        </form>

        {atividades.length === 0 ? (
          <p className="text-sm text-soft">Ainda sem registos.</p>
        ) : (
          atividades.map((a) => (
            <div key={a.id} className="border-b border-line/60 py-2.5 last:border-0">
              <p className="font-mono text-[11px] uppercase tracking-wide text-soft">
                {dataCurta(a.data)} · {a.tipo}
              </p>
              <p className="text-sm">{a.descricao}</p>
              {a.followup_em && (
                <p className={`mt-0.5 text-xs ${a.concluido ? "text-soft line-through" : "text-gold-dark"}`}>
                  Próximo passo {dataCurta(a.followup_em)}
                  {a.followup_nota ? `: ${a.followup_nota}` : ""}
                </p>
              )}
            </div>
          ))
        )}
      </section>

      {/* Zona de perigo */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-extrabold">Apagar</h2>
            <p className="text-sm text-soft">
              Remove o cliente e tudo o que lhe está ligado. Não se pode desfazer.
            </p>
          </div>
          <ApagarCliente id={cliente.id} nome={cliente.nome_marca} />
        </div>
      </section>
    </div>
  );
}

function Campo({
  id,
  label,
  ...props
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold text-grey">
        {label}
      </label>
      <input
        id={id}
        name={id}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
        {...props}
      />
    </div>
  );
}
