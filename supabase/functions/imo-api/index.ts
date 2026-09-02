// =====================================================================
// imo-api · a camada de dados imobiliária servida a ferramentas
// ---------------------------------------------------------------------
// A imo-dados serve o motor do site: um pedido por imóvel, autenticado
// pela origem, à medida do avaliacao-engine. Isto serve FERRAMENTAS: um
// assistente do Nuno, um cenário no Make, um GPT, um servidor MCP. Cada
// uma tem a sua chave, o seu limite e o seu registo, e pede as coisas
// pelo nome: uma zona, um código postal, uma série.
//
//   GET  /imo-api/saude                       está de pé (sem chave)
//   GET  /imo-api/fontes                      fontes, licenças, atribuições
//   GET  /imo-api/zonas?concelho=Oeiras       zonas com dados e o último benchmark
//   GET  /imo-api/mercado?zona=…&concelho=…&tipo=apartamento&tipologia=T3[&vendas=1]
//   GET  /imo-api/serie?zona=…&concelho=…&tipo=…&tipologia=…
//   GET  /imo-api/codigo-postal?cp7=2790-008  sítio + área local + mercado da zona
//   GET  /imo-api/fila                        estado da fila do MicroSIR
//   POST /imo-api/fila  {"cp7":"2790-008"}    pôr um código postal na fila (flag)
//
// Autenticação: Authorization: Bearer imo_… (ou o header X-Imo-Key).
// As chaves criam-se com scripts/imo-chave.mjs e vivem em imo_ferramentas
// (migração 0119) como SHA-256.
//
// O QUE ISTO NÃO FAZ, DE PROPÓSITO
//
// Não chama o Actor do Apify a pedido. Cada corrida é um login no MicroSIR
// (~35 s) e a licença pede que não se concorra com a exploração normal da
// fonte. A colheita é agendada (dia 3 de cada mês, zonas) e diária (fila
// de códigos postais, um login para todos). Uma ferramenta que precise de
// um código postal novo põe-no na fila e volta no dia seguinte.
//
// Não devolve nada que não seja agregado. Só benchmarks (médias, quartis,
// contagens, indicadores) e, por chave, as vendas da Terrae, que são
// nossas.
//
// LICENÇA, EM TODAS AS RESPOSTAS. O bloco `licenca` diz, por fonte, se
// o valor pode ser publicado e com que atribuição, e repete as regras.
// Vem em todas as respostas com dados, para nenhuma ferramenta poder dizer
// que não sabia.
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const VERSAO = "2026-09-02";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type Ferramenta = {
  id: string;
  nome: string;
  ativo: boolean;
  allowed_origins: string[];
  permite_vendas_terrae: boolean;
  permite_enfileirar: boolean;
  limite_minuto: number;
  limite_dia: number;
};

type Saida = {
  status: number;
  corpo: Record<string, unknown>;
  cache?: string;
  fonte?: string | null;
};

type Registo = Record<string, unknown>;

/** Abaixo disto uma área local não se serve: é o piso do motor e da licença. */
const AMOSTRA_MINIMA = 30;
/** Códigos postais NOVOS que uma chave pode pôr na fila por dia. */
const FILA_MAX_DIA = 20;

/**
 * A escada como sai para fora. Cada degrau diz o raio e se chegou; a
 * contagem só se mostra a partir do mínimo. «3 transações a 300 m de
 * um ponto» é o género de número de onde se reconstrói uma operação, e a
 * cláusula 2.c) não o permite.
 */
function escadaPublica(escada: unknown): unknown {
  if (!Array.isArray(escada)) return escada ?? null;
  return escada.map((d) => {
    if (!d || typeof d !== "object") return d;
    const degrau = { ...(d as Registo) };
    for (const k of ["amostra", "n", "sample_count", "count"]) {
      if (typeof degrau[k] === "number" && (degrau[k] as number) < AMOSTRA_MINIMA) {
        degrau[k] = null;
        degrau.abaixo_do_minimo = true;
      }
    }
    return degrau;
  });
}

const REGRAS = [
  "Só agregados. Nunca reconstruir uma transação ou um imóvel individual a partir destes números.",
  "A atribuição de cada fonte tem de aparecer, com as palavras exactas, junto de qualquer valor publicado.",
  "Uso interno das ferramentas da Terrae. Os dados do SIR e do MicroSIR não podem ser redistribuídos a terceiros.",
  "Nulo quer dizer «a fonte não divulga a esta granularidade». Nunca escrever 0 nem estimar por cima.",
  "Os €/m² do SIR e do MicroSIR são preços de venda (natureza «transacao») sobre área bruta privativa. Não aplicar price gap.",
  "raio_m é a meia-largura de um quadrado, não o raio de um círculo.",
];

// ---------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------
function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** «2790-008», «2790008», « 2790 008 » → «2790-008». Sete dígitos ou nada. */
function cp7De(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 7) return null;
  return `${d.slice(0, 4)}-${d.slice(4)}`;
}

/** Como está guardado em imo_benchmarks: '' (todos), 'apartamento', 'moradia'. */
function tipoDe(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s || s === "todos") return "";
  if (/apart|fra[cç][aã]o|andar/.test(s)) return "apartamento";
  if (/morad|vivenda|casa/.test(s)) return "moradia";
  return s.slice(0, 20);
}

