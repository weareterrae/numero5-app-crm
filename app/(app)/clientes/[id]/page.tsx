import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DEPARTAMENTOS,
  listarAtividades,
  listarContactos,
  obterCliente,
  obterIntake,
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
} from "../acoes";
import { criarDiagnostico } from "@/app/(app)/diagnosticos/acoes";
import { criarProposta } from "@/app/(app)/propostas/acoes";
import { criarPlano } from "@/app/(app)/clientes/[id]/planos/acoes";
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
  const [atividades, contactos, intake, diagRes, propRes, planosRes] = await Promise.all([
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
      .select("id, mes, titulo, estado")
      .eq("cliente_id", id)
      .order("mes", { ascending: false }),
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
  }[];
  const diagnosticos = (diagRes.data ?? []) as {
    id: string;
    versao: number;
    estado: string;
    site_score: number | null;
    created_at: string;
  }[];
  const hoje = new Date().toISOString().slice(0, 10);
  const porFazer = atividades.filter((a) => a.followup_em && !a.concluido);

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
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <Link
              href={`/clientes/${cliente.id}/conteudo`}
              className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-ink"
            >
              ✍️ Conteúdo do mês
            </Link>
            <Link
              href={`/clientes/${cliente.id}/producao`}
              className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream"
            >
              📋 Produção
            </Link>
          </div>
          <MudarEstado
            clienteId={cliente.id}
            estadoAtual={cliente.estado}
            estados={ESTADOS.map((e) => [e, ESTADO_LABEL[e as Estado]])}
          />
        </div>
      </div>

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

      {/* Link de diagnóstico para o cliente preencher */}
      <LinkDiagnostico token={intake.intake_token} submetidoEm={intake.intake_submetido_em} />

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
        {planos.length === 0 ? (
          <p className="text-sm text-soft">
            Ainda sem planos. Cria um, cola o HTML feito no Claude Code e partilha com o cliente.
          </p>
        ) : (
          planos.map((pl) => (
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
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 border-b border-line/60 py-2 text-sm last:border-0"
              >
                <div className="min-w-0">
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
                <form action={apagarContacto}>
                  <input type="hidden" name="contacto_id" value={c.id} />
                  <input type="hidden" name="cliente_id" value={cliente.id} />
                  <button className="text-xs text-bad">remover</button>
                </form>
              </div>
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
