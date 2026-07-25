import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { mesISO, mesLegivel } from "@/lib/dominio/producao";
import { dataCurta } from "@/lib/dominio/metricas";
import { EnviarLink } from "@/components/crm/EnviarLink";
import {
  alternarPartilhaPlano,
  apagarPlano,
  guardarPlano,
} from "../acoes";

export const dynamic = "force-dynamic";

const ESTADO_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado — à espera do cliente",
  aprovado: "✓ Aprovado pelo cliente",
  alteracoes: "Cliente pediu alterações",
  recusado: "Recusado",
};

export default async function PlanoPage({
  params,
}: {
  params: Promise<{ id: string; planoId: string }>;
}) {
  const { id, planoId } = await params;
  const supabase = await criarClienteServidor();

  const [{ data: plano }, { data: cliente }] = await Promise.all([
    supabase.from("planos").select("*").eq("id", planoId).maybeSingle(),
    supabase.from("clientes").select("id, nome_marca").eq("id", id).maybeSingle(),
  ]);
  if (!plano || !cliente) notFound();

  const { data: contacto } = await supabase
    .from("contactos")
    .select("nome, email, telefone")
    .eq("cliente_id", id)
    .order("principal", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: idiomaRow } = await supabase.from("clientes").select("idioma").eq("id", id).maybeSingle();
  const idiomaCliente = idiomaRow?.idioma === "en" ? "en" : "pt";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/clientes/${id}`} className="text-xs font-bold text-gold-dark">
            ← {cliente.nome_marca}
          </Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            Plano · {mesLegivel(plano.mes)}
          </h1>
          <p className="text-sm text-grey">{ESTADO_LABEL[plano.estado] ?? plano.estado}</p>
        </div>
        <form action={apagarPlano}>
          <input type="hidden" name="id" value={plano.id} />
          <input type="hidden" name="cliente_id" value={id} />
          <button className="rounded-full border border-bad px-4 py-2 text-sm font-bold text-bad">
            Apagar
          </button>
        </form>
      </div>

      {/* Resposta do cliente */}
      {(plano.estado === "aprovado" || plano.estado === "recusado" || plano.estado === "alteracoes") && (
        <div
          className={`rounded-xl border-2 p-4 ${
            plano.estado === "aprovado" ? "border-good bg-good/5" : "border-gold bg-gold/5"
          }`}
        >
          <p className="text-sm font-bold">
            {plano.estado === "aprovado"
              ? "✓ O cliente aprovou este plano 🖐️"
              : plano.estado === "recusado"
                ? "O cliente recusou o plano"
                : "O cliente pediu alterações"}
            {plano.decidido_em ? ` · ${dataCurta(plano.decidido_em)}` : ""}
          </p>
          {plano.nota_cliente && <p className="mt-1 text-sm text-grey">Disse: «{plano.nota_cliente}»</p>}
        </div>
      )}

      {/* Conteúdo */}
      <form action={guardarPlano} className="rounded-xl border border-line bg-white p-5">
        <input type="hidden" name="id" value={plano.id} />
        <input type="hidden" name="cliente_id" value={id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold text-grey">Título</label>
            <input
              name="titulo"
              defaultValue={plano.titulo ?? ""}
              placeholder="ex.: Plano de publicações"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-grey">Mês</label>
            <input
              name="mes"
              type="date"
              defaultValue={plano.mes ?? mesISO()}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
          </div>
        </div>
        <label className="mt-3 mb-1 block text-xs font-bold text-grey">
          Conteúdo do plano (cola aqui o HTML feito no Claude Code)
        </label>
        <textarea
          name="conteudo_html"
          rows={12}
          defaultValue={plano.conteudo_html ?? ""}
          placeholder="<div>… o plano em HTML …</div>"
          className="w-full rounded-lg border border-line px-3 py-2 font-mono text-xs"
        />
        <button className="mt-3 rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink">
          Guardar plano
        </button>
      </form>

      {/* Pré-visualização */}
      {plano.conteudo_html?.trim() && (
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-3 font-display text-lg font-extrabold">Como o cliente vai ver</h2>
          <div
            className="prose-plano overflow-x-auto rounded-lg border border-line p-4"
            dangerouslySetInnerHTML={{ __html: plano.conteudo_html }}
          />
        </section>
      )}

      {/* Partilha */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-extrabold">Enviar ao cliente</h2>
            <p className="text-xs text-soft">
              Uma página com a tua marca, onde ele aprova, pede alterações ou recusa.
            </p>
          </div>
          <form action={alternarPartilhaPlano}>
            <input type="hidden" name="id" value={plano.id} />
            <input type="hidden" name="cliente_id" value={id} />
            <input type="hidden" name="ativar" value={plano.partilha_ativa ? "0" : "1"} />
            <button className="rounded-full border-2 border-gold-dark px-4 py-2 text-sm font-bold text-gold-dark">
              {plano.partilha_ativa ? "Desligar link" : "Criar link"}
            </button>
          </form>
        </div>
        {plano.partilha_ativa && (
          <div className="mt-3">
            <EnviarLink
              caminho={`/r/plano/${plano.partilha_token}`}
              assunto={
                idiomaCliente === "en"
                  ? `${mesLegivel(plano.mes, "en")} plan · ${cliente.nome_marca}`
                  : `Plano de ${mesLegivel(plano.mes)} · ${cliente.nome_marca}`
              }
              mensagem={
                idiomaCliente === "en"
                  ? `Hi${contacto?.nome ? ` ${contacto.nome.split(" ")[0]}` : ""}! 🖐️ Here's the ${mesLegivel(plano.mes, "en")} publishing plan for ${cliente.nome_marca}. Take a look and let us know if it's all good or what you'd like to adjust — you have 5 days:`
                  : `Olá${contacto?.nome ? ` ${contacto.nome.split(" ")[0]}` : ""}! 🖐️ Aqui está o plano de publicações de ${mesLegivel(plano.mes)} para o ${cliente.nome_marca}. Dá uma olhada e diz-nos se está tudo bem ou o que queres ajustar — tens até 5 dias:`
              }
              telefone={contacto?.telefone}
              email={contacto?.email}
              clienteId={cliente.id}
            />
            <code className="mt-2 block break-all text-xs text-gold-dark">
              /r/plano/{plano.partilha_token}
            </code>
          </div>
        )}
      </section>
    </div>
  );
}
