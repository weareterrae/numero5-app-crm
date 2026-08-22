// =====================================================================
// Camada de dados imobiliária — servida ao site
// ---------------------------------------------------------------------
// O motor de avaliação corre em funções Netlify da terrae.pt; os dados
// vivem no Postgres do Nº 5. Podia dar-se uma chave de base de dados ao
// site — e seria o mesmo erro que já custou caro com as chaves dos
// fornecedores. Serve-se por HTTP, com a mesma allowlist de origem.
//
// Dois pedidos:
//
//   POST /imo-dados            devolve o pacote de dados de um imóvel:
//                              benchmark de transação + amostra de
//                              comparáveis, se houver uma válida.
//
//   POST /imo-dados?guardar=1  recebe os comparáveis que a pesquisa
//                              encontrou e cria a amostra para as
//                              próximas avaliações.
//
// A razão de ser: hoje cada avaliação vai à internet outra vez e traz um
// conjunto diferente. Com a amostra, a primeira avaliação de uma zona
// paga a pesquisa e as seguintes reutilizam-na enquanto for válida —
// mesma zona, mesmo perfil, mesmo valor.
//
// Uma amostra usada NUNCA é alterada. Refrescar cria outra. É isso que
// torna uma avaliação de há seis meses reproduzível.

import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

/** Quem pode pedir. Mesma disciplina do gateway: allowlist, não confiança. */
const ORIGENS = new Set([
  "https://terrae.pt",
  "https://www.terrae.pt",
  "https://terraesite.netlify.app",
  "https://app.numerocinco.pt",
]);

/**
 * Validade de uma amostra.
 *
 * Sete dias é o equilíbrio entre duas coisas que puxam em sentidos
 * opostos: congelar demais deixa-nos atrás do mercado; refrescar demais
 * traz de volta a instabilidade que isto veio resolver. O mercado
 * residencial não se move em dias — move-se em meses.
 */
const VALIDADE_DIAS = 7;

