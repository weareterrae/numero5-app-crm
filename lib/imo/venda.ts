/**
 * Validação de uma venda real antes de entrar na base.
 *
 * PORQUE É QUE ISTO MERECE VALIDAÇÃO A SÉRIO
 *
 * Uma venda real da Terrae não é mais um comparável. O motor ancora nela
 * com até 50% do peso, porque é a única coisa na base que descreve o que
 * alguém realmente pagou, e não o que alguém pediu. Um zero a mais numa
 * venda desloca as avaliações daquela zona durante meses, e não dá erro
 * nenhum — o valor sai mais alto e parece plausível.
 *
 * É por isso que aqui se separa o IMPOSSÍVEL do INVULGAR:
 *
 *   impossível → recusa. 300 €/m² não é uma casa; é um engano.
 *   invulgar   → passa, mas obriga a confirmar. Há moradias a 12.000 €/m²
 *                e recusá-las seria pior do que aceitá-las: é justamente
 *                nesse produto raro que o motor mais erra e mais precisa
 *                de ser calibrado.
 *
 * O caso que ensinou isto está na base: uma moradia em Carnaxide vendida
 * por 2.358.000 € que o motor avaliava em 1.475.000 €. Um erro de 37% que
 * só uma venda real apanha — e que uma validação demasiado zelosa teria
 * rejeitado por «cara de mais».
 */

export type VendaCrua = {
  referencia?: string;
  tipo?: string;
  tipologia?: string;
  zona?: string;
  concelho?: string;
  area?: number | string;
  lote?: number | string;
  ano?: number | string;
  estado?: string;
  caracteristicas?: string[] | string;
  preco_inicial?: number | string;
  preco_final_pedido?: number | string;
  preco_transacao?: number | string;
  data_anuncio?: string;
  data_transacao?: string;
  n_visitas?: number | string;
  n_propostas?: number | string;
  notas?: string;
};

export type Aviso = { campo: string; texto: string };

export type Validacao =
  | { ok: true; venda: VendaLimpa; avisos: Aviso[] }
  | { ok: false; erros: Aviso[]; avisos: Aviso[] };

export type VendaLimpa = {
  referencia: string | null;
  tipo: string | null;
  tipologia: string | null;
  zona: string;
  concelho: string;
  area: number;
  lote: number | null;
  ano: number | null;
  estado: string | null;
  caracteristicas: string[];
  preco_inicial: number | null;
  preco_final_pedido: number | null;
  preco_transacao: number;
  data_anuncio: string | null;
  data_transacao: string;
  dias_mercado: number | null;
  n_visitas: number | null;
  n_propostas: number | null;
  notas: string | null;
  eur_m2: number;
};

