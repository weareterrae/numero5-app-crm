/**
 * Vendas reais da Terrae — registar e listar.
 *
 *   GET                    as últimas, para a lista
 *   POST                   valida e mostra o que ia gravar (não grava)
 *   POST ?confirmar=1      grava
 *
 * DOIS ATOS, NUNCA UM — como na importação de benchmarks, e pela mesma
 * razão: uma venda real ancora o motor com até 50% do peso. Um zero a
 * mais desloca as avaliações daquela zona durante meses sem dar erro,
 * porque o valor sai mais alto e continua a parecer plausível. Quem
 * regista tem de ver o €/m² antes de gravar.
 *
 * PORQUE É QUE ISTO IMPORTA DUAS VEZES
 *
 * Além de alimentar o motor, a cláusula 3 da ficha de subscrição do SIR
 * obriga a Terrae a facultar mensalmente à IMOESTATÍSTICA os dados das
 * suas operações de venda. Registar aqui é cumprir isso — e a exportação
 * mensal sai desta mesma tabela.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validarVenda, type VendaCrua, type VendaLimpa } from "@/lib/imo/venda";
import { criarClienteServidor } from "@/lib/supabase/server";

export const runtime = "nodejs";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ---------------------------------------------------------------------
// FECHO DO CICLO: a venda real confronta as avaliações do site
// ---------------------------------------------------------------------
// O terrae.pt/avaliacao regista cada estimativa em imo_avaliacoes (zona,
// tipologia, área, intervalo). Sem preços reais o backtest (imo_backtests,
// vista imo_backtest_metricas) fica vazio e nunca se sabe se o motor
// acerta. Cada venda da Terrae registada aqui procura as avaliações que
// podem ser DESTE imóvel (mesma zona, mesma tipologia, área a ±4%, até 18
// meses antes da escritura) e regista o erro de cada uma, com fonte
// «crm_auto» para se distinguir dos emparelhamentos à mão
// (scripts/imo-backtest.mjs). Um T3 de 100 m² na mesma freguesia pode ser
// outro imóvel: por isso os candidatos aparecem no PRIMEIRO ato, antes de
// gravar, e quem regista vê o que vai ser emparelhado.

type AvaliacaoCandidata = {
  id: string; created_at: string; modo: string | null; cp7: string | null;
  valor_base: number | null; valor_min: number | null; valor_max: number | null;
  imovel: Record<string, unknown> | null;
};

const normTexto = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const chaveTipologia = (s: unknown) => normTexto(s).match(/t\s*(\d+)/)?.[1] ?? "";

async function avaliacoesCandidatas(sb: SupabaseClient, geoId: string, v: VendaLimpa): Promise<AvaliacaoCandidata[]> {
  if (!v.data_transacao || !(v.area > 0)) return [];
  const fim = new Date(v.data_transacao + "T23:59:59Z");
  if (Number.isNaN(fim.getTime())) return [];
  const inicio = new Date(fim); inicio.setMonth(inicio.getMonth() - 18);
  const { data } = await sb.from("imo_avaliacoes")
    .select("id, created_at, modo, cp7, valor_base, valor_min, valor_max, imovel")
    .eq("geografia_id", geoId)
    .gte("created_at", inicio.toISOString()).lte("created_at", fim.toISOString())
    .order("created_at", { ascending: false }).limit(300);
  const tip = chaveTipologia(v.tipologia);
  const tipo = normTexto(v.tipo).slice(0, 5);
  return ((data ?? []) as AvaliacaoCandidata[]).filter((a) => {
    const im = a.imovel ?? {};
    const areaA = Number(im.area);
    if (!(areaA > 0) || Math.abs(areaA - v.area) / v.area > 0.04) return false;
    const tipA = chaveTipologia(im.tipologia);
    if (tip && tipA && tip !== tipA) return false;
    const tipoA = normTexto(im.tipo).slice(0, 5);
    if (tipo && tipoA && tipo !== tipoA) return false;
    return true;
  });
}

type Backtest = {
  avaliacao_id: string; modo: string | null; avaliado_em: string; valor_base: number | null;
  erro_percentual: number | null; dentro_intervalo: boolean | null; dias: number | null; erro: string | null;
};

async function fecharCiclo(sb: SupabaseClient, transacaoId: string | null, candidatas: AvaliacaoCandidata[], v: VendaLimpa): Promise<Backtest[]> {
  const out: Backtest[] = [];
  for (const a of candidatas) {
    const { data, error } = await sb.rpc("imo_backtest_registar", {
      p_avaliacao: a.id,
      p_preco_real: v.preco_transacao,
      p_data: v.data_transacao,
      p_natureza: "escritura",
      p_fonte: "crm_auto",
      p_transacao: transacaoId,
      p_notas: `emparelhamento automático (zona, tipologia, área a ±4%)${v.referencia ? ` · ${v.referencia}` : ""}`,
    });
    const r = (Array.isArray(data) ? data[0] : data) as { erro_percentual?: number; dentro_intervalo?: boolean; dias?: number } | null;
    out.push({
      avaliacao_id: a.id, modo: a.modo, avaliado_em: a.created_at, valor_base: a.valor_base,
      erro_percentual: r?.erro_percentual ?? null, dentro_intervalo: r?.dentro_intervalo ?? null, dias: r?.dias ?? null,
      erro: error?.message ?? null,
    });
  }
  return out;
}

async function temSessao() {
  const sb = await criarClienteServidor();
  const { data } = await sb.auth.getUser();
  return !!data.user;
}

export async function GET() {
  if (!await temSessao()) return NextResponse.json({ erro: "sem sessão" }, { status: 401 });

  const { data, error } = await db()
    .from("imo_transacoes")
    .select("id, referencia, tipo, tipologia, area, preco_transacao, data_transacao, " +
            "dias_mercado, notas, geografia_id, imo_geografias(nome)")
    .eq("fonte_id", "terrae")
    .order("data_transacao", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ vendas: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!await temSessao()) return NextResponse.json({ erro: "sem sessão" }, { status: 401 });

  let cru: VendaCrua;
  try { cru = await req.json(); }
  catch { return NextResponse.json({ erro: "corpo ilegível" }, { status: 400 }); }

  const r = validarVenda(cru, new Date());
  if (!r.ok) return NextResponse.json({ ok: false, erros: r.erros, avisos: r.avisos }, { status: 422 });

  const sb = db();

  // Onde é que isto fica na hierarquia. Sem geografia, a venda existe mas
  // nenhuma avaliação a encontra — e é para ser encontrada que ela serve.
  const { data: geoId } = await sb.rpc("imo_geo_por_nome", {
    p_zona: r.venda.zona, p_concelho: r.venda.concelho,
  });
  if (!geoId) {
    return NextResponse.json({
      ok: false,
      erros: [{ campo: "concelho", texto:
        `Não encontrei "${r.venda.zona}" em ${r.venda.concelho} na hierarquia. ` +
        `Sem isso a venda ficaria guardada onde ninguém a procura.` }],
      avisos: r.avisos,
    }, { status: 422 });
  }
  const { data: geo } = await sb.from("imo_geografias").select("nivel, nome").eq("id", geoId).single();

  // Já lá está? Mesma zona, mesma área, mesmo preço — é a mesma venda
  // registada duas vezes, e duas cópias dobram o peso dela no motor.
  const { data: iguais } = await sb.from("imo_transacoes")
    .select("id, data_transacao").eq("fonte_id", "terrae").eq("geografia_id", geoId)
    .eq("area", r.venda.area).eq("preco_transacao", r.venda.preco_transacao);

  const duplicada = (iguais ?? []).length > 0;

  // As avaliações do site que esta venda vai confrontar (ver acima).
  const candidatas = await avaliacoesCandidatas(sb, geoId, r.venda);
  const resumoCandidatas = candidatas.map((a) => ({
    id: a.id, avaliado_em: a.created_at, modo: a.modo, cp7: a.cp7,
    valor_base: a.valor_base, valor_min: a.valor_min, valor_max: a.valor_max,
    area: Number(a.imovel?.area) || null, tipologia: (a.imovel?.tipologia as string | undefined) ?? null,
  }));

  // ---- primeiro ato: mostrar o que ia acontecer ----------------------
  const confirmar = req.nextUrl.searchParams.get("confirmar") === "1";
  if (!confirmar) {
    return NextResponse.json({
      ok: true, gravado: false,
      venda: r.venda, avisos: r.avisos, duplicada,
      onde: geo ? `${geo.nivel} · ${geo.nome}` : null,
      avaliacoes_candidatas: resumoCandidatas,
    });
  }

  if (duplicada) {
    return NextResponse.json({
      ok: false,
      erros: [{ campo: "preco_transacao", texto:
        "Esta venda já está registada. Duas cópias dobram o peso dela no motor." }],
      avisos: r.avisos,
    }, { status: 409 });
  }

  // ---- segundo ato: gravar -------------------------------------------
  const { data: nova, error } = await sb.from("imo_transacoes").insert({
    fonte_id: "terrae",
    geografia_id: geoId,
    referencia: r.venda.referencia,
    tipo: r.venda.tipo,
    tipologia: r.venda.tipologia,
    area: r.venda.area,
    lote: r.venda.lote,
    ano: r.venda.ano,
    estado: r.venda.estado,
    caracteristicas: r.venda.caracteristicas,
    preco_inicial: r.venda.preco_inicial,
    preco_final_pedido: r.venda.preco_final_pedido,
    preco_transacao: r.venda.preco_transacao,
    data_anuncio: r.venda.data_anuncio,
    data_transacao: r.venda.data_transacao,
    dias_mercado: r.venda.dias_mercado,
    n_visitas: r.venda.n_visitas,
    n_propostas: r.venda.n_propostas,
    notas: r.venda.notas,
  }).select("id").single();

  if (error) return NextResponse.json({ ok: false, erros: [{ campo: "", texto: error.message }] }, { status: 500 });

  // Fecho do ciclo. Falhar aqui nunca desfaz a venda gravada: o erro de
  // cada emparelhamento vai na resposta.
  const backtests = await fecharCiclo(sb, nova?.id ?? null, candidatas, r.venda);

  return NextResponse.json({
    ok: true, gravado: true, id: nova?.id,
    venda: r.venda, avisos: r.avisos,
    onde: geo ? `${geo.nivel} · ${geo.nome}` : null,
    avaliacoes_candidatas: resumoCandidatas,
    backtests,
  });
}
