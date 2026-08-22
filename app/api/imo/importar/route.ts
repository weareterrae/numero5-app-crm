/**
 * Importação de dados de mercado — dois atos, nunca um.
 *
 *   POST ?acao=analisar   ficheiro → mapeamento proposto + validação + resumo
 *   POST ?acao=importar   confirmação → grava, versiona, publica
 *
 * A separação é deliberada. Um ficheiro com uma coluna mal mapeada — o
 * preço médio no lugar do mediano — corrompe o benchmark de uma zona, e
 * um benchmark corrompido não grita: só faz as avaliações daquela zona
 * ficarem silenciosamente erradas. Quem carrega tem de ver o que vai
 * acontecer antes de acontecer.
 *
 * Sobre o SIR: não há API, e isso é uma restrição a respeitar. Nada aqui
 * automatiza sessão, explora endpoints ou faz scraping. O utilizador
 * exporta legitimamente da plataforma e carrega o ficheiro.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import {
  proporMapeamento, validar, hashFicheiro,
  type CampoInterno, type LinhaValidada,
} from "@/lib/imo/importar-sir";
import { criarClienteServidor } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** Lê a primeira folha com conteúdo. Aceita xlsx, xls e csv. */
function lerFolha(bytes: ArrayBuffer): { colunas: string[]; linhas: Record<string, unknown>[] } {
  const wb = XLSX.read(bytes, { type: "array", cellDates: false });
  for (const nome of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nome], { defval: "" });
    if (linhas.length) {
      return { colunas: Object.keys(linhas[0]).filter(Boolean), linhas };
    }
  }
  return { colunas: [], linhas: [] };
}

