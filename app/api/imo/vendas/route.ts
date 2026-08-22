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
import { createClient } from "@supabase/supabase-js";
import { validarVenda, type VendaCrua } from "@/lib/imo/venda";
import { criarClienteServidor } from "@/lib/supabase/server";

export const runtime = "nodejs";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
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

  // ---- primeiro ato: mostrar o que ia acontecer ----------------------
  const confirmar = req.nextUrl.searchParams.get("confirmar") === "1";
  if (!confirmar) {
    return NextResponse.json({
      ok: true, gravado: false,
      venda: r.venda, avisos: r.avisos, duplicada,
      onde: geo ? `${geo.nivel} · ${geo.nome}` : null,
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

  return NextResponse.json({
    ok: true, gravado: true, id: nova?.id,
    venda: r.venda, avisos: r.avisos,
    onde: geo ? `${geo.nivel} · ${geo.nome}` : null,
  });
}
