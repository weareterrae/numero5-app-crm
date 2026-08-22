/**
 * Lê os números de um relatório Micro-SIR (PDF).
 *
 * O SIR não tem API e não exporta tabelas — exporta um relatório em PDF.
 * Isto lê o ficheiro que o utilizador exportou legitimamente da
 * plataforma. Não há automação de sessão, nem endpoints internos, nem
 * scraping: é um ficheiro no disco dele.
 *
 * COMO FUNCIONA, E PORQUÊ ASSIM
 *
 * O PDF traz o texto com coordenadas. Nesta página as etiquetas e os
 * valores estão em pares verticais — «PERCENTIL 25» em y=341 e «3 922 €»
 * logo abaixo em y=350, na mesma coluna. Emparelha-se por posição, não
 * por ordem de leitura: a ordem em que o texto sai de um PDF não é a
 * ordem em que se vê, e assumir isso seria trocar valores em silêncio.
 *
 * Há DUAS colunas de números com as mesmas etiquetas: €/m² à esquerda
 * (x≈227) e preço por fogo à direita (x≈345). Distinguem-se pela posição
 * horizontal. Sem isso, «MÉDIA» apanharia 845.677 € em vez de 5.841 €/m²
 * — um erro de duas ordens de grandeza que passaria despercebido porque
 * ambos os números são plausíveis no seu contexto.
 *
 * O QUE ISTO NÃO FAZ
 *
 * Não adivinha. Se a estrutura mudar — e vai mudar, os relatórios são
 * gerados por uma plataforma que evolui — devolve o que conseguiu ler e
 * diz o que faltou. Quem importa vê antes de gravar.
 */

export type ValoresSIR = {
  concelho: string | null;
  freguesia: string | null;
  periodo: string | null;
  centroide: { lat: number; lng: number } | null;
  amostra: number | null;
  eur_m2: {
    p25: number | null; media: number | null; p75: number | null;
    novos: number | null; usados: number | null;
    por_tipologia: Record<string, number>;
  };
  preco_fogo: { p25: number | null; media: number | null; p75: number | null };
  /** O que não se conseguiu ler. Vazio é o esperado. */
  em_falta: string[];
};

type Item = { t: string; x: number; y: number };

