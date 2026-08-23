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

/**
 * Traduz a área local (todas as tipologias) para a tipologia do imóvel.
 *
 * `local_tipologia = local_geral × (freguesia_tipologia ÷ freguesia_geral)`
 *
 * Devolve `null` — e não um número — sempre que a conta não se sustenta.
 * Um ajuste que não se pode justificar é pior do que ajuste nenhum: o
 * consumidor fica com a área local sem tradução, sabe disso, e usa-a
 * como souber.
 */
function ajusteTipologia(
  especifico: Record<string, unknown> | null,
  geral: Record<string, unknown> | null,
  localGeral: number,
): Record<string, unknown> | null {
  if (!especifico || !geral || !(localGeral > 0)) return null;

  // Dois benchmarks de sítios diferentes não fazem uma proporção.
  if (especifico.geografia_id !== geral.geografia_id) return null;

  // NEM DE FONTES DIFERENTES. Este guarda nasceu de um erro real: em
  // Carnaxide o T3 vinha do `sir-micro` (4.394, agosto, freguesia) e o
  // geral do `sir` em PDF (4.957, junho, microzona desenhada à mão). A
  // divisão dava 0,886 e o «ajuste» transformava um +3,7% de localização
  // num −6,1% — um número inventado pela mistura, não medido.
  //
  // Uma proporção só quer dizer alguma coisa entre dois números da mesma
  // fonte, do mesmo período e do mesmo sítio. Faltando qualquer um,
  // não se ajusta.
  if (especifico.fonte_id !== geral.fonte_id) return null;
  if (especifico.periodo !== geral.periodo) return null;

  // O mesmo benchmark dos dois lados quer dizer que não havia linha de
  // tipologia — a proporção seria 1 e o «ajuste» seria decorativo.
  if (especifico.benchmark_id === geral.benchmark_id) return null;

  const esp = num(especifico.eur_m2);
  const ger = num(geral.eur_m2);
  if (!(esp > 0) || !(ger > 0)) return null;

  const racio = esp / ger;
  // Fora desta banda a proporção não é tipologia — é um erro nos dados.
  // Uma tipologia que valesse metade ou o dobro da mistura da mesma zona
  // seria uma descoberta, não um ajuste, e merecia ser vista antes de
  // usada.
  if (racio < 0.6 || racio > 1.6) return null;

  return {
    eur_m2_tipologia: Math.round(localGeral * racio),
    tipologia_racio: Number(racio.toFixed(4)),
    tipologia_inferida: true,
    tipologia_racio_origem: "proporção entre a tipologia e todas, na mesma zona do benchmark",
  };
}

/**
 * QUAL número da área local é comparável com o benchmark.
 *
 * Existe para o motor não ter de adivinhar. Comparar o €/m² local de
 * todas as tipologias com um benchmark de T3 é o erro que este ficheiro
 * já cometeu uma vez, e a informação para o evitar está toda AQUI — não
 * lá.
 *
 *   houve ajuste de tipologia   → o valor ajustado
 *   o benchmark é geral         → o local geral, que é a mesma coisa
 *   qualquer outro caso         → nada, e diz-se porquê
 */
