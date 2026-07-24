import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Editor } from "@/components/diagnostico/Editor";
import { alternarPartilha, concluirDiagnostico } from "../acoes";
import { criarPropostaDeDiagnostico } from "@/app/(app)/propostas/acoes";
import { dataCurta } from "@/lib/dominio/metricas";
import { descreverEscopo, normalizarEscopo } from "@/lib/dominio/orcamento";
import { rotuloFaixa } from "@/lib/dominio/intake";
import { BriefCliente } from "@/components/diagnostico/BriefCliente";
import { EnviarLink } from "@/components/crm/EnviarLink";

export const dynamic = "force-dynamic";

export default async function DiagnosticoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: d } = await supabase
    .from("diagnosticos")
    .select("*, clientes(id, nome_marca, setor)")
    .eq("id", id)
    .maybeSingle();
  if (!d) notFound();

  const cliente = (Array.isArray(d.clientes) ? d.clientes[0] : d.clientes) as {
    id: string;
    nome_marca: string;
    setor: string | null;
  } | null;

  const { data: contacto } = cliente
    ? await supabase
        .from("contactos")
        .select("nome, email, telefone")
        .eq("cliente_id", cliente.id)
        .order("principal", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const doCliente = d.origem === "cliente";
  const pedido = normalizarEscopo(d.pedido ?? {});
  const pedidoLinhas = descreverEscopo(pedido);
  const faixaPedido = rotuloFaixa((d.pedido as { orcamento?: string } | null)?.orcamento);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {cliente && (
            <Link href={`/clientes/${cliente.id}`} className="text-xs font-bold text-gold-dark">
              ← {cliente.nome_marca}
            </Link>
          )}
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            Diagnóstico <span className="text-soft">v{d.versao}</span>
          </h1>
          <p className="text-sm text-grey">
            {d.estado === "concluido" ? "Concluído" : "Rascunho"} · criado a {dataCurta(d.created_at)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={criarPropostaDeDiagnostico}>
            <input type="hidden" name="diagnostico_id" value={d.id} />
            <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink">
              Criar proposta 🖐️
            </button>
          </form>
          {d.estado !== "concluido" && (
            <form action={concluirDiagnostico}>
              <input type="hidden" name="id" value={d.id} />
              <button className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream">
                Dar por concluído
              </button>
            </form>
          )}
          <form action={alternarPartilha}>
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="ativar" value={d.partilha_ativa ? "0" : "1"} />
            <button className="rounded-full border-2 border-gold-dark px-4 py-2 text-sm font-bold text-gold-dark">
              {d.partilha_ativa ? "Desligar partilha" : "Criar link para o cliente"}
            </button>
          </form>
        </div>
      </div>

      {/* O que o cliente disse — quando foi ele a preencher */}
      {doCliente && (
        <div className="rounded-xl border-2 border-cobalt/25 bg-cobalt/[0.03] p-5">
          <p className="rotulo !text-cobalt">preenchido pelo cliente</p>
          <h2 className="font-display text-lg font-extrabold">O que o cliente nos disse</h2>
          {pedidoLinhas.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-grey">
              {pedidoLinhas.map((l, i) => (
                <li key={i}>· {l}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-soft">
              Não indicou desejos específicos — o volume fica ao teu critério.
            </p>
          )}
          {faixaPedido && <p className="mt-2 text-xs text-cobalt">Orçamento que indicou: {faixaPedido}</p>}
          <p className="mt-3 text-xs text-soft">
            Trabalha o diagnóstico com a tua visão (avalia as redes, ajusta os objetivos) e depois
            carrega em <b>Criar proposta</b> — o pedido dele segue para o duplo investimento.
          </p>
        </div>
      )}

      {/* O brief profundo que o cliente preencheu */}
      <BriefCliente brief={d.brief} />

      {d.partilha_ativa && (
        <div className="rounded-xl border border-gold bg-gold/5 p-4">
          <p className="mb-2 text-sm font-bold">Enviar o relatório ao cliente:</p>
          <EnviarLink
            caminho={`/r/relatorio/${d.partilha_token}`}
            assunto={`O teu Raio-X · ${cliente?.nome_marca ?? "Nº 5"}`}
            mensagem={`Olá${contacto?.nome ? ` ${contacto.nome.split(" ")[0]}` : ""}! 🖐️ Preparámos um Raio-X à presença digital do ${cliente?.nome_marca ?? "teu negócio"}. Vê aqui o que encontrámos e onde podemos ajudar:`}
            telefone={contacto?.telefone}
            email={contacto?.email}
            clienteId={cliente?.id}
          />
          <p className="mt-2 text-xs text-soft">
            Abre o WhatsApp/email com o texto pronto — só tens de rever e enviar.
          </p>
        </div>
      )}

      <Editor
        id={d.id}
        inicial={{
          site_url: d.site_url,
          site_score: d.site_score,
          site_resultado: d.site_resultado ?? [],
          redes_scorecard: d.redes_scorecard ?? [],
          estado_atual: d.estado_atual ?? {},
          objetivos: d.objetivos ?? { selecionados: [], texto_livre: "" },
          recomendacoes: d.recomendacoes ?? [],
        }}
      />
    </div>
  );
}