/** Números do relatório: «3 922 €», «1 437 439 €». Espaço fino como milhar. */
function euros(t: string): number | null {
  const m = t.match(/^([\d\s  .]+)\s*€$/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[\s  .]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** «38°42'59.206"N 9°22'24.541"W» → decimal. */
export function coordenada(t: string): { lat: number; lng: number } | null {
  const m = t.match(/(\d+)°(\d+)'([\d.]+)"([NS])\s+(\d+)°(\d+)'([\d.]+)"([EW])/);
  if (!m) return null;
  const dec = (g: number, mi: number, s: number, sinal: string) =>
    (g + mi / 60 + s / 3600) * (sinal === "S" || sinal === "W" ? -1 : 1);
  return {
    lat: Number(dec(+m[1], +m[2], +m[3], m[4]).toFixed(6)),
    lng: Number(dec(+m[5], +m[6], +m[7], m[8]).toFixed(6)),
  };
}

/** «Junho, 2026» → «2026-06». */
export function mesAno(t: string): string | null {
  const MESES: Record<string, string> = {
    janeiro: "01", fevereiro: "02", marco: "03", março: "03", abril: "04",
    maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09",
    outubro: "10", novembro: "11", dezembro: "12",
  };
  const m = t.toLowerCase().match(/([a-zç]+)[,\s]+(\d{4})/);
  if (!m || !MESES[m[1]]) return null;
  return `${m[2]}-${MESES[m[1]]}`;
}

/**
 * Etiqueta do relatório → chave interna.
 * «≤ T1» e «≥ T4» são intervalos: guardam-se como T1 e T4, que é o que a
 * hierarquia de benchmarks procura, e a nota fica no `extra`.
 */
const TIPOLOGIAS: Array<[RegExp, string]> = [
  [/^APT\.?\s*≤\s*T1$/i, "apartamento|T1"],
  [/^APT\.?\s*T2$/i, "apartamento|T2"],
  [/^APT\.?\s*T3$/i, "apartamento|T3"],
  [/^APT\.?\s*≥\s*T4$/i, "apartamento|T4"],
  [/^MOR\.?\s*≤\s*T3$/i, "moradia|T3"],
  [/^MOR\.?\s*≥\s*T4$/i, "moradia|T4"],
];

/**
 * @param itens texto do PDF com posição, da página do Micro-SIR
 */
export function lerMicroSIR(itens: Item[]): ValoresSIR {
  const emFalta: string[] = [];
  const texto = (re: RegExp) => itens.find((i) => re.test(i.t))?.t ?? null;

  // ---- cabeçalho -----------------------------------------------------
  const linhaConcelho = texto(/^Concelho:/i);
  const linhaFreguesia = texto(/^Freguesia:/i);
  const linhaData = texto(/^Dados de:/i);
  const linhaCentro = texto(/Centroide/i);
  const linhaAmostra = texto(/AMOSTRA TOTAL/i);

  const depoisDosDoisPontos = (s: string | null) =>
    s ? s.split(":").slice(1).join(":").trim() || null : null;

  // ---- os valores, emparelhados por POSIÇÃO ---------------------------
  //
  // A etiqueta está acima do valor, na mesma coluna. Procura-se o número
  // mais próximo abaixo (até 20 pontos) e horizontalmente alinhado (até
  // 90 pontos): é a distância que separa as duas colunas do relatório.
  const numeros = itens
    .map((i) => ({ ...i, v: euros(i.t) }))
    .filter((i): i is Item & { v: number } => i.v !== null);

  // A coluna dos €/m² é a mais à esquerda das duas de números.
  const etiquetasP25 = itens.filter((i) => /^PERCENTIL 25$/i.test(i.t)).sort((a, b) => a.x - b.x);
  const colM2 = etiquetasP25[0]?.x ?? 227;
  const colFogo = etiquetasP25[1]?.x ?? 345;
  const colunas = [colM2, colFogo];

  /**
   * A que coluna pertence um número.
   *
   * Não é por proximidade, e a razão é o desenho do relatório: os valores
   * estão dentro de barras preenchidas e o texto fica no fim da barra,
   * por isso o `x` de um número DESLOCA-SE conforme o seu comprimento.
   * «6 857 €» aparece em x=296 e «3 922 €» em x=256, na mesma coluna cujo
   * rótulo está em x=227.
   *
   * Duas tentativas anteriores falharam por assumir o contrário: um raio
   * fixo dava `fogo P75 = 6.857 €` (o valor do €/m²), e a proximidade
   * dava o mesmo erro por outro caminho. Ambos plausíveis à vista e
   * errados por duas ordens de grandeza.
   *
   * As ETIQUETAS é que estão alinhadas e estáveis. Um número pertence à
   * coluna cuja etiqueta é a mais à direita que ainda fica à sua esquerda.
   */
  const inicios = [...colunas].sort((a, b) => a - b);
  const dono = (x: number) => {
    let escolhida = inicios[0];
    for (const c of inicios) if (x >= c - 4) escolhida = c;
    return escolhida;
  };

  function valorSob(etiqueta: Item, colunaX: number): number | null {
    let melhor: { v: number; d: number } | null = null;
    for (const n of numeros) {
      if (dono(n.x) !== colunaX) continue;
      const abaixo = n.y - etiqueta.y;
      if (abaixo <= 0 || abaixo > 20) continue;
      if (!melhor || abaixo < melhor.d) melhor = { v: n.v, d: abaixo };
    }
    return melhor?.v ?? null;
  }

  function porEtiqueta(re: RegExp, coluna: number): number | null {
    const cands = itens.filter((i) => re.test(i.t) && dono(i.x) === coluna);
    for (const c of cands) {
      const v = valorSob(c, coluna);
      if (v !== null) return v;
    }
    return null;
  }

  const eur_m2 = {
    p25: porEtiqueta(/^PERCENTIL 25$/i, colM2),
    media: porEtiqueta(/^MÉDIA$/i, colM2),
    p75: porEtiqueta(/^PERCENTIL 75$/i, colM2),
    novos: porEtiqueta(/^NOVOS$/i, colM2),
    usados: porEtiqueta(/^USADOS$/i, colM2),
    por_tipologia: {} as Record<string, number>,
  };

  for (const [re, chave] of TIPOLOGIAS) {
    const v = porEtiqueta(re, colM2);
    if (v !== null) eur_m2.por_tipologia[chave] = v;
    else emFalta.push(`€/m² ${chave}`);
  }

  const preco_fogo = {
    p25: porEtiqueta(/^PERCENTIL 25$/i, colFogo),
    media: porEtiqueta(/^MÉDIA$/i, colFogo),
    p75: porEtiqueta(/^PERCENTIL 75$/i, colFogo),
  };

  // ---- o que falta ----------------------------------------------------
  // Sem estes três, o relatório não serve para nada: não há valor, não há
  // onde o pousar, nem quando. Dizer o que falta poupa a quem importa
  // adivinhar porque é que o resultado veio vazio.
  if (eur_m2.media == null) emFalta.push("€/m² médio (o valor central)");
  if (!depoisDosDoisPontos(linhaConcelho)) emFalta.push("concelho");
  if (!linhaData || !mesAno(linhaData)) emFalta.push("período");

  return {
    concelho: depoisDosDoisPontos(linhaConcelho),
    freguesia: depoisDosDoisPontos(linhaFreguesia),
    periodo: linhaData ? mesAno(linhaData) : null,
    centroide: linhaCentro ? coordenada(linhaCentro) : null,
    amostra: linhaAmostra ? (parseInt(linhaAmostra.replace(/\D/g, ""), 10) || null) : null,
    eur_m2,
    preco_fogo,
    em_falta: emFalta,
  };
}

/** Indicadores das páginas do concelho e da freguesia. */
export function lerIndicadores(itens: Item[]): {
  absorcao_meses: number | null;
  desconto_acumulado: number | null;
  price_gap: number | null;
  yield_bruta: number | null;
} {
  // O relatório usa o SINAL MENOS tipográfico (U+2212) nas percentagens
  // negativas, não o hífen. `parseFloat("−7,9")` devolve NaN — o valor
  // desaparecia e o indicador ficava nulo sem erro nenhum. Normaliza-se
  // antes de ler. (Também apanha o traço de meia-risca, por precaução.)
  const semSinaisEstranhos = (s: string) => s.replace(/[−–—]/g, "-");

  const perto = (re: RegExp, padrao: RegExp) => {
    const et = itens.find((i) => re.test(i.t));
    if (!et) return null;
    let melhor: { v: number; d: number } | null = null;
    for (const i of itens) {
      const m = semSinaisEstranhos(i.t).match(padrao);
      if (!m) continue;
      const abaixo = i.y - et.y;
      if (abaixo <= 0 || abaixo > 25 || Math.abs(i.x - et.x) > 80) continue;
      const v = parseFloat(m[1].replace(",", "."));
      if (!Number.isFinite(v)) continue;
      if (!melhor || abaixo < melhor.d) melhor = { v, d: abaixo };
    }
    return melhor?.v ?? null;
  };

  const pct = (v: number | null) => (v == null ? null : Number((v / 100).toFixed(4)));
  return {
    absorcao_meses: perto(/Tempo de Absor/i, /^(-?[\d,.]+)\s*(meses|mês)/i),
    // Vêm negativos no relatório («−7,4%») e o sinal é informação: é um
    // desconto, não um acréscimo.
    desconto_acumulado: pct(perto(/Desconto Acumulado/i, /^(-?−?[\d,.]+)\s*%/)),
    price_gap: pct(perto(/Price Gap/i, /^(-?−?[\d,.]+)\s*%/)),
    yield_bruta: pct(perto(/Yield Bruta/i, /^(-?−?[\d,.]+)\s*%/)),
  };
}