/** '' (todas) ou 'T0'…'T6'. Aceita «t3», «T3», «3», «T4+», «≥T4». */
function tipologiaDe(v: unknown): string {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s || s === "TODAS") return "";
  const m = s.match(/(\d)/);
  return m ? `T${m[1]}` : "";
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function chaveDe(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(imo_[a-f0-9]{16,})$/i);
  if (m) return m[1];
  const x = (req.headers.get("x-imo-key") ?? "").trim();
  return /^imo_[a-f0-9]{16,}$/i.test(x) ? x : null;
}

function corsDe(origem: string | null, permitida: boolean): Record<string, string> {
  return {
    "access-control-allow-origin": origem && permitida ? origem : "null",
    "access-control-allow-headers": "authorization, x-imo-key, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "vary": "origin",
  };
}

function erroCorpo(erro: string, mensagem: string, terminal = false): Record<string, unknown> {
  return { ok: false, erro, mensagem, terminal };
}

/** Corre trabalho fora do caminho crítico (ledger). Aceita um thenable do PostgREST. */
function emSegundoPlano(p: PromiseLike<unknown>) {
  const promessa = Promise.resolve(p).catch(() => {});
  try {
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(promessa);
  } catch { /* runtime sem waitUntil: a promessa corre na mesma */ }
}

// ---------------------------------------------------------------------
// licença: por fonte, a partir da tabela de fontes (nunca de uma regra
// escrita aqui)
// ---------------------------------------------------------------------
async function licencas(fontes: Array<string | null | undefined>) {
  const out: Record<string, { publicavel: boolean; atribuicao: string | null; porque: string | null }> = {};
  for (const f of new Set(fontes.filter((x): x is string => !!x))) {
    const { data, error } = await db.rpc("imo_pode_mostrar", { p_fonte: f });
    // Falha fechada: sem resposta da tabela de fontes, não é publicável.
    // Mas fica escrito, para não passar por «a fonte não deixa».
    if (error) console.error(`imo-api: imo_pode_mostrar(${f}) falhou: ${error.message}`);
    const l = Array.isArray(data) ? data[0] : data;
    out[f] = { publicavel: !!l?.pode, atribuicao: l?.atribuicao ?? null, porque: l?.porque ?? null };
  }
  return out;
}

async function blocoLicenca(fontes: Array<string | null | undefined>) {
  return { fontes: await licencas(fontes), regras: REGRAS };
}

// ---------------------------------------------------------------------
// o benchmark, com a mesma forma que o site já conhece (imo-dados), mais
// o que o site não usa e uma ferramenta quer: cobertura, observações,
// data da colheita, avisos
// ---------------------------------------------------------------------
function formaBenchmark(b: Registo, extra: Registo | null, pedido: { tipo: string; tipologia: string }) {
  const tipologiaB = String(b.tipologia_benchmark ?? "");
  const tipoB = String(b.tipo_benchmark ?? "");
  return {
    id: b.benchmark_id,
    fonte: b.fonte_id,
    nivel: b.nivel,
    zona: b.nome,
    eur_m2: num(b.eur_m2),
    medida: b.medida ?? null,
    p25: num(b.p25),
    p75: num(b.p75),
    dispersao: num(b.dispersao),
    n_transacoes: b.n_transacoes ?? null,
    periodo: b.periodo ?? null,
    natureza: b.natureza ?? null,
    area_base: b.area_base ?? null,
    // price gap (oferta acima do fecho), negativo por definição. É um
    // sinal de mercado, nunca um factor a aplicar.
    desconto: num(b.desconto),
    mercado: {
      absorcao_dias: b.absorcao_dias ?? null,
      yield_bruta: num(b.yield_bruta),
      desconto_negociacao: num(b.desconto_negociacao),
    },
    eur_m2_novos: num(b.eur_m2_novos),
    eur_m2_usados: num(b.eur_m2_usados),
    // Que linha foi escolhida. Vazio = vale para todas; a procura subiu
    // por não haver nada mais específico.
    tipologia_benchmark: tipologiaB,
    tipo_benchmark: tipoB,
    referencia_generica: (pedido.tipologia !== "" && tipologiaB === "") || (pedido.tipo !== "" && tipoB === ""),
    // Uma linha de concelho DERIVADA pela Terrae (mediana das zonas do
    // SIR em PDF) não é uma publicação da IMOESTATÍSTICA. Vai marcada,
    // para ninguém a citar como se fosse.
    derivado: !!extra?.derivado,
    cobertura_bbox: num(extra?.cobertura_bbox),
    n_observacoes: (extra?.n_observacoes as number | undefined) ?? null,
    colhido_em: (extra?.colhido_em as string | undefined) ?? null,
    janela_meses: (extra?.janela_meses as number | undefined) ?? null,
    avisos_colheita: (extra?.avisos_colheita as string[] | undefined) ?? [],
  };
}

async function extraDe(benchmarkId: unknown): Promise<Registo | null> {
  if (!benchmarkId) return null;
  const { data } = await db.from("imo_benchmarks").select("extra").eq("id", benchmarkId).maybeSingle();
  return (data?.extra as Registo | null) ?? null;
}