function cors(origem: string | null) {
  return {
    "access-control-allow-origin": origem && ORIGENS.has(origem) ? origem : "null",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  const origem = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origem) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: cors(origem) });

  if (!origem || !ORIGENS.has(origem)) {
    return Response.json({ erro: "origem_nao_autorizada" }, { status: 403, headers: cors(origem) });
  }

  let corpo: any;
  try { corpo = await req.json(); } catch {
    return Response.json({ erro: "pedido_invalido" }, { status: 400, headers: cors(origem) });
  }

  const guardar = new URL(req.url).searchParams.get("guardar") === "1";
  const imovel = corpo?.imovel ?? {};
  const area = num(imovel.area);

  // ---- geografia: é o que liga o imóvel a tudo o resto ----------------
  const { data: geoId } = await db.rpc("imo_geo_por_nome", {
    p_zona: imovel.zona ?? imovel.freguesia ?? null,
    p_concelho: imovel.concelho ?? null,
  });

  const { data: chave } = await db.rpc("imo_chave_amostra", {
    p_geografia: geoId, p_tipo: imovel.tipo ?? "", p_tipologia: imovel.tipologia ?? "", p_area: area,
  });

  // =====================================================================
  // GUARDAR — a pesquisa correu, os comparáveis vêm de fora
  // =====================================================================
  if (guardar) {
    const comparaveis: any[] = Array.isArray(corpo?.comparaveis) ? corpo.comparaveis : [];
    if (!comparaveis.length) {
      return Response.json({ erro: "sem_comparaveis" }, { status: 400, headers: cors(origem) });
    }
    if (!geoId) {
      // Sem geografia não há chave estável, logo não há reutilização
      // possível. Vale mais dizê-lo do que criar uma amostra órfã.
      return Response.json({
        guardada: false,
        motivo: "geografia_desconhecida",
        nota: `A zona "${imovel.zona ?? ""}" não existe na hierarquia. Acrescentá-la torna esta zona reutilizável.`,
      }, { headers: cors(origem) });
    }

    const validaAte = new Date(Date.now() + VALIDADE_DIAS * 86_400_000).toISOString();
    const { data: amostra, error: eA } = await db.from("imo_amostras").insert({
      geografia_id: geoId,
      tipo: imovel.tipo ?? null,
      tipologia: imovel.tipologia ?? null,
      area_min: area ? Math.round(area * 0.7) : null,
      area_max: area ? Math.round(area * 1.4) : null,
      chave,
      valida_ate: validaAte,
    }).select("id").single();
    if (eA) return Response.json({ erro: eA.message }, { status: 500, headers: cors(origem) });

    const itens: any[] = [];
    for (const c of comparaveis) {
      const a = num(c.area ?? c.area_m2);
      const p = num(c.preco ?? c.preco_eur);
      if (!a || !p || a < 5 || p < 1000) continue;

      const { data: q } = await db.rpc("imo_qualidade_comparavel", {
        p_area_alvo: area, p_area_comp: a,
        p_tipologia_alvo: imovel.tipologia ?? null, p_tipologia_comp: c.tipologia ?? null,
        p_tipo_alvo: imovel.tipo ?? null, p_tipo_comp: c.tipo ?? null,
        p_distancia_km: num(c.distancia_km),
        p_dias_desde_observacao: 0,   // acabou de ser observado
      });

      itens.push({
        amostra_id: amostra.id,
        fonte_id: "portais",
        titulo: String(c.titulo ?? "").slice(0, 300),
        url: c.url ?? null,
        preco: p, area: a, eur_m2: Math.round(p / a),
        distancia_km: num(c.distancia_km),
        qualidade: q ?? null,
        bruto: c,
      });
    }

    if (!itens.length) {
      // Amostra sem itens utilizáveis não serve para nada e ainda seria
      // reutilizada durante sete dias. Apaga-se.
      await db.from("imo_amostras").delete().eq("id", amostra.id);
      return Response.json({
        guardada: false, motivo: "nenhum_comparavel_utilizavel",
        nota: "Todos os comparáveis vieram sem área ou sem preço.",
      }, { headers: cors(origem) });
    }

    await db.from("imo_amostra_itens").insert(itens);

    const m2 = itens.map((i) => i.eur_m2).sort((a, b) => a - b);
    const mediana = m2.length % 2 ? m2[(m2.length - 1) / 2] : (m2[m2.length / 2 - 1] + m2[m2.length / 2]) / 2;
    const desvios = m2.map((x) => Math.abs(x - mediana)).sort((a, b) => a - b);
    const mad = desvios.length % 2 ? desvios[(desvios.length - 1) / 2]
      : (desvios[desvios.length / 2 - 1] + desvios[desvios.length / 2]) / 2;

    await db.from("imo_amostras").update({
      n_itens: itens.length,
      eur_m2_mediano: mediana,
      dispersao: mediana ? Number(((mad * 1.4826) / mediana).toFixed(4)) : null,
      qualidade: Math.round(itens.reduce((s, i) => s + (i.qualidade ?? 0), 0) / itens.length),
    }).eq("id", amostra.id);

    return Response.json({
      guardada: true, amostra_id: amostra.id, n_itens: itens.length,
      eur_m2_mediano: mediana, valida_ate: validaAte,
    }, { headers: cors(origem) });
  }

  // =====================================================================
  // LER — o pacote de dados para avaliar
  // =====================================================================
  const [{ data: bench }, { data: amostraValida }] = await Promise.all([
    db.rpc("imo_benchmark", {
      p_geografia: geoId, p_tipo: imovel.tipo ?? "", p_tipologia: imovel.tipologia ?? "",
    }),
    db.rpc("imo_amostra_valida", { p_chave: chave }),
  ]);

  const b = Array.isArray(bench) ? bench[0] : null;
  const am = Array.isArray(amostraValida) ? amostraValida[0] : null;

  // Vendas reais da Terrae na mesma geografia. É o dado de maior valor e
  // o único que mais ninguém tem.
  const { data: vendas } = geoId
    ? await db.from("imo_transacoes")
        .select("referencia, tipo, tipologia, area, preco_transacao, data_transacao, caracteristicas")
        .eq("geografia_id", geoId)
        .order("data_transacao", { ascending: false }).limit(10)
    : { data: [] };

  let itens: any[] = [];
  if (am) {
    const { data } = await db.from("imo_amostra_itens")
      .select("titulo, url, preco, area, eur_m2, distancia_km, qualidade")
      .eq("amostra_id", am.id)
      // Abaixo de 40 não serve: um anúncio a 8 km com metade da área não
      // descreve este imóvel, e entrar na mediana só a estraga.
      .gte("qualidade", 40)
      .order("qualidade", { ascending: false });
    itens = data ?? [];
  }

  return Response.json({
    geografia_id: geoId,
    chave_amostra: chave,
    // A licença do SIR permite CALCULAR com ele, não publicar as suas
    // tabelas. Quem monta o relatório precisa de saber isto, e por isso
    // vai declarado em vez de assumido.
    benchmark: b
      ? {
        fonte: b.fonte_id, nivel: b.nivel, zona: b.nome,
        eur_m2: b.eur_m2, n_transacoes: b.n_transacoes,
        periodo: b.periodo, desconto: b.desconto,
        publicavel: b.fonte_id !== "sir",
      }
      : null,
    amostra: am
      ? {
        id: am.id, criada_em: am.criada_em, valida_ate: am.valida_ate,
        n_itens: itens.length, eur_m2_mediano: am.eur_m2_mediano,
        dispersao: am.dispersao, qualidade: am.qualidade,
        comparaveis: itens,
      }
      : null,
    vendas_terrae: vendas ?? [],
    // Se não há amostra válida, quem chama tem de pesquisar e devolver
    // os comparáveis com `?guardar=1`. É a primeira avaliação da zona que
    // paga a pesquisa; as seguintes reutilizam.
    precisa_pesquisar: !am,
  }, { headers: cors(origem) });
});
