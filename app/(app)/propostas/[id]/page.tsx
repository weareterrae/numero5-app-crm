import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { EditorTexto } from "@/components/propostas/EditorTexto";
import { EstadoProposta } from "@/components/propostas/EstadoProposta";
import { alternarPartilhaProposta, guardarProposta } from "../acoes";
import { euros } from "@/lib/dominio/metricas";
import { OBJETIVOS } from "@/lib/dominio/diagnostico/recomendacoes";
import type { DossierProposta } from "@/lib/ia/prompts/proposta";
import { idiomaDe } from "@/lib/dominio/intake";
import { Configurador } from "@/components/propostas/Configurador";
import { DescontoProposta, type Desconto } from "@/components/propostas/DescontoProposta";
import { CasosPicker, type Caso } from "@/components/propostas/CasosPicker";
import { calcular, descreverEscopo, normalizarEscopo, type Preco } from "@/lib/dominio/orcamento";
import { rotuloFaixa } from "@/lib/dominio/intake";
import { EnviarLink } from "@/components/crm/EnviarLink";

export const dynamic = "force-dynamic";

export default async function PropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: p } = await supabase
    .from("propostas")
    .select(
      "*, clientes(id, nome_marca, setor, website, notas_gerais), pacotes(id, chave, nome, tagline)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const cliente = um(p.clientes) as {
    id: string;
    nome_marca: string;
    setor: string | null;
    website: string | null;
    notas_gerais: string | null;
  } | null;
  const pacote = um(p.pacotes) as { id: string; chave: string; nome: string; tagline: string | null } | null;

  const [{ data: pacotes }, { data: precos }, casosRes] = await Promise.all([
    supabase.from("pacotes").select("id, chave, nome, tagline").eq("ativo", true).order("ordem"),
    supabase
      .from("precos_unitarios")
      .select("chave, rotulo, tipo, unidade, preco, minutos, custo_interno, tempo_planeado_min")
      .neq("estado", "inativo")
      .order("ordem"),
    supabase
      .from("casos")
      .select("chave, marca, setor, o_que, resultado, imagem_url")
      .eq("ativo", true)
      .order("ordem"),
  ]);
  const casos = (casosRes.data ?? []) as Caso[];
  const casosSel = (p.casos ?? []) as string[];

  const { data: contacto } = cliente
    ? await supabase
        .from("contactos")
        .select("nome, email, telefone")
        .eq("cliente_id", cliente.id)
        .order("principal", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  // Dossiê para a IA — só dados reais, vindos do diagnóstico ligado.
  const { data: diag } = p.diagnostico_id
    ? await supabase
        .from("diagnosticos")
        .select("site_url, site_score, site_resultado, redes_scorecard, estado_atual, objetivos, recomendacoes, brief")
        .eq("id", p.diagnostico_id)
        .maybeSingle()
    : { data: null };

  const { data: idiomaRow } = cliente
    ? await supabase.from("clientes").select("idioma").eq("id", cliente.id).maybeSingle()
    : { data: null };
  const idiomaCliente = idiomaDe(idiomaRow?.idioma);

  // Configurações comerciais (passo, valor-alvo/hora, limiares do semáforo).
  const { data: cfgRows } = await supabase
    .from("configuracoes")
    .select("chave, valor")
    .in("chave", [
      "passo_arredondamento",
      "valor_hora_alvo",
      "limiar_amarelo_hora",
      "limiar_vermelho_hora",
      "limiar_amarelo_margem",
      "limiar_vermelho_margem",
    ]);
  const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.chave, Number(r.valor)]));
  const passo = cfg.passo_arredondamento || 50;
  const valorHoraAlvo = cfg.valor_hora_alvo || 65;
  const limiares = {
    valorHoraAlvo,
    amareloHora: cfg.limiar_amarelo_hora || 45,
    vermelhoHora: cfg.limiar_vermelho_hora || 30,
    amareloMargem: (cfg.limiar_amarelo_margem || 40) / 100,
    vermelhoMargem: (cfg.limiar_vermelho_margem || 25) / 100,
  };

  // Custos externos por serviço (tolerante: coluna só existe após 0024).
  let precosComExterno = (precos ?? []) as Preco[];
  const { data: extRows } = await supabase
    .from("precos_unitarios")
    .select("chave, custo_externo")
    .neq("estado", "inativo");
  if (extRows) {
    const externos = new Map(extRows.map((r) => [r.chave, r.custo_externo]));
    precosComExterno = precosComExterno.map((p) => ({
      ...p,
      custo_externo: externos.get(p.chave) ?? null,
    }));
  }

  // Descontos ativos (tolerante: vazio se a migração 0023 não correu).
  const { data: descontosData } = cliente
    ? await supabase.from("descontos").select("*").eq("cliente_id", cliente.id).eq("estado", "ativo")
    : { data: null };
  const descontos = (descontosData ?? []) as Desconto[];

  const objetivosSel: string[] = diag?.objetivos?.selecionados ?? [];
  const dossier: DossierProposta = {
    cliente: cliente?.nome_marca ?? "Cliente",
    setor: cliente?.setor ?? null,
    pacote: { nome: pacote?.nome ?? "—", tagline: pacote?.tagline ?? null },
    ambito: (p.ambito ?? []) as string[],
    site: diag
      ? { url: diag.site_url, nota: diag.site_score, resultados: diag.site_resultado ?? [] }
      : null,
    redes: (diag?.redes_scorecard ?? []).map((r: { nome: string; notas: (number | null)[] }) => {
      const dadas = (r.notas ?? []).filter((x): x is number => x !== null);
      return {
        nome: r.nome,
        nota: dadas.length ? Math.round((dadas.reduce((a, b) => a + b, 0) / (dadas.length * 2)) * 10) : null,
      };
    }),
    estadoAtual: diag?.estado_atual ?? {},
    objetivos: {
      rotulos: objetivosSel.map((o) => OBJETIVOS.find(([k]) => k === o)?.[1] ?? o),
      texto_livre: diag?.objetivos?.texto_livre ?? "",
    },
    recomendacoes: diag?.recomendacoes ?? [],
    // O brief profundo que o cliente preencheu — o que ele sonha para a marca.
    brief: diag?.brief ?? null,
    idioma: idiomaCliente,
    // O que o Sandro já sabe do negócio — é daqui que sai a originalidade.
    notas: cliente?.notas_gerais ?? null,
  };

  // O pedido do cliente (para o duplo investimento).
  const escopoPedido = normalizarEscopo(p.escopo_pedido ?? {});
  const orcPedido = calcular(escopoPedido, (precos ?? []) as Preco[]);
  const pedidoTemConteudo =
    descreverEscopo(escopoPedido).length > 0 || orcPedido.totalMensal > 0 || orcPedido.totalSetup > 0;
  const faixaPedido = rotuloFaixa(
    (p.escopo_pedido as { orcamento?: string } | null)?.orcamento,
  );

  // Coerência do financeiro — para não partilhar uma proposta com números incoerentes.
  const nossoMensal = Number(p.avenca_valor) || 0;
  const nossoSetup = Number(p.setup_valor) || 0;
  const avisosFinanceiros: string[] = [];
  if (orcPedido.totalMensal > 0 && nossoMensal === 0)
    avisosFinanceiros.push(
      "O cliente pediu produção mensal, mas ainda não definiste uma avença. Define-a no configurador (em cima) antes de partilhar.",
    );
  else if (p.mostrar_comparacao && nossoMensal === 0)
    avisosFinanceiros.push(
      "A comparação «pediste vs. recomendamos» está ligada, mas sem avença nossa não há o que comparar — o cliente vê só o valor único.",
    );
  if (nossoMensal === 0 && nossoSetup === 0)
    avisosFinanceiros.push(
      "Esta proposta ainda não tem valores (nem setup nem avença) — o bloco de investimento vai aparecer vazio.",
    );

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
            Proposta <span className="text-soft">v{p.versao}</span>
          </h1>
          {!p.diagnostico_id && (
            <p className="mt-1 text-sm text-warn">
              Sem diagnóstico ligado — a IA vai ter pouco por onde se guiar.
            </p>
          )}
        </div>
        <EstadoProposta id={p.id} estado={p.estado} />
      </div>

      {avisosFinanceiros.length > 0 && (
        <div className="rounded-xl border-2 border-warn bg-warn/10 p-4">
          <p className="mb-1 text-sm font-bold text-warn">
            ⚠️ Antes de partilhar — verifica o investimento
          </p>
          <ul className="space-y-1 text-sm text-grey">
            {avisosFinanceiros.map((a, i) => (
              <li key={i}>· {a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* A resposta do cliente, quando decidiu pela página */}
      {(p.estado === "aceite" || p.estado === "recusada") && (
        <div
          className={`rounded-xl border-2 p-4 ${
            p.estado === "aceite" ? "border-good bg-good/5" : "border-line bg-white"
          }`}
        >
          <p className="text-sm font-bold">
            {p.estado === "aceite" ? "✓ O cliente aceitou a proposta 🖐️" : "O cliente não avançou"}
          </p>
          {p.nota_decisao ? (
            <p className="mt-1 text-sm text-grey">Disse: «{p.nota_decisao}»</p>
          ) : (
            <p className="mt-1 text-xs text-soft">Sem comentário.</p>
          )}
        </div>
      )}

      {pedidoTemConteudo && (
        <section className="rounded-xl border border-cobalt/25 bg-cobalt/[0.03] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="rotulo !text-cobalt">o que o cliente pediu</p>
              <h2 className="font-display text-lg font-extrabold">O pedido dele</h2>
            </div>
            <div className="text-right">
              {orcPedido.totalMensal > 0 && (
                <p className="font-mono text-sm">
                  <b className="numero">{euros(orcPedido.totalMensal)}</b>/mês
                </p>
              )}
              {orcPedido.totalSetup > 0 && (
                <p className="font-mono text-xs text-grey">setup {euros(orcPedido.totalSetup)}</p>
              )}
            </div>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-grey">
            {descreverEscopo(escopoPedido).map((l, i) => (
              <li key={i}>· {l}</li>
            ))}
          </ul>
          {faixaPedido && (
            <p className="mt-2 text-xs text-cobalt">Orçamento que indicou: {faixaPedido}</p>
          )}
          <p className="mt-3 text-xs text-soft">
            Abaixo montas a <b>nossa recomendação</b> — muitas vezes mais focada e mais barata. Os
            dois valores aparecem lado a lado na proposta do cliente.
          </p>
        </section>
      )}

      <Configurador
        propostaId={p.id}
        inicial={p.escopo ?? {}}
        precos={precosComExterno}
        passo={passo}
        valorHoraAlvo={valorHoraAlvo}
        limiares={limiares}
      />

      {cliente && (
        <DescontoProposta
          clienteId={cliente.id}
          propostaId={p.id}
          avencaValor={p.avenca_valor}
          setupValor={p.setup_valor}
          descontos={descontos}
        />
      )}

      {/* Pacote, âmbito e investimento */}
      <form action={guardarProposta} className="rounded-xl border border-line bg-white p-5">
        <input type="hidden" name="id" value={p.id} />
        <h2 className="mb-3 font-display text-lg font-extrabold">Pacote e apresentação</h2>

        <label className="mb-1 block text-xs font-bold text-grey">Pacote</label>
        <select
          name="pacote_id"
          defaultValue={pacote?.id ?? ""}
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
        >
          {(pacotes ?? []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome} — {x.tagline}
            </option>
          ))}
        </select>

        <p className="mt-2 text-xs text-soft">
          Os valores vêm do configurador em cima — é lá, num só sítio, que se define o que se
          propõe. Aqui ficam só o pacote e as notas que aparecem por baixo do preço.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold text-grey">Nota do setup</label>
            <input
              name="setup_nota"
              defaultValue={p.setup_nota ?? ""}
              placeholder="ex.: faseável em 2×"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-grey">Nota da avença</label>
            <input
              name="avenca_nota"
              defaultValue={p.avenca_nota ?? ""}
              placeholder="ex.: 8 publicações + 2 reels"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
          </div>
        </div>

        {pedidoTemConteudo && (
          <label className="mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-cream p-3 text-sm">
            <input
              type="checkbox"
              name="mostrar_comparacao"
              defaultChecked={!!p.mostrar_comparacao}
              className="mt-0.5 size-4 shrink-0 accent-[#E8A13C]"
            />
            <span>
              <b>Mostrar ao cliente a comparação com o que ele pediu</b>
              <span className="block text-xs text-soft">
                Desligado (recomendado): a proposta mostra só o teu valor único. Ligado: aparece
                «o que pediste» ao lado, para provares que recomendas menos.
              </span>
            </span>
          </label>
        )}

        <button className="mt-4 rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink">
          Guardar pacote
        </button>
      </form>

      <EditorTexto id={p.id} inicial={p.conteudo?.abertura ? p.conteudo : null} dossier={dossier} />

      <CasosPicker
        propostaId={p.id}
        casos={casos}
        selecionadosIniciais={casosSel}
        setorCliente={cliente?.setor ?? null}
      />

      {/* Partilha */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-extrabold">Enviar ao cliente</h2>
            <p className="text-xs text-soft">
              Uma página com a marca, que ele abre sem entrar na app. Imprime para PDF a partir daí.
            </p>
          </div>
          <div className="flex gap-2">
            {p.partilha_ativa && (
              <Link
                href={`/r/proposta/${p.partilha_token}`}
                target="_blank"
                className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream"
              >
                Pré-visualizar
              </Link>
            )}
            <form action={alternarPartilhaProposta}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="ativar" value={p.partilha_ativa ? "0" : "1"} />
              <button className="rounded-full border-2 border-gold-dark px-4 py-2 text-sm font-bold text-gold-dark">
                {p.partilha_ativa ? "Desligar link" : "Criar link"}
              </button>
            </form>
          </div>
        </div>
        {p.partilha_ativa && (
          <div className="mt-3">
            <EnviarLink
              caminho={`/r/proposta/${p.partilha_token}`}
              assunto={
                idiomaCliente === "en"
                  ? `Your proposal · ${cliente?.nome_marca ?? "Nº 5"}`
                  : `A tua proposta · ${cliente?.nome_marca ?? "Nº 5"}`
              }
              mensagem={
                idiomaCliente === "en"
                  ? `Hi${contacto?.nome ? ` ${contacto.nome.split(" ")[0]}` : ""}! 🖐️ Here's the proposal we've put together for ${cliente?.nome_marca ?? "your business"}. Take a look — at the bottom you can accept or tell us what you think:`
                  : `Olá${contacto?.nome ? ` ${contacto.nome.split(" ")[0]}` : ""}! 🖐️ Aqui está a proposta que preparámos para a ${cliente?.nome_marca ?? "tua marca"}. Podes vê-la, e ao fundo aceitas ou dizes-nos o que achas:`
              }
              telefone={contacto?.telefone}
              email={contacto?.email}
              clienteId={cliente?.id}
            />
            <code className="mt-2 block break-all text-xs text-gold-dark">
              /r/proposta/{p.partilha_token}
            </code>
          </div>
        )}
        <p className="mt-3 font-mono text-xs text-grey">
          {p.setup_valor ? `Setup ${euros(p.setup_valor)}` : ""}
          {p.setup_valor && p.avenca_valor ? " · " : ""}
          {p.avenca_valor ? `${euros(p.avenca_valor)}/mês` : ""}
        </p>
      </section>
    </div>
  );
}