/** A série de uma geografia/tipo/tipologia, só fontes de transação (escalão 1). */
async function serieDe(geoId: string, tipo: string, tipologia: string, fonte?: string | null) {
  let q = db.from("imo_benchmarks")
    .select("fonte_id, periodo, periodo_fim, eur_m2_medio, eur_m2_mediano, eur_m2_p25, eur_m2_p75, n_transacoes, extra, imo_fontes!inner(escalao)")
    .eq("geografia_id", geoId)
    .eq("tipo_imovel", tipo)
    .eq("tipologia", tipologia)
    .eq("imo_fontes.escalao", 1)
    .order("fonte_id", { ascending: true })
    .order("periodo_fim", { ascending: true });
  if (fonte) q = q.eq("fonte_id", fonte);
  const { data, error } = await q;
  if (error) throw new Error(`serie: ${error.message}`);
  return (data ?? [])
    // Um derivado no meio de uma série de reais é uma mudança de método,
    // não de mercado. Fora.
    .filter((s) => !(s.extra as Registo | null)?.derivado)
    .map((s) => ({
      fonte: s.fonte_id,
      periodo: s.periodo,
      periodo_fim: s.periodo_fim,
      eur_m2: Math.round(Number(s.eur_m2_mediano ?? s.eur_m2_medio)),
      p25: num(s.eur_m2_p25),
      p75: num(s.eur_m2_p75),
      n_transacoes: s.n_transacoes ?? null,
    }))
    .filter((s) => s.eur_m2 > 0);
}

async function geografiaDe(zona: string, concelho: string | null) {
  // Sem concelho, a zona pode SER um concelho («Oeiras»). imo_geo_por_nome
  // só o reconhece pelo p_concelho: sem ele procurava uma freguesia cujo
  // nome contivesse «Oeiras» e devolvia «Oeiras e São Julião da Barra…»
  // como se fosse o concelho inteiro. Passa-se a zona também como
  // concelho; se não for um, a função ignora-o e segue como antes.
  const { data: geoId, error } = await db.rpc("imo_geo_por_nome", { p_zona: zona || null, p_concelho: concelho ?? zona ?? null });
  if (error) throw new Error(`imo_geo_por_nome: ${error.message}`);
  if (!geoId) return null;
  const { data: g, error: eG } = await db.from("imo_geografias").select("id, nivel, nome").eq("id", geoId).maybeSingle();
  if (eG) throw new Error(`imo_geografias: ${eG.message}`);
  return g ? { id: g.id as string, nivel: g.nivel as string, zona: g.nome as string } : { id: geoId as string, nivel: null, zona: null };
}

/** A mesma normalização que imo_chave faz no SQL: sem acentos, sem hífenes, minúsculas. */
function normalizar(txt: string): string {
  return txt.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
}

function pedidoDe(p: URLSearchParams) {
  const concelho = (p.get("concelho") ?? "").trim().slice(0, 80);
  const zona = ((p.get("zona") ?? p.get("freguesia") ?? "").trim().slice(0, 120)) || concelho;
  let tipo = tipoDe(p.get("tipo"));
  const tipologia = tipologiaDe(p.get("tipologia"));
  // Na base, uma linha de tipologia tem sempre tipo (apartamento ou
  // moradia); não há «T3 de tudo». Pedir T3 sem tipo cairia na linha
  // geral e o pedido ficava por responder sem aviso. Assume-se
  // apartamento, e diz-se. Moradias pedem-se por extenso.
  let tipo_assumido = false;
  if (tipologia && !tipo) { tipo = "apartamento"; tipo_assumido = true; }
  return { zona, concelho: concelho || null, tipo, tipologia, tipo_assumido };
}

/**
 * imo_geo_por_nome cai no concelho quando não reconhece a zona. Para o
 * site é o comportamento certo (a avaliação segue); para uma ferramenta
 * que perguntou por «Narnia» é uma resposta errada com ar de certa. Quando
 * a zona pedida é outra que não o concelho e a resolução deu o concelho,
 * é «zona desconhecida».
 */
function caiuNoConcelho(pedidoZona: string, concelho: string | null, geo: { nivel: string | null; zona: string | null }): boolean {
  if (!pedidoZona || geo.nivel !== "concelho" || !geo.zona) return false;
  const pedida = normalizar(pedidoZona);
  if (pedida === normalizar(geo.zona)) return false;
  if (concelho && pedida === normalizar(concelho)) return false;
  return true;
}

// ---------------------------------------------------------------------
// GET /fontes
// ---------------------------------------------------------------------
async function fontes(): Promise<Saida> {
  const { data } = await db.from("imo_fontes")
    .select("id, nome, tipo, escalao, licenca, saida_para_cliente, redistribuicao, atribuicao_obrigatoria, notas, ativo")
    .order("escalao");
  return {
    status: 200,
    cache: "private, max-age=3600",
    corpo: {
      ok: true,
      dados: (data ?? []).map((f) => ({
        id: f.id, nome: f.nome, natureza: f.tipo, escalao: f.escalao,
        entra_no_calculo: f.escalao === 1,
        licenca: f.licenca, publicavel: !!f.saida_para_cliente,
        redistribuicao: !!f.redistribuicao,
        atribuicao: f.atribuicao_obrigatoria ?? null, ativo: f.ativo,
      })),
      licenca: { regras: REGRAS },
    },
  };
}

// ---------------------------------------------------------------------
// GET /zonas?concelho=
// ---------------------------------------------------------------------
async function zonas(p: URLSearchParams): Promise<Saida> {
  const concelho = (p.get("concelho") ?? "").trim().slice(0, 80) || null;
  const { data, error } = await db.rpc("imo_api_zonas", { p_concelho: concelho });
  if (error) throw new Error(`imo_api_zonas: ${error.message}`);
  const linhas = (data ?? []) as Registo[];
  const fontesVistas = linhas.map((z) => z.fonte as string | null);
  return {
    status: 200,
    cache: "private, max-age=3600",
    fonte: fontesVistas.find(Boolean) ?? null,
    corpo: {
      ok: true,
      dados: {
        concelho,
        total: linhas.length,
        com_dados: linhas.filter((z) => z.eur_m2 != null).length,
        zonas: linhas.map((z) => ({
          geografia_id: z.geografia_id, nivel: z.nivel, zona: z.zona, concelho: z.concelho, dicofre: z.dicofre ?? null,
          fonte: z.fonte ?? null, periodo: z.periodo ?? null, periodo_fim: z.periodo_fim ?? null,
          eur_m2: num(z.eur_m2), p25: num(z.p25), p75: num(z.p75), n_transacoes: z.n_transacoes ?? null,
          cobertura_bbox: num(z.cobertura_bbox), tipologias: (z.tipologias as string[] | null) ?? [],
        })),
      },
      licenca: await blocoLicenca(fontesVistas),
    },
  };
}