function comparavel(
  especifico: Record<string, unknown> | null,
  geral: Record<string, unknown> | null,
  localGeral: number,
  ajuste: Record<string, unknown> | null,
): Record<string, unknown> {
  if (ajuste?.eur_m2_tipologia) {
    return { eur_m2_comparavel: ajuste.eur_m2_tipologia, comparavel_porque: "ajustado à tipologia" };
  }
  // Sem linha de tipologia, o benchmark É o geral — e aí o local geral
  // compara-se com ele diretamente, sem inferência nenhuma pelo meio.
  if (especifico && geral && especifico.benchmark_id === geral.benchmark_id && localGeral > 0) {
    return { eur_m2_comparavel: Math.round(localGeral), comparavel_porque: "ambos de todas as tipologias" };
  }
  return {
    eur_m2_comparavel: null,
    comparavel_porque: "o benchmark é de uma tipologia e o local é de todas — não se comparam",
  };
}

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

  // ---- ÁREA DE MERCADO ADAPTATIVA ------------------------------------
  //
  // A freguesia é o chão; isto é o andar de cima. «Carnaxide e Queijas» é
  // uma união com dois mercados lá dentro — medido a 300 m de um ponto em
  // Carnaxide dá 4.147 €/m², contra 4.486 da união inteira. São 7,6% que
  // uma casa naquele sítio não devia pagar nem receber.
  //
  // A CHAVE É O CÓDIGO POSTAL, e não uma aproximação nossa: o Micro-SIR
  // georreferencia «a partir dos centroides dos códigos-postais a 7
  // dígitos». Duas casas no mesmo CP7 partilham o centroide de qualquer
  // maneira.
  //
  // ESTA CHAMADA NUNCA ATRASA A AVALIAÇÃO. Se o código postal ainda não
  // tem área, fica na fila e devolve-se nada — o motor segue com o
  // benchmark da freguesia, que existe sempre. Uma corrida diária esvazia
  // a fila com um login só, e a avaliação seguinte naquele código postal
  // já encontra a área fina.
  let areaCp: Record<string, unknown> | null = null;
  try {
    const { data: cp } = await db.rpc("imo_cp_area", {
      p_cp7: imovel.cp ?? imovel.codigo_postal ?? null,
      p_lat: num(imovel.lat) || null,
      p_lng: num(imovel.lng) || null,
      p_geografia: geoId,
    });
    // As colunas vêm com prefixo `r_`: num `returns table` do Postgres os
    // nomes de saída viram variáveis e colidiam com as colunas da tabela
    // (migração 0110).
    const a = Array.isArray(cp) ? cp[0] : cp;
    if (a?.r_raio_m) areaCp = a;
  } catch (_) {
    // A área fina é uma melhoria, nunca uma dependência. Sem ela o motor
    // faz exatamente o que fazia — que é a mesma regra da camada toda.
  }

  // =====================================================================
  // REGISTAR A AVALIAÇÃO — o que se decidiu, e com que dados
  // =====================================================================
  // «Porque demos este valor?» é a pergunta que um uso profissional
  // obriga a saber responder meses depois. A tabela existia e ninguém
  // escrevia nela: cada avaliação saía, era entregue ao proprietário, e
  // desaparecia. Sem isto não há auditoria nem backtesting — e sem
  // backtesting a confiança que o relatório mostra nunca pode ser
  // calibrada contra o que aconteceu de facto.
  //
  // Guarda-se o que PERMITE REPRODUZIR: a amostra usada (que é imutável),
  // o benchmark, a geografia, os valores e a memória de cálculo passo a
  // passo. A narrativa do modelo não entra — essa pode variar, e não é
  // ela que se audita.
  if (new URL(req.url).searchParams.get("avaliacao") === "1") {
    const a = corpo?.avaliacao ?? {};
    if (!(a.valor_base > 0)) {
      return Response.json({ erro: "sem_valor" }, { status: 400, headers: cors(origem) });
    }
    const { data: novo, error } = await db.from("imo_avaliacoes").insert({
      referencia: a.referencia ?? null,
      motor_versao: String(a.motor_versao ?? "desconhecida"),
      geografia_id: geoId,
      imovel: imovel,
      amostra_id: a.amostra_id ?? null,
      benchmark_id: a.benchmark_id ?? null,
      benchmark_nivel: a.benchmark_nivel ?? null,
      valor_base: a.valor_base,
      valor_min: a.valor_min ?? null,
      valor_max: a.valor_max ?? null,
      eur_m2: a.eur_m2 ?? null,
      confianca_pct: a.confianca_pct ?? null,
      confianca_banda: a.confianca_banda ?? null,
      gap_mercado: a.gap_mercado ?? null,
      memoria: Array.isArray(a.memoria) ? a.memoria : [],
      aviso_llm: a.aviso_llm ?? null,
    }).select("id").single();

    if (error) return Response.json({ erro: error.message }, { status: 500, headers: cors(origem) });
    return Response.json({ registada: true, id: novo?.id }, { headers: cors(origem) });
  }

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

  // ---- O BENCHMARK GERAL DA MESMA ZONA -------------------------------
  //
  // Serve uma coisa só: dar a proporção entre a tipologia do imóvel e a
  // mistura de todas. É com ela que a área local — que é de TODAS as
  // tipologias — se traduz para a tipologia certa.
  //
  // Sem isto, servir a área local ao lado do benchmark do T3 seria
  // comparar um T3 com a mistura, e a diferença que aparecesse era em
  // parte tipologia e não localização. Em Avenidas Novas isso dava +19,7%
  // quando a diferença real de localização é +12,6%.
  let bGeral: Record<string, unknown> | null = null;
  if (b && geoId) {
    const { data: g } = await db.rpc("imo_benchmark", {
      p_geografia: geoId, p_tipo: "", p_tipologia: "",
    });
    bGeral = Array.isArray(g) ? g[0] ?? null : null;
  }

  // Pode este benchmark aparecer no relatório do cliente, e com que
  // atribuição? A resposta vem da tabela de fontes, não de uma regra
  // escrita aqui.
  //
  // Estava escrito `publicavel: b.fonte_id !== "sir"` — uma suposição
  // minha, tomada sem ler o contrato, e ERRADA: a cláusula 4.d) da ficha
  // de subscrição autoriza mostrar os conteúdos a clientes, desde que
  // acompanhados de «© IMOESTATÍSTICA – TODOS OS DIREITOS RESERVADOS».
  //
  // Uma regra de licença escrita à mão no meio do código envelhece com o
  // contrato e ninguém a vai lá rever. Na tabela, muda-se num sítio só.
  let licenca: { pode: boolean; atribuicao: string | null } = { pode: false, atribuicao: null };
  if (b) {
    const { data: lic } = await db.rpc("imo_pode_mostrar", { p_fonte: b.fonte_id });
    const l = Array.isArray(lic) ? lic[0] : lic;
    if (l) licenca = { pode: !!l.pode, atribuicao: l.atribuicao ?? null };
  }

  // ---- HISTÓRICO: como o €/m² desta zona se moveu -------------------
  //
  // O gráfico de tendência do relatório vinha do modelo, e o prompt
  // convidava-o a citar «relatórios Idealista/Confidencial Imobiliário».
  // Ou seja: uma série atribuída a uma entidade com quem a Terrae tem
  // contrato, produzida por um modelo em vez de vir dos dados que
  // pagámos. Agora que os benchmarks ficam datados, sai daqui.
  //
  // Ao MESMO nível geográfico que o benchmark escolhido — subir de nível
  // a meio da série faria o valor «mover-se» por mudança de zona e não
  // por mudança de mercado, que é exatamente a mentira que este gráfico
  // não pode contar.
  //
  // Hoje há um só período: devolve-se lista vazia, e vazio é a resposta
  // certa. Uma linha entre dois pontos inventados seria pior do que não
  // ter gráfico. O histórico acumula-se a cada importação.
  let historico: Array<{ periodo: string; eur_m2: number; amostra: number | null }> = [];
  if (b) {
    const { data: serie } = await db.from("imo_benchmarks")
      .select("periodo, eur_m2_medio, eur_m2_mediano, n_transacoes, extra")
      .eq("geografia_id", b.geografia_id)
      .eq("tipo_imovel", b.tipo_imovel ?? "")
      .eq("tipologia", b.tipologia ?? "")
      .eq("fonte_id", b.fonte_id)
      .order("periodo", { ascending: true });

    historico = (serie ?? [])
      // Um derivado no meio de uma série de reais é uma mudança de
      // método, não de mercado. Fora.
      .filter((s) => !(s.extra as Record<string, unknown> | null)?.derivado)
      .map((s) => ({
        periodo: s.periodo,
        eur_m2: Math.round(Number(s.eur_m2_mediano ?? s.eur_m2_medio)),
        amostra: s.n_transacoes,
      }))
      .filter((s) => s.eur_m2 > 0);
  }

  // Vendas reais da Terrae na mesma geografia. É o dado de maior valor e
  // o único que mais ninguém tem.
  const { data: vendas } = geoId
    ? await db.from("imo_transacoes")
        .select("referencia, tipo, tipologia, area, preco_transacao, data_transacao, caracteristicas")
        .eq("geografia_id", geoId)
        // SÓ ESCRITURAS. Um preço de tabela de promotor a ancorar com
        // 50% do peso é a confusão pedido/escritura a entrar pela porta
        // dos dados, depois de a termos fechado no cálculo.
        .eq("natureza", "escritura")
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
    // Quem monta o relatório precisa de saber se pode mostrar isto e o
    // que tem de escrever ao lado. Vai declarado, não assumido — e vem
    // da tabela de fontes, que é onde a licença está registada.
    //
    // Os quartis e a dispersão vão junto porque um número sozinho não é
    // mercado: «5.841 €/m²» diz muito menos do que «entre 3.922 e 6.857,
    // e a sua casa está aqui».
    benchmark: b
      ? {
        // O id vai junto para a avaliação poder apontar para o
        // benchmark EXATO que usou — sem isso, «ancorou no SIR» é uma
        // afirmação que ninguém consegue verificar seis meses depois.
        id: b.benchmark_id,
        fonte: b.fonte_id, nivel: b.nivel, zona: b.nome,
        eur_m2: b.eur_m2, medida: b.medida,
        p25: b.p25, p75: b.p75, dispersao: b.dispersao,
        n_transacoes: b.n_transacoes,
        periodo: b.periodo, desconto: b.desconto,
        // NATUREZA e ÁREA vão declaradas porque quem consome tem de
        // decidir com elas, não apesar delas.
        //
        // O `ancoraSIR()` do site convertia SEMPRE com o price gap, por
        // assumir que o SIR são preços pedidos. São de venda — e aplicar
        // o gap a um preço de venda tira-lhe 21-27% sem dar erro nenhum.
        // Sem este campo a função não tem como saber a diferença.
        natureza: b.natureza ?? null,
        area_base: b.area_base ?? null,
        // ESTADO DO MERCADO (0111). Distinto do preço, e é o que permite
        // responder «porque é que não vende» e «isto rende o quê».
        //
        // Nulo quer dizer «a fonte não divulga a esta granularidade» —
        // abaixo de um mínimo de observações ela devolve nulo, não zero.
        // Quem consome tem de calar-se sobre o indicador, nunca escrever
        // «0 dias» ou «yield de 0%».
        mercado: {
          absorcao_dias: b.absorcao_dias ?? null,
          yield_bruta: b.yield_bruta ?? null,
          desconto_negociacao: b.desconto_negociacao ?? null,
        },
        // CONSTRUÇÃO NOVA vs USADO, em separado (0112).
        //
        // O `eur_m2` acima é uma mistura dominada por stock usado. O
        // prémio do novo tem mediana de 33,9% sobre o usado e 25,1%
        // sobre a mistura — medir um apartamento novo contra a mistura
        // diz «25% acima do mercado» de um imóvel que está no mercado
        // dele. Quem compara um imóvel concreto tem de escolher, e para
        // escolher tem de receber os dois.
        eur_m2_novos: b.eur_m2_novos ?? null,
        eur_m2_usados: b.eur_m2_usados ?? null,
        // QUE LINHA foi escolhida (0113). Vazio = «vale para todas», ou
        // seja, a procura subiu por não haver nada mais específico.
        //
        // Sem isto, uma moradia T5 de 500 m² é comparada com a linha de
        // todas as tipologias da freguesia — 9.910 transações que são,
        // na esmagadora maioria, apartamentos — e o relatório sai com um
        // veredicto confiante que ninguém tem como pôr em causa.
        tipologia_benchmark: b.tipologia_benchmark ?? null,
        tipo_benchmark: b.tipo_benchmark ?? null,
        publicavel: licenca.pode,
        atribuicao: licenca.atribuicao,
      }
      : null,
    // A área de mercado à volta DESTA casa, quando já foi colhida.
    //
    // Vai à parte do benchmark de propósito: são coisas diferentes e quem
    // consome tem de poder escolher. O benchmark descreve a freguesia e
    // existe sempre; isto descreve os 300 a 2.000 m à volta do imóvel e
    // pode ainda não existir.
    //
    // `raio_m` é a meia-largura do QUADRADO, não o raio de um círculo — o
    // nome do campo di-lo para ninguém desenhar a coisa errada.
    area_local: areaCp
      ? {
        cp7: areaCp.r_cp7,
        raio_m: areaCp.r_raio_m,
        amostra: areaCp.r_amostra,
        eur_m2: areaCp.r_eur_m2_medio,
        p25: areaCp.r_eur_m2_p25,
        p75: areaCp.r_eur_m2_p75,
        colhido_em: areaCp.r_colhido_em,
        // A escada toda: «porquê 750 m e não 500?» é uma pergunta que um
        // avaliador tem de saber responder.
        escada: areaCp.r_escada,
        natureza: "transacao",
        area_base: "bruta privativa",
        publicavel: licenca.pode,
        atribuicao: licenca.atribuicao,
        // ---- AJUSTE DE TIPOLOGIA ------------------------------------
        //
        // A área local é de TODAS as tipologias; o benchmark da freguesia
        // tem linha por tipologia. Aplica-se aqui a proporção de uma à
        // outra: se na freguesia os T3 valem 0,92 da mistura, o mesmo se
        // assume nos 300 m.
        //
        // É UMA INFERÊNCIA, e vai marcada como tal. Assume que a relação
        // entre tipologias é parecida dentro da freguesia — o que é
        // razoável e não é garantido. Quem usar o número tem de poder ver
        // que ele foi inferido, e com que rácio.
        //
        // Só se calcula quando os dois benchmarks vêm da MESMA geografia:
        // se o do T3 subiu para o concelho e o geral ficou na freguesia,
        // a proporção é entre dois sítios diferentes e não quer dizer
        // nada.
        ...(() => {
          const local = num(areaCp!.r_eur_m2_medio);
          const aj = ajusteTipologia(b, bGeral, local);
          return { ...(aj ?? {}), ...comparavel(b, bGeral, local, aj) };
        })(),
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
    // A série do €/m² desta zona, ao nível a que o benchmark foi
    // encontrado. Com menos de 3 pontos não há tendência para mostrar —
    // quem consome decide, mas a contagem vai declarada.
    historico: historico,
    // Se não há amostra válida, quem chama tem de pesquisar e devolver
    // os comparáveis com `?guardar=1`. É a primeira avaliação da zona que
    // paga a pesquisa; as seguintes reutilizam.
    // Não basta EXISTIR fotografia: tem de ser usável.
    //
    // Dizia `!am`, e isso criava uma armadilha permanente. Uma amostra
    // com 2 itens é demasiado fina para o motor a usar (ele exige 3),
    // mas era suficiente para este campo dizer «não precisas de
    // pesquisar» — logo a pesquisa corria à mesma, o resultado NÃO era
    // guardado, e a amostra fina ficava a bloquear a sua própria
    // substituição até expirar. Carnaxide ficou assim: cinco minutos por
    // avaliação, sem nunca melhorar.
    //
    // O 3 é o mesmo limiar que avaliacao-engine.js usa para entrar no
    // caminho rápido. Estão em repositórios diferentes e têm de andar a
    // par: se um mudar, o outro tem de mudar com ele — senão volta-se a
    // ter um estado em que nem se usa nem se substitui.
    precisa_pesquisar: !am || itens.length < 3,
  }, { headers: cors(origem) });
});
