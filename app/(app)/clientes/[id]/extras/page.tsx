import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { euros, dataCurta } from "@/lib/dominio/metricas";
import { totalOrdem, ordemEntraProducao } from "@/lib/dominio/operacao";
import { EnviarLink } from "@/components/crm/EnviarLink";
import { criarOrdem, mudarEstadoOrdem, apagarOrdem } from "./acoes";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold";
const lab = "mb-1 block text-[11px] font-bold text-grey";

const ESTADO_ROTULO: Record<string, string> = {
  rascunho: "rascunho",
  enviada: "enviada",
  aceite: "aceite",
  recusada: "recusada",
  esclarecimento: "esclarecimento pedido",
  produzida: "produzida",
  faturada: "faturada",
};

type Ordem = {
  id: string;
  titulo: string;
  descricao: string | null;
  origem: string | null;
  impacto: string | null;
  prazo: string | null;
  horas: number | null;
  preco: number | null;
  iva_pct: number;
  estado: string;
  token: string | null;
  decisao_nota: string | null;
  criado_em: string;
};

export default async function ExtrasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome_marca, idioma")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  // Telefone/email vêm dos contactos (o contacto principal), não da ficha.
  const { data: contactos } = await supabase
    .from("contactos")
    .select("telefone, email, principal")
    .eq("cliente_id", id);
  const contacto =
    (contactos ?? []).find((c) => c.principal && (c.telefone || c.email)) ??
    (contactos ?? []).find((c) => c.telefone || c.email) ??
    null;

  const { data: ordensData } = await supabase
    .from("ordens_alteracao")
    .select("id, titulo, descricao, origem, impacto, prazo, horas, preco, iva_pct, estado, token, decisao_nota, criado_em")
    .eq("cliente_id", id)
    .order("criado_em", { ascending: false })
    .then((r) => r, () => ({ data: [] }));
  const ordens = (ordensData ?? []) as Ordem[];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-xs font-bold text-gold-dark">
          ← {cliente.nome_marca}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Ordens de alteração</h1>
        <p className="mt-1 text-sm text-grey">
          Pediu algo fora do âmbito? Gera uma ordem. Só entra em produção depois de o cliente aceitar.
        </p>
      </div>

      {/* Lista */}
      {ordens.length === 0 ? (
        <section className="rounded-xl border border-line bg-white p-5">
          <p className="text-sm text-soft">Ainda não há ordens de alteração para este cliente.</p>
        </section>
      ) : (
        ordens.map((o) => {
          const total = totalOrdem(o.preco, o.iva_pct);
          const emProducao = ordemEntraProducao(o.estado);
          return (
            <section key={o.id} className="rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-extrabold">{o.titulo}</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    o.estado === "aceite" || emProducao
                      ? "bg-good/15 text-good"
                      : o.estado === "recusada"
                        ? "bg-bad/15 text-bad"
                        : o.estado === "esclarecimento"
                          ? "bg-warn/15 text-warn"
                          : "bg-cream text-grey"
                  }`}
                >
                  {ESTADO_ROTULO[o.estado] ?? o.estado}
                </span>
              </div>

              {o.descricao && <p className="mt-1 text-sm text-grey">{o.descricao}</p>}
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-soft">
                {o.origem && <span>origem: {o.origem}</span>}
                {o.impacto && <span>impacto: {o.impacto}</span>}
                {o.prazo && <span>prazo: {dataCurta(o.prazo)}</span>}
                {o.horas != null && <span>{o.horas}h</span>}
              </div>
              <p className="mt-2 text-sm">
                <b>{o.preco != null ? euros(o.preco) : "—"}</b>
                {o.preco != null && (
                  <span className="text-soft"> + IVA {o.iva_pct}% = <b className="text-ink">{euros(total)}</b></span>
                )}
              </p>

              {o.decisao_nota && (
                <p className="mt-2 rounded bg-cream p-2 text-xs text-grey">
                  <b>Cliente:</b> {o.decisao_nota}
                </p>
              )}

              {/* Controlos de estado */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {o.estado === "rascunho" && (
                  <EstadoBtn id={o.id} cid={cliente.id} estado="enviada" cls="border-gold-dark text-gold-dark">
                    Marcar enviada
                  </EstadoBtn>
                )}
                {(o.estado === "enviada" || o.estado === "esclarecimento") && (
                  <>
                    <EstadoBtn id={o.id} cid={cliente.id} estado="aceite" cls="border-good text-good">
                      Aceite (manual)
                    </EstadoBtn>
                    <EstadoBtn id={o.id} cid={cliente.id} estado="recusada" cls="border-bad text-bad">
                      Recusada
                    </EstadoBtn>
                  </>
                )}
                {o.estado === "aceite" && (
                  <EstadoBtn id={o.id} cid={cliente.id} estado="produzida" cls="border-line text-grey">
                    Marcar produzida
                  </EstadoBtn>
                )}
                {o.estado === "produzida" && (
                  <EstadoBtn id={o.id} cid={cliente.id} estado="faturada" cls="border-line text-grey">
                    Marcar faturada
                  </EstadoBtn>
                )}
                <form action={apagarOrdem.bind(null, o.id, cliente.id)}>
                  <button className="rounded-full px-3 py-1 text-[11px] text-bad">apagar</button>
                </form>
              </div>

              {/* Enviar ao cliente */}
              {o.token && (o.estado === "enviada" || o.estado === "esclarecimento") && (
                <div className="mt-3 border-t border-line pt-3">
                  <EnviarLink
                    caminho={`/r/ordem/${o.token}`}
                    assunto={
                      cliente.idioma === "en"
                        ? `Change order — ${o.titulo}`
                        : `Ordem de alteração — ${o.titulo}`
                    }
                    mensagem={
                      cliente.idioma === "en"
                        ? `Hi! Here's the change order for "${o.titulo}". Take a look and confirm:`
                        : `Olá! Aqui está a ordem de alteração para "${o.titulo}". Vê e confirma:`
                    }
                    telefone={contacto?.telefone}
                    email={contacto?.email}
                    clienteId={cliente.id}
                  />
                </div>
              )}
            </section>
          );
        })
      )}

      {/* Criar */}
      <section className="rounded-xl border-2 border-gold/40 bg-gold/5 p-5">
        <h2 className="font-display text-lg font-extrabold">Nova ordem de alteração</h2>
        <form action={criarOrdem} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="cliente_id" value={cliente.id} />
          <div className="sm:col-span-2">
            <label className={lab}>O quê</label>
            <input name="titulo" required placeholder="ex.: 3 posts extra para a campanha de Natal" className={inp} />
          </div>
          <div className="sm:col-span-2">
            <label className={lab}>Descrição</label>
            <textarea name="descricao" rows={2} className={inp} />
          </div>
          <div>
            <label className={lab}>Origem do pedido</label>
            <input name="origem" placeholder="reunião, WhatsApp…" className={inp} />
          </div>
          <div>
            <label className={lab}>Impacto</label>
            <input name="impacto" placeholder="ex.: empurra o plano 1 semana" className={inp} />
          </div>
          <div>
            <label className={lab}>Prazo</label>
            <input name="prazo" type="date" className={inp} />
          </div>
          <div>
            <label className={lab}>Horas</label>
            <input name="horas" type="number" step="0.25" min="0" className={`${inp} tabular-nums`} />
          </div>
          <div>
            <label className={lab}>Preço (€, sem IVA)</label>
            <input name="preco" type="number" step="0.01" min="0" className={`${inp} tabular-nums`} />
          </div>
          <div>
            <label className={lab}>IVA (%)</label>
            <input name="iva_pct" type="number" step="1" min="0" defaultValue={23} className={`${inp} tabular-nums`} />
          </div>
          <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink sm:col-span-2">
            Criar ordem
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
  cls,
  children,
}: {
  id: string;
  cid: string;
  estado: string;
  cls: string;
  children: React.ReactNode;
}) {
  return (
    <form action={mudarEstadoOrdem.bind(null, id, cid, estado)}>
      <button className={`rounded-full border px-3 py-1 text-[11px] font-bold ${cls}`}>{children}</button>
    </form>
  );
}