// ---------------------------------------------------------------------
// GET /mercado?zona=&concelho=&tipo=&tipologia=[&vendas=1]
// ---------------------------------------------------------------------
async function mercado(p: URLSearchParams, f: Ferramenta): Promise<Saida> {
  const pedido = pedidoDe(p);
  if (!pedido.zona) {
    return { status: 400, corpo: erroCorpo("faltam_parametros", "Indica zona e/ou concelho. Ex: ?zona=Carnaxide e Queijas&concelho=Oeiras&tipologia=T3") };
  }
  const geo = await geografiaDe(pedido.zona, pedido.concelho);
  if (!geo || caiuNoConcelho(pedido.zona, pedido.concelho, geo)) {
    return { status: 404, corpo: erroCorpo("zona_desconhecida", `Não conheço «${pedido.zona}»${pedido.concelho ? ` em ${pedido.concelho}` : ""}. Vê GET /zonas?concelho=… para os nomes que existem.`) };
  }

  const [rBench, rGeral] = await Promise.all([
    db.rpc("imo_benchmark", { p_geografia: geo.id, p_tipo: pedido.tipo, p_tipologia: pedido.tipologia }),
    db.rpc("imo_benchmark", { p_geografia: geo.id, p_tipo: "", p_tipologia: "" }),
  ]);
  // Um erro da base é uma avaria nossa, não «zona sem dados». Sobe ao
  // catch e sai como 500 sem cache; engoli-lo dava um 200 «sem benchmark»
  // guardado uma hora.
  if (rBench.error) throw new Error(`imo_benchmark: ${rBench.error.message}`);
  if (rGeral.error) throw new Error(`imo_benchmark(geral): ${rGeral.error.message}`);
  const b = (Array.isArray(rBench.data) ? rBench.data[0] : null) as Registo | null;
  const bg = (Array.isArray(rGeral.data) ? rGeral.data[0] : null) as Registo | null;

  const [extra, extraGeral] = await Promise.all([extraDe(b?.benchmark_id), bg && bg.benchmark_id !== b?.benchmark_id ? extraDe(bg.benchmark_id) : Promise.resolve(null)]);
  // A série da LINHA ESCOLHIDA. A RPC diz qual foi em tipo_benchmark e
  // tipologia_benchmark (0113); não devolve tipo_imovel nem tipologia, e
  // ler esses dava sempre a série da linha geral por baixo de um
  // benchmark de T3.
  const serie = b ? await serieDe(String(b.geografia_id), String(b.tipo_benchmark ?? ""), String(b.tipologia_benchmark ?? ""), String(b.fonte_id)) : [];

  let vendas: unknown[] | undefined;
  if (p.get("vendas") === "1") {
    if (!f.permite_vendas_terrae) {
      return { status: 403, corpo: erroCorpo("vendas_nao_permitidas", "Esta chave não pode ver as vendas da Terrae.", true) };
    }
    const { data } = await db.from("imo_transacoes")
      .select("referencia, tipo, tipologia, area, preco_transacao, data_transacao, caracteristicas")
      .eq("geografia_id", geo.id)
      .eq("natureza", "escritura")
      .order("data_transacao", { ascending: false })
      .limit(20);
    vendas = data ?? [];
  }

  return {
    status: 200,
    cache: "private, max-age=3600",
    fonte: (b?.fonte_id as string | undefined) ?? null,
    corpo: {
      ok: true,
      dados: {
        pedido,
        geografia: geo,
        benchmark: b ? formaBenchmark(b, extra, pedido) : null,
        // A linha de todas as tipologias da mesma zona, quando é outra: é
        // com ela que se lê «o T3 vale 0,92 da mistura». SÓ se for da
        // mesma fonte, período e sítio: uma proporção entre o T3 do
        // MicroSIR (agosto) e o geral do SIR em PDF (junho) é um número
        // inventado pela mistura, não medido. `geral_comparavel` di-lo.
        geral: bg && bg.benchmark_id !== b?.benchmark_id ? formaBenchmark(bg, extraGeral, { tipo: "", tipologia: "" }) : null,
        geral_comparavel: !!(b && bg && bg.benchmark_id !== b.benchmark_id &&
          bg.fonte_id === b.fonte_id && bg.periodo === b.periodo && bg.geografia_id === b.geografia_id),
        serie,
        ...(vendas !== undefined ? { vendas_terrae: vendas } : {}),
        nota: !b
          ? "Sem benchmark de transação para esta zona, mesmo a subir na hierarquia. O motor do site usa o INE neste caso."
          : extra?.derivado
          ? "Valor DERIVADO pela Terrae (mediana das zonas publicadas pelo SIR), não uma publicação da IMOESTATÍSTICA. Cita-se como estimativa da Terrae."
          : null,
      },
      licenca: await blocoLicenca([b?.fonte_id as string, bg?.fonte_id as string]),
    },
  };
}