/** Aceita «350.000», «350000», «350 000 €», 350000. */
export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const limpo = v.replace(/[€\s ]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  // `Number("")` é 0, e 0 é uma AFIRMAÇÃO — num lote diria «não tem
  // terreno» em vez de «não se sabe». Vazio tem de ser nulo.
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

// Fora destes limites não é uma casa em Portugal — é um engano de dedo.
const EUR_M2_IMPOSSIVEL_MIN = 200;
const EUR_M2_IMPOSSIVEL_MAX = 30_000;
// Dentro destes, ninguém pergunta nada.
const EUR_M2_NORMAL_MIN = 800;
const EUR_M2_NORMAL_MAX = 12_000;

const texto = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

/**
 * @param hoje data de referência, injetada para o resultado não depender
 *   do relógio — a mesma venda tem de validar igual em qualquer dia.
 */
export function validarVenda(cru: VendaCrua, hoje: Date): Validacao {
  const erros: Aviso[] = [];
  const avisos: Aviso[] = [];

  const area = numero(cru.area);
  const preco = numero(cru.preco_transacao);
  const zona = texto(cru.zona);
  const concelho = texto(cru.concelho);
  const dataT = texto(cru.data_transacao);

  // ---- o que não pode faltar ----------------------------------------
  // Sem estes quatro, a venda não descreve nada: não se sabe quanto, de
  // que tamanho, onde, nem quando. Guardá-la assim seria guardar ruído.
  if (!area || area <= 5) erros.push({ campo: "area", texto: "Área em falta ou impossível." });
  if (!preco || preco <= 1000) erros.push({ campo: "preco_transacao", texto: "Preço de escritura em falta." });
  if (!concelho) erros.push({ campo: "concelho", texto: "Concelho em falta — sem ele não há onde pousar a venda." });
  if (!dataT) erros.push({ campo: "data_transacao", texto: "Data da escritura em falta." });

  let dt: Date | null = null;
  if (dataT) {
    dt = new Date(dataT);
    if (Number.isNaN(dt.getTime())) {
      erros.push({ campo: "data_transacao", texto: "Data da escritura ilegível." });
      dt = null;
    } else if (dt.getTime() > hoje.getTime()) {
      erros.push({ campo: "data_transacao", texto: "A escritura está no futuro." });
    }
  }

  // ---- o €/m², que é onde os enganos de dedo aparecem ----------------
  let eurM2 = 0;
  if (area && preco && area > 5) {
    eurM2 = Math.round(preco / area);
    if (eurM2 < EUR_M2_IMPOSSIVEL_MIN || eurM2 > EUR_M2_IMPOSSIVEL_MAX) {
      erros.push({
        campo: "preco_transacao",
        texto: `${eurM2.toLocaleString("pt-PT")} €/m² não é possível. ` +
          `Confirme o preço (${preco.toLocaleString("pt-PT")} €) e a área (${area} m²).`,
      });
    } else if (eurM2 < EUR_M2_NORMAL_MIN || eurM2 > EUR_M2_NORMAL_MAX) {
      avisos.push({
        campo: "preco_transacao",
        texto: `${eurM2.toLocaleString("pt-PT")} €/m² é invulgar. Se está certo, confirme — ` +
          `é neste produto raro que o motor mais erra e mais precisa desta venda.`,
      });
    }
  }

  // ---- coerência entre os três preços --------------------------------
  const pIni = numero(cru.preco_inicial);
  const pFim = numero(cru.preco_final_pedido);
  if (pIni && preco && pIni < preco) {
    avisos.push({
      campo: "preco_inicial",
      texto: "Vendeu ACIMA do preço inicial. Acontece, mas é raro — confirme.",
    });
  }
  if (pIni && pFim && pFim > pIni) {
    avisos.push({ campo: "preco_final_pedido", texto: "O último pedido é maior do que o inicial." });
  }

  // ---- dias de mercado: calculado, nunca escrito à mão ---------------
  // É uma subtração entre duas datas. Deixá-lo escrever é convidar a que
  // não bata certo com as datas que estão ao lado dele.
  let dias: number | null = null;
  const dataA = texto(cru.data_anuncio);
  if (dataA && dt) {
    const da = new Date(dataA);
    if (!Number.isNaN(da.getTime())) {
      dias = Math.round((dt.getTime() - da.getTime()) / 86_400_000);
      if (dias < 0) {
        erros.push({ campo: "data_anuncio", texto: "O anúncio é posterior à escritura." });
        dias = null;
      }
    }
  }

  if (!texto(cru.tipo)) avisos.push({ campo: "tipo", texto: "Sem tipo, a venda serve para menos comparações." });
  if (!texto(cru.tipologia)) avisos.push({ campo: "tipologia", texto: "Sem tipologia, a venda serve para menos comparações." });
  if (!zona) avisos.push({ campo: "zona", texto: "Sem zona, fica atribuída ao concelho inteiro — menos preciso." });

  if (erros.length) return { ok: false, erros, avisos };

  const caract = Array.isArray(cru.caracteristicas)
    ? cru.caracteristicas.map((c) => String(c).trim()).filter(Boolean)
    : String(cru.caracteristicas ?? "").split(",").map((c) => c.trim()).filter(Boolean);

  return {
    ok: true,
    avisos,
    venda: {
      referencia: texto(cru.referencia),
      tipo: texto(cru.tipo),
      tipologia: texto(cru.tipologia),
      zona: zona ?? concelho!,
      concelho: concelho!,
      area: area!,
      lote: numero(cru.lote),
      ano: numero(cru.ano),
      estado: texto(cru.estado),
      caracteristicas: caract,
      preco_inicial: pIni,
      preco_final_pedido: pFim,
      preco_transacao: preco!,
      data_anuncio: dataA,
      data_transacao: dataT!,
      dias_mercado: dias,
      n_visitas: numero(cru.n_visitas),
      n_propostas: numero(cru.n_propostas),
      notas: texto(cru.notas),
      eur_m2: eurM2,
    },
  };
}
