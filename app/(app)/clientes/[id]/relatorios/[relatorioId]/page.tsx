import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { mesISO, mesLegivel } from "@/lib/dominio/producao";
import { dataCurta } from "@/lib/dominio/metricas";
import { normalizarEscopo } from "@/lib/dominio/orcamento";
import { EnviarLink } from "@/components/crm/EnviarLink";
import { CopiarPeca } from "@/components/conteudo/CopiarPeca";
import {
  alternarPartilhaRelatorio,
  apagarRelatorio,
  guardarRelatorio,
} from "../acoes";

export const dynamic = "force-dynamic";

export default async function RelatorioPage({
  params,
}: {
  params: Promise<{ id: string; relatorioId: string }>;
}) {
  const { id, relatorioId } = await params;
  const supabase = await criarClienteServidor();

  const [{ data: relatorio }, { data: cliente }] = await Promise.all([
    supabase.from("relatorios").select("*").eq("id", relatorioId).maybeSingle(),
    supabase
      .from("clientes")
      .select("id, nome_marca, setor, metricool_blog_id")
      .eq("id", id)
      .maybeSingle(),
  ]);
  if (!relatorio || !cliente) notFound();

  const [{ data: contacto }, { data: prop }] = await Promise.all([
    supabase
      .from("contactos")
      .select("nome, email, telefone")
      .eq("cliente_id", id)
      .order("principal", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("propostas")
      .select("escopo")
      .eq("cliente_id", id)
      .eq("estado", "aceite")
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: idiomaRow } = await supabase.from("clientes").select("idioma").eq("id", id).maybeSingle();
  const idiomaCliente = idiomaRow?.idioma === "en" ? "en" : "pt";

  // Brief que uso no Claude Code para produzir o relatório.
  const p = prop?.escopo ? normalizarEscopo(prop.escopo).producao : null;
  const contratado = p
    ? [
        p.posts && `${p.posts} posts`,
        p.carrosseis && `${p.carrosseis} carrosséis`,
        p.reels && `${p.reels} reels`,
        p.stories && `${p.stories} histórias`,
      ]
        .filter(Boolean)
        .join(" + ") || "sem produção definida"
    : "sem proposta aceite";
  const brief = [
    `RELATÓRIO MENSAL — ${cliente.nome_marca}`,
    `Mês relatado: ${mesLegivel(relatorio.mes)}`,
    `Metricool (blogId): ${cliente.metricool_blog_id || "[falta — mete o blogId na ficha, em Dados]"}`,
    cliente.setor ? `Setor: ${cliente.setor}` : "",
    `Contratado no mês: ${contratado}`,
    "",
    "O QUE FAZER (Claude Code):",
    "Puxa as métricas deste mês do Metricool (blogId acima) e escreve o relatório na voz do Nº 5 — números antes de adjetivos, cada métrica com período + fonte, sem inventar nada. Compara com o que foi contratado. Devolve em HTML pronto a colar aqui.",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/clientes/${id}`} className="text-xs font-bold text-gold-dark">
            ← {cliente.nome_marca}
          </Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            Relatório · {mesLegivel(relatorio.mes)}
          </h1>
          <p className="text-sm text-grey">
            {relatorio.estado === "enviado" ? "Enviado ao cliente" : "Rascunho"}
            {relatorio.visto_em ? ` · visto a ${dataCurta(relatorio.visto_em)} ✓` : ""}
          </p>
        </div>
        <form action={apagarRelatorio}>
          <input type="hidden" name="id" value={relatorio.id} />
          <input type="hidden" name="cliente_id" value={id} />
          <button className="rounded-full border border-bad px-4 py-2 text-sm font-bold text-bad">
            Apagar
          </button>
        </form>
      </div>

      {/* Brief para produzir no Claude Code */}
      <section className="rounded-xl border-2 border-cobalt/25 bg-cobalt/[0.03] p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="rotulo !text-cobalt">para produzir no Claude Code</p>
            <h2 className="font-display text-lg font-extrabold">Brief do relatório</h2>
          </div>
          <CopiarPeca texto={brief} />
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-cream p-4 font-mono text-xs leading-relaxed text-ink">
          {brief}
        </pre>
      </section>

      {/* Conteúdo */}
      <form action={guardarRelatorio} className="rounded-xl border border-line bg-white p-5">
        <input type="hidden" name="id" value={relatorio.id} />
        <input type="hidden" name="cliente_id" value={id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold text-grey">Título</label>
            <input
              name="titulo"
              defaultValue={relatorio.titulo ?? ""}
              placeholder="ex.: O teu mês em números"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-grey">Mês relatado</label>
            <input
              name="mes"
              type="date"
              defaultValue={relatorio.mes ?? mesISO()}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
          </div>
        </div>
        <label className="mt-3 mb-1 block text-xs font-bold text-grey">
          Conteúdo do relatório (cola aqui o HTML feito no Claude Code)
        </label>
        <textarea
          name="conteudo_html"
          rows={12}
          defaultValue={relatorio.conteudo_html ?? ""}
          placeholder="<div>… o relatório em HTML …</div>"
          className="w-full rounded-lg border border-line px-3 py-2 font-mono text-xs"
        />
        <button className="mt-3 rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink">
          Guardar relatório
        </button>
      </form>

      {/* Pré-visualização */}
      {relatorio.conteudo_html?.trim() && (
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="mb-3 font-display text-lg font-extrabold">Como o cliente vai ver</h2>
          <div
            className="prose-plano overflow-x-auto rounded-lg border border-line p-4"
            dangerouslySetInnerHTML={{ __html: relatorio.conteudo_html }}
          />
        </section>
      )}

      {/* Partilha */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-extrabold">Enviar ao cliente</h2>
            <p className="text-xs text-soft">Uma página com a tua marca, onde ele vê os resultados do mês.</p>
          </div>
          <form action={alternarPartilhaRelatorio}>
            <input type="hidden" name="id" value={relatorio.id} />
            <input type="hidden" name="cliente_id" value={id} />
            <input type="hidden" name="ativar" value={relatorio.partilha_ativa ? "0" : "1"} />
            <button className="rounded-full border-2 border-gold-dark px-4 py-2 text-sm font-bold text-gold-dark">
              {relatorio.partilha_ativa ? "Desligar link" : "Criar link"}
            </button>
          </form>
        </div>
        {relatorio.partilha_ativa && (
          <div className="mt-3">
            <EnviarLink
              caminho={`/r/mes/${relatorio.partilha_token}`}
              assunto={
                idiomaCliente === "en"
                  ? `Your month in numbers · ${cliente.nome_marca}`
                  : `O teu mês em números · ${cliente.nome_marca}`
              }
              mensagem={
                idiomaCliente === "en"
                  ? `Hi${contacto?.nome ? ` ${contacto.nome.split(" ")[0]}` : ""}! 🖐️ We've wrapped up ${mesLegivel(relatorio.mes, "en")} — here's what happened with ${cliente.nome_marca}, in numbers. Take a look:`
                  : `Olá${contacto?.nome ? ` ${contacto.nome.split(" ")[0]}` : ""}! 🖐️ Fechámos ${mesLegivel(relatorio.mes)} e aqui está o que aconteceu com a ${cliente.nome_marca}, em números. Dá uma olhada:`
              }
              telefone={contacto?.telefone}
              email={contacto?.email}
              clienteId={cliente.id}
            />
            <code className="mt-2 block break-all text-xs text-gold-dark">
              /r/mes/{relatorio.partilha_token}
            </code>
          </div>
        )}
      </section>
    </div>
  );
}