// ---------------------------------------------------------------------
// GET /serie?zona=&concelho=&tipo=&tipologia=
// ---------------------------------------------------------------------
async function serie(p: URLSearchParams): Promise<Saida> {
  const pedido = pedidoDe(p);
  if (!pedido.zona) return { status: 400, corpo: erroCorpo("faltam_parametros", "Indica zona e/ou concelho.") };
  const geo = await geografiaDe(pedido.zona, pedido.concelho);
  if (!geo || caiuNoConcelho(pedido.zona, pedido.concelho, geo)) {
    return { status: 404, corpo: erroCorpo("zona_desconhecida", `Não conheço «${pedido.zona}». Vê GET /zonas.`) };
  }
  const pontos = await serieDe(geo.id, pedido.tipo, pedido.tipologia);
  const porFonte: Record<string, unknown[]> = {};
  for (const s of pontos) (porFonte[s.fonte] ??= []).push(s);
  return {
    status: 200,
    cache: "private, max-age=3600",
    fonte: pontos[0]?.fonte ?? null,
    corpo: {
      ok: true,
      dados: {
        pedido, geografia: geo,
        // Ao nível EXACTO pedido, sem subir na hierarquia: uma série que
        // muda de zona a meio mente sobre o mercado.
        series: porFonte,
        nota: pontos.length ? null : "Sem série a este nível para este tipo/tipologia. Tenta sem tipologia, ou a zona de cima.",
      },
      licenca: await blocoLicenca(Object.keys(porFonte)),
    },
  };
}

// ---------------------------------------------------------------------
// GET /codigo-postal?cp7=
// ---------------------------------------------------------------------
async function codigoPostal(cpBruto: unknown, f: Ferramenta): Promise<Saida> {
  const cp = cp7De(cpBruto);
  if (!cp) return { status: 400, corpo: erroCorpo("cp7_invalido", "Indica um código postal de sete dígitos, ex: ?cp7=2790-008") };

  const [rConsulta, rArea] = await Promise.all([
    db.rpc("imo_cp_consulta", { p_cp7: cp }),
    db.from("imo_cp_areas")
      .select("cp7, estado, raio_m, amostra, meses, eur_m2_medio, eur_m2_p25, eur_m2_p75, escada, colhido_em, valida_ate, tentativas, ultimo_erro")
      .eq("cp7", cp).maybeSingle(),
  ]);
  if (rConsulta.error) throw new Error(`imo_cp_consulta: ${rConsulta.error.message}`);
  if (rArea.error) throw new Error(`imo_cp_areas: ${rArea.error.message}`);
  const consulta = rConsulta.data;
  const a = rArea.data;
  const s = (Array.isArray(consulta) ? consulta[0] : consulta) as Registo | null;
  const sitio = s
    ? {
      cp7: s.r_cp7, concelho: s.r_concelho, distrito: s.r_distrito, localidade: s.r_localidade,
      designacao: s.r_designacao,
      zona: (s.r_freguesia as string | null) || (s.r_designacao as string),
      zona_e_freguesia: !!s.r_freguesia,
      ruas: (s.r_ruas as string[] | null) ?? [],
    }
    : null;

  // A área local: os 300 a 2 000 m à volta deste código postal, quando já
  // foi colhida e ainda está dentro da validade (90 dias).
  let areaLocal: Registo;
  // Só «ok», dentro da validade (90 dias) e com a amostra mínima que a
  // licença e o motor exigem. Abaixo de 30 a área não se serve, seja
  // qual for o estado gravado.
  const valida = a?.estado === "ok" && (!a.valida_ate || new Date(a.valida_ate as string) > new Date()) && Number(a.amostra) >= AMOSTRA_MINIMA;
  if (a && valida) {
    areaLocal = {
      estado: "ok", fonte: "sir-micro",
      raio_m: a.raio_m, amostra: a.amostra, meses: a.meses,
      eur_m2: num(a.eur_m2_medio), p25: num(a.eur_m2_p25), p75: num(a.eur_m2_p75),
      colhido_em: a.colhido_em, valida_ate: a.valida_ate,
      natureza: "transacao", area_base: "bruta privativa",
      escada: escadaPublica(a.escada),
    };
  } else if (a) {
    const esgotado = a.estado === "erro" && Number(a.tentativas) >= 3;
    const estado = a.estado === "ok"
      ? (Number(a.amostra) >= AMOSTRA_MINIMA ? "caducada" : "amostra_insuficiente")
      : esgotado ? "esgotado" : a.estado;
    const notas: Record<string, string> = {
      pendente: "Está na fila. A corrida diária do MicroSIR colhe-o com um único login; volta amanhã.",
      erro: "Falhou numa corrida e volta à fila na próxima (até 3 tentativas).",
      esgotado: "Esgotou as 3 tentativas e não volta à fila sem intervenção. Usa o mercado da zona.",
      sem_area: "Nem a 2 km havia 30 transações. Usa o mercado da zona.",
      caducada: "A área caducou (validade de 90 dias). POST /fila renova-a; até lá usa o mercado da zona.",
      amostra_insuficiente: "A área colhida tem menos de 30 transações e não se serve. Usa o mercado da zona.",
    };
    areaLocal = {
      estado, tentativas: a.tentativas, ultimo_erro: a.ultimo_erro ?? null,
      nota: notas[estado] ?? "Sem área servível. Usa o mercado da zona.",
    };
  } else {
    areaLocal = {
      estado: "nao_pedido",
      nota: f.permite_enfileirar
        ? "Ainda não foi pedido. POST /fila com {\"cp7\"} põe-no na fila; a corrida diária colhe-o."
        : "Ainda não foi pedido. Uma avaliação no site, ou uma chave com permissão de fila, pede-o.",
    };
  }

  // O mercado da zona deste código postal, para a leitura não ficar sem
  // chão quando a área local ainda não existe.
  let mercadoZona: Registo | null = null;
  let geo: { id: string; nivel: string | null; zona: string | null } | null = null;
  if (sitio) {
    geo = await geografiaDe(String(sitio.zona), String(sitio.concelho));
    if (geo) {
      const { data: bench, error } = await db.rpc("imo_benchmark", { p_geografia: geo.id, p_tipo: "", p_tipologia: "" });
      if (error) throw new Error(`imo_benchmark: ${error.message}`);
      const b = (Array.isArray(bench) ? bench[0] : null) as Registo | null;
      if (b) mercadoZona = formaBenchmark(b, await extraDe(b.benchmark_id), { tipo: "", tipologia: "" });
    }
  }

  return {
    status: 200,
    cache: "private, max-age=600",
    fonte: valida ? "sir-micro" : ((mercadoZona?.fonte as string | undefined) ?? null),
    corpo: {
      ok: true,
      dados: {
        cp7: cp,
        sitio,
        geografia: geo,
        area_local: areaLocal,
        mercado_zona: mercadoZona,
        nota: sitio ? null : "Código postal fora do ficheiro dos CTT (apartado, grande cliente, ou inexistente).",
      },
      licenca: await blocoLicenca([valida ? "sir-micro" : null, mercadoZona?.fonte as string | undefined]),
    },
  };
}