export async function POST(req: NextRequest) {
  // Sessão obrigatória. Importar dados de mercado altera os benchmarks de
  // que dependem todas as avaliações — não é uma ação para estar aberta.
  const sessao = await criarClienteServidor();
  const { data: { user } } = await sessao.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  const acao = req.nextUrl.searchParams.get("acao") ?? "analisar";
  const form = await req.formData();
  const ficheiro = form.get("ficheiro") as File | null;
  const fonteId = String(form.get("fonte") ?? "sir");
  const periodo = String(form.get("periodo") ?? "").trim() || null;

  if (!ficheiro) {
    return NextResponse.json({ erro: "Falta o ficheiro." }, { status: 400 });
  }

  const bytes = await ficheiro.arrayBuffer();
  const hash = await hashFicheiro(bytes);
  const sb = db();

  // ---- O MESMO FICHEIRO NÃO ENTRA DUAS VEZES POR ENGANO ---------------
  // Se for intencional, apaga-se ou marca-se a importação anterior. Tem
  // de ser um ato, não um acidente numa tarde de trabalho repetitivo.
  const { data: jaExiste } = await sb
    .from("imo_importacoes")
    .select("id, periodo, estado, created_at, linhas_validas")
    .eq("fonte_id", fonteId).eq("ficheiro_hash", hash)
    .neq("estado", "REJEITADO")
    .maybeSingle();

  if (jaExiste && acao === "importar") {
    return NextResponse.json({
      erro: "duplicado",
      mensagem: `Este ficheiro já foi importado em ${new Date(jaExiste.created_at).toLocaleDateString("pt-PT")} ` +
        `(${jaExiste.linhas_validas} linhas, estado ${jaExiste.estado}). ` +
        "Para reprocessar, remove primeiro essa importação.",
      importacao_anterior: jaExiste,
    }, { status: 409 });
  }

  const { colunas, linhas } = lerFolha(bytes);
  if (!linhas.length) {
    return NextResponse.json({ erro: "O ficheiro não tem linhas legíveis." }, { status: 400 });
  }

  // Mapeamento: o que o utilizador escolheu manda sobre a proposta.
  const proposta = proporMapeamento(colunas);
  const manual = form.get("mapeamento");
  const mapeamento: Partial<Record<CampoInterno, string>> = manual
    ? { ...proposta.mapeamento, ...JSON.parse(String(manual)) }
    : proposta.mapeamento;

  const { linhas: validadas, resumo } = validar(linhas, mapeamento);

  // ---- ATO 1: mostrar o que vai acontecer -----------------------------
  if (acao === "analisar") {
    return NextResponse.json({
      ficheiro: ficheiro.name,
      hash,
      ja_importado: jaExiste ?? null,
      colunas,
      mapeamento,
      por_mapear: proposta.porMapear,
      ambiguas: proposta.ambiguas,
      resumo,
      // Amostra pequena de cada tipo: quem confirma precisa de ver
      // exemplos, não de percorrer mil linhas.
      exemplos: {
        validas: validadas.filter((l) => l.estado === "VALIDA").slice(0, 5),
        avisos: validadas.filter((l) => l.estado === "AVISO").slice(0, 5),
        rejeitadas: validadas.filter((l) => l.estado === "REJEITADA").slice(0, 10),
      },
    });
  }

  // ---- ATO 2: gravar ---------------------------------------------------
  if (resumo.validas + resumo.avisos === 0) {
    return NextResponse.json({
      erro: "nada_a_importar",
      mensagem: "Nenhuma linha passou a validação. Verifica o mapeamento das colunas.",
      resumo,
    }, { status: 400 });
  }

  const { data: imp, error: eImp } = await sb.from("imo_importacoes").insert({
    fonte_id: fonteId,
    periodo,
    ficheiro_nome: ficheiro.name,
    ficheiro_hash: hash,
    linhas_total: resumo.total,
    linhas_validas: resumo.validas,
    linhas_avisos: resumo.avisos,
    linhas_rejeitadas: resumo.rejeitadas,
    mapeamento,
    estado: "VALIDADO",
  }).select("id").single();

  if (eImp) return NextResponse.json({ erro: eImp.message }, { status: 500 });

  // Guarda linha a linha, incluindo as rejeitadas COM o motivo. Sem isto,
  // «15 rejeitadas» é informação inútil: ninguém sabe o que corrigir.
  const paraGravar = validadas.map((l: LinhaValidada) => ({
    importacao_id: imp.id,
    numero_linha: l.numero,
    bruto: l.bruto,
    normalizado: l.normalizado,
    estado: l.estado,
    motivo: l.motivo ?? null,
  }));
  for (let i = 0; i < paraGravar.length; i += 500) {
    await sb.from("imo_importacao_linhas").insert(paraGravar.slice(i, i + 500));
  }

  // ---- benchmarks ------------------------------------------------------
  let gravados = 0, semGeografia = 0;
  const geoCache = new Map<string, string | null>();

  for (const l of validadas) {
    if (!l.normalizado) continue;
    const n = l.normalizado as Record<string, any>;

    const chaveGeo = `${n.concelho}|${n.zona}`;
    let geoId = geoCache.get(chaveGeo);
    if (geoId === undefined) {
      const { data } = await sb.rpc("imo_geo_por_nome", {
        p_zona: n.zona, p_concelho: n.concelho,
      });
      geoId = (data as string | null) ?? null;
      geoCache.set(chaveGeo, geoId);
    }
    if (!geoId) { semGeografia++; continue; }

    const { error } = await sb.from("imo_benchmarks").upsert({
      fonte_id: fonteId,
      importacao_id: imp.id,
      geografia_id: geoId,
      // Vazio = todos. Nunca nulo: a unicidade do benchmark depende disso.
      tipo_imovel: n.tipo_imovel ?? "",
      tipologia: n.tipologia ?? "",
      periodo: n.periodo,
      periodo_fim: n.periodo_fim,
      eur_m2_mediano: n.eur_m2_mediano,
      eur_m2_medio: n.eur_m2_medio,
      eur_m2_p25: n.eur_m2_p25,
      eur_m2_p75: n.eur_m2_p75,
      preco_mediano: n.preco_mediano,
      n_transacoes: n.n_transacoes,
      desconto_medio: n.desconto_medio,
      tempo_absorcao_dias: n.tempo_absorcao_dias,
      dispersao: n.dispersao,
    }, { onConflict: "fonte_id,geografia_id,tipo_imovel,tipologia,periodo" });
    if (!error) gravados++;
  }

  // Uma zona que o ficheiro traz e a nossa geografia não conhece não é um
  // erro do ficheiro — é uma lacuna nossa. Fica na fila de qualidade para
  // alguém a acrescentar, em vez de se perder.
  if (semGeografia) {
    await sb.from("imo_problemas_dados").insert({
      tipo: "geografia_desconhecida",
      severidade: "aviso",
      tabela: "imo_importacoes",
      registo_id: imp.id,
      detalhe: {
        linhas: semGeografia,
        nota: "Zonas do ficheiro que não existem na hierarquia geográfica. " +
              "Acrescentar as que fizerem sentido e reimportar.",
      },
    });
  }

  await sb.from("imo_importacoes")
    .update({ estado: "PUBLICADO", publicado_em: new Date().toISOString() })
    .eq("id", imp.id);

  return NextResponse.json({
    importacao_id: imp.id,
    resumo,
    benchmarks_gravados: gravados,
    linhas_sem_geografia: semGeografia,
    estado: "PUBLICADO",
  });
}