// ---------------------------------------------------------------------
// GET /fila
// ---------------------------------------------------------------------
async function filaEstado(): Promise<Saida> {
  // Contagens no servidor. Ler as linhas todas e contar aqui parecia
  // simples, mas o PostgREST corta em 1 000 linhas e a contagem mentia a
  // partir daí.
  const contar = (filtro: (q: ReturnType<typeof db.from>) => unknown) => {
    const q = db.from("imo_cp_areas");
    return (filtro(q) as unknown as PromiseLike<{ count: number | null; error: { message: string } | null }>);
  };
  const agora = new Date().toISOString();
  const estados = ["pendente", "ok", "sem_area", "erro"] as const;
  const [porEstado, semCoord, caduc, ultimos] = await Promise.all([
    Promise.all(estados.map((e) => contar((q) => q.select("cp7", { count: "exact", head: true }).eq("estado", e)))),
    contar((q) => q.select("cp7", { count: "exact", head: true }).in("estado", ["pendente", "erro"]).is("lat", null)),
    contar((q) => q.select("cp7", { count: "exact", head: true }).eq("estado", "ok").lt("valida_ate", agora)),
    db.from("imo_cp_areas").select("cp7, raio_m, amostra, colhido_em").eq("estado", "ok")
      .order("colhido_em", { ascending: false }).limit(5),
  ]);
  const contagem: Record<string, number> = {};
  estados.forEach((e, i) => {
    if (porEstado[i].error) throw new Error(`imo_cp_areas: ${porEstado[i].error!.message}`);
    contagem[e] = porEstado[i].count ?? 0;
  });
  if (semCoord.error) throw new Error(`imo_cp_areas: ${semCoord.error.message}`);
  if (caduc.error) throw new Error(`imo_cp_areas: ${caduc.error.message}`);
  if (ultimos.error) throw new Error(`imo_cp_areas: ${ultimos.error.message}`);
  const semCoordenadas = semCoord.count ?? 0;
  const caducadas = caduc.count ?? 0;
  return {
    status: 200,
    cache: "no-store",
    corpo: {
      ok: true,
      dados: {
        contagem,
        pendentes_sem_coordenadas: semCoordenadas,
        ok_caducadas: caducadas,
        ultimos_colhidos: ultimos.data ?? [],
        corrida: "diária, 09:00 Europe/Lisbon, até 40 códigos postais por corrida, um login no MicroSIR",
      },
      licenca: { regras: REGRAS },
    },
  };
}

// ---------------------------------------------------------------------
// POST /fila {"cp7":"…"}
// ---------------------------------------------------------------------
async function enfileirar(corpo: Registo, f: Ferramenta): Promise<Saida> {
  const cp = cp7De(corpo?.cp7 ?? corpo?.cp ?? corpo?.codigo_postal);
  if (!cp) return { status: 400, corpo: erroCorpo("cp7_invalido", "Indica {\"cp7\":\"2790-008\"}.") };

  // O ficheiro dos CTT é a lista fechada do que existe. Um código postal
  // que lá não esteja não vai para a fila: ocupava um lugar na corrida
  // diária para sempre, sem coordenadas e sem sítio.
  const { data: consulta, error: eC } = await db.rpc("imo_cp_consulta", { p_cp7: cp });
  if (eC) throw new Error(`imo_cp_consulta: ${eC.message}`);
  const s = (Array.isArray(consulta) ? consulta[0] : consulta) as Registo | null;
  if (!s) return { status: 404, corpo: erroCorpo("cp7_desconhecido", `O código postal ${cp} não está no ficheiro dos CTT. Não vai para a fila.`, true) };

  // Já existe? Só «pendente», «erro» com tentativas por gastar e «ok»
  // caducada voltam à fila. «sem_area» e «erro» esgotado são resultados,
  // não esperas: a corrida diária nunca os apanha, e dizer «volta amanhã»
  // era uma promessa falsa.
  const { data: antes, error: eA } = await db.from("imo_cp_areas")
    .select("estado, tentativas, raio_m, amostra, eur_m2_medio, colhido_em, valida_ate").eq("cp7", cp).maybeSingle();
  if (eA) throw new Error(`imo_cp_areas: ${eA.message}`);
  if (antes?.estado === "sem_area") {
    return { status: 200, cache: "no-store", corpo: { ok: true, dados: { cp7: cp, estado: "sem_area", nota: "Nem a 2 km havia 30 transações. Não volta à fila; usa o mercado da zona." }, licenca: { regras: REGRAS } } };
  }
  if (antes?.estado === "erro" && Number(antes.tentativas) >= 3) {
    return { status: 200, cache: "no-store", corpo: { ok: true, dados: { cp7: cp, estado: "esgotado", tentativas: antes.tentativas, nota: "Esgotou as 3 tentativas e não volta à fila sem intervenção do Sandro." }, licenca: { regras: REGRAS } } };
  }

  // Quantos códigos postais NOVOS esta chave já pôs na fila hoje. É a
  // corrida diária que paga cada um (até 40 por dia para toda a casa), por
  // isso o tecto por chave é pequeno e não se confunde com o limite geral.
  const novo = !antes;
  if (novo) {
    const { data: n, error: eN } = await db.rpc("ai_rate_bump", { p_scope: "key", p_scope_key: `imo:fila:${f.id}`, p_window_seconds: 86400 });
    if (eN) console.error(`imo-api: contador da fila falhou: ${eN.message}`);
    if ((n as number | null ?? 0) > FILA_MAX_DIA) {
      return { status: 429, corpo: erroCorpo("limite_fila_dia", `Esta chave já pôs ${FILA_MAX_DIA} códigos postais novos na fila hoje.`, true) };
    }
  }

  const geo = await geografiaDe(String((s.r_freguesia as string | null) || s.r_designacao), String(s.r_concelho));
  // A mesma função que o site usa: insere «pendente» se não existir,
  // reenfileira uma «ok» caducada, devolve a área se já estiver colhida.
  // As coordenadas vêm depois, da cache do GISCO, na corrida diária
  // (scripts/imo-cp-fila.mjs).
  const { error } = await db.rpc("imo_cp_area", { p_cp7: cp, p_lat: null, p_lng: null, p_geografia: geo?.id ?? null });
  if (error) throw new Error(`imo_cp_area: ${error.message}`);

  const { data: a, error: eD } = await db.from("imo_cp_areas").select("estado, raio_m, amostra, eur_m2_medio, colhido_em, valida_ate").eq("cp7", cp).maybeSingle();
  if (eD) throw new Error(`imo_cp_areas: ${eD.message}`);
  const pronto = a?.estado === "ok" && Number(a.amostra) >= AMOSTRA_MINIMA;
  return {
    status: pronto ? 200 : 202,
    cache: "no-store",
    fonte: pronto ? "sir-micro" : null,
    corpo: {
      ok: true,
      dados: {
        cp7: cp,
        estado: a?.estado ?? "pendente",
        ...(pronto ? { raio_m: a!.raio_m, amostra: a!.amostra, eur_m2: num(a!.eur_m2_medio), colhido_em: a!.colhido_em, valida_ate: a!.valida_ate } : {}),
        nota: pronto
          ? "Já tinha área. GET /codigo-postal?cp7=… dá o resto."
          : "Na fila. A corrida diária (09:00) colhe-o; GET /codigo-postal?cp7=… mostra quando estiver.",
      },
      licenca: await blocoLicenca([pronto ? "sir-micro" : null]),
    },
  };
}

// ---------------------------------------------------------------------
// o servidor
// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  const t0 = Date.now();
  const requestId = crypto.randomUUID();
  const url = new URL(req.url);
  const caminho = url.pathname.replace(/^\/imo-api/, "").replace(/\/+$/, "") || "/";
  const origem = req.headers.get("origin");

  const responder = (status: number, corpo: Record<string, unknown>, extra: Record<string, string> = {}, permitida = false) =>
    Response.json({ ...corpo, meta: { request_id: requestId, versao: VERSAO, ms: Date.now() - t0, ...(corpo.meta as Registo ?? {}) } }, {
      status,
      headers: { ...corsDe(origem, permitida), "x-request-id": requestId, "cache-control": "no-store", ...extra },
    });

  // Preflight: o browser ainda não manda a chave; a origem é verificada
  // no pedido a sério.
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsDe(origem, true) });

  if (caminho === "/saude" && req.method === "GET") {
    return responder(200, { ok: true, servico: "imo-api", versao: VERSAO, hora: new Date().toISOString() });
  }
  if (caminho === "/" && req.method === "GET") {
    return responder(200, {
      ok: true, servico: "imo-api", versao: VERSAO,
      endpoints: ["GET /saude", "GET /fontes", "GET /zonas?concelho=", "GET /mercado?zona=&concelho=&tipo=&tipologia=", "GET /serie?zona=&concelho=&tipo=&tipologia=", "GET /codigo-postal?cp7=", "GET /fila", "POST /fila {cp7}"],
      autenticacao: "Authorization: Bearer imo_… (ou X-Imo-Key)",
    });
  }

  // ---- quem pede -----------------------------------------------------
  const chave = chaveDe(req);
  if (!chave) {
    return responder(401, erroCorpo("sem_chave", "Falta a chave da ferramenta: Authorization: Bearer imo_… (ou o header X-Imo-Key).", true), { "www-authenticate": "Bearer" });
  }
  const { data: fRow } = await db.from("imo_ferramentas")
    .select("id, nome, ativo, allowed_origins, permite_vendas_terrae, permite_enfileirar, limite_minuto, limite_dia")
    .eq("chave_hash", await sha256Hex(chave)).maybeSingle();
  const f = fRow as Ferramenta | null;
  if (!f || !f.ativo) {
    return responder(401, erroCorpo("chave_invalida", "Chave desconhecida ou revogada.", true));
  }

  // Um pedido com Origin é um browser. Só passa se a chave declarar essa
  // origem; uma chave de servidor não tem que ver com browsers.
  const origemPermitida = !!origem && (f.allowed_origins ?? []).includes(origem);
  if (origem && !origemPermitida) {
    return responder(403, erroCorpo("origem_nao_autorizada", `A origem ${origem} não está autorizada para esta chave.`, true));
  }

  const registar = (endpoint: string, parametros: Registo, fonte: string | null, status: number) =>
    emSegundoPlano(db.rpc("imo_api_registar", {
      p_ferramenta: f.id, p_request_id: requestId, p_endpoint: endpoint,
      p_parametros: parametros, p_fonte: fonte, p_status: status, p_ms: Date.now() - t0,
    }));

  // ---- quanto pode pedir --------------------------------------------
  //
  // O contador é o do N5 AI OS (ai_rate_bump, 0072): janelas alinhadas e
  // atómicas. O scope tem de ser um dos que a tabela aceita ('key' serve:
  // é uma chave); a ferramenta vai no scope_key. Se o contador falhar,
  // deixa-se passar e escreve-se no registo: um limite que rebenta a API
  // inteira protege menos do que um limite que falha aberto uma vez.
  const [rMinuto, rDia] = await Promise.all([
    db.rpc("ai_rate_bump", { p_scope: "key", p_scope_key: `imo:${f.id}`, p_window_seconds: 60 }),
    db.rpc("ai_rate_bump", { p_scope: "key", p_scope_key: `imo:${f.id}`, p_window_seconds: 86400 }),
  ]);
  if (rMinuto.error || rDia.error) {
    console.error(`imo-api ${requestId}: contador de limites falhou: ${rMinuto.error?.message ?? rDia.error?.message}`);
  }
  const nMinuto = rMinuto.data as number | null;
  const nDia = rDia.data as number | null;
  if ((nMinuto ?? 0) > f.limite_minuto) {
    registar(caminho, {}, null, 429);
    return responder(429, erroCorpo("limite_minuto", `Mais de ${f.limite_minuto} pedidos por minuto para esta chave.`, true), { "retry-after": "60" }, origemPermitida);
  }
  if ((nDia ?? 0) > f.limite_dia) {
    registar(caminho, {}, null, 429);
    return responder(429, erroCorpo("limite_dia", `Mais de ${f.limite_dia} pedidos hoje para esta chave.`, true), { "retry-after": "3600" }, origemPermitida);
  }

  // ---- o pedido ------------------------------------------------------
  const p = url.searchParams;
  const parametros: Registo = {};
  for (const k of ["concelho", "zona", "freguesia", "tipo", "tipologia", "cp7", "vendas"]) {
    const v = p.get(k);
    if (v) parametros[k] = v.slice(0, 120);
  }

  try {
    let saida: Saida;
    if (req.method === "GET" && caminho === "/fontes") saida = await fontes();
    else if (req.method === "GET" && caminho === "/zonas") saida = await zonas(p);
    else if (req.method === "GET" && caminho === "/mercado") saida = await mercado(p, f);
    else if (req.method === "GET" && caminho === "/serie") saida = await serie(p);
    else if (req.method === "GET" && caminho.startsWith("/codigo-postal")) {
      const daRota = caminho.split("/")[2];
      const cp = p.get("cp7") ?? p.get("cp") ?? daRota ?? null;
      if (cp) parametros.cp7 = cp.slice(0, 20);
      saida = await codigoPostal(cp, f);
    } else if (req.method === "GET" && caminho === "/fila") saida = await filaEstado();
    else if (req.method === "POST" && caminho === "/fila") {
      const tamanho = Number(req.headers.get("content-length") ?? 0);
      // A permissão decide-se antes de ler o corpo: um 403 não precisa de
      // ler nada.
      if (!f.permite_enfileirar) saida = { status: 403, corpo: erroCorpo("fila_nao_permitida", "Esta chave não pode pôr códigos postais na fila.", true) };
      else if (tamanho > 4096) saida = { status: 413, corpo: erroCorpo("corpo_grande", "O corpo só precisa do cp7.") };
      else {
        const corpo = await req.json().catch(() => ({})) as Registo;
        if (corpo?.cp7) parametros.cp7 = String(corpo.cp7).slice(0, 20);
        saida = await enfileirar(corpo, f);
      }
    } else {
      saida = { status: 404, corpo: erroCorpo("nao_encontrado", `Não há ${req.method} ${caminho}. Vê GET /imo-api para a lista.`) };
    }

    registar(caminho, parametros, saida.fonte ?? null, saida.status);
    return responder(saida.status, saida.corpo, saida.cache ? { "cache-control": saida.cache } : {}, origemPermitida);
  } catch (e) {
    // Avaria nossa: não é «zona sem dados», é «camada em baixo». O código
    // di-lo, e a mensagem do Postgres fica no registo, não na resposta.
    console.error(`imo-api ${requestId} ${caminho}: ${(e as Error)?.message ?? e}`);
    registar(caminho, parametros, null, 500);
    return responder(500, erroCorpo("falha_interna", "A camada de dados falhou neste pedido. Tenta outra vez; se persistir, manda o request_id."), {}, origemPermitida);
  }
});
