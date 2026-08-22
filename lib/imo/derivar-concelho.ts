/**
 * Deriva um valor de concelho a partir das zonas que já temos.
 *
 * PORQUE É PRECISO
 *
 * O SIR não produz relatórios de concelho. O Micro-SIR reporta sempre a
 * micro-zona desenhada, e a página do concelho traz indicadores de
 * absorção mas não €/m². Quem escreve uma freguesia que não temos —
 * «Quinta do Anjo», «Pinhal Novo» — resolve para o concelho, e o
 * concelho está vazio: sem benchmark, a avaliação cai no caminho lento e
 * perde a âncora de mercado.
 *
 * Derivar não é inventar: é a mediana das zonas que realmente temos
 * daquele concelho, com a amostra somada e a lista das zonas de onde
 * veio. Fica registado em `extra` que é derivado, para ninguém o
 * confundir com um número que o SIR tenha publicado.
 *
 * MEDIANA, NÃO MÉDIA — uma zona cara arrasta a média do concelho e não
 * arrasta a mediana. É a mesma escolha do resto do motor.
 *
 * DUAS ZONAS NO MÍNIMO, e é aqui que está o juízo
 *
 * Com uma zona só não há agregado nenhum: seria pegar num retângulo
 * desenhado à mão e chamar-lhe «Almada». O único relatório que temos de
 * Almada é da Caparica, que é costa e é mais cara do que Almada terra
 * adentro. Publicar isso como o concelho seria confiante e errado, que é
 * pior do que vazio — de vazio sabe-se que não se sabe.
 */

export type Zona = {
  geografia_id: string;
  nome: string;
  tipo_imovel: string;
  tipologia: string;
  eur_m2_medio: number;
  n_transacoes: number | null;
  periodo: string;
  desconto_medio: number | null;
};

export type Derivado = {
  tipo_imovel: string;
  tipologia: string;
  eur_m2_medio: number;
  n_transacoes: number;
  periodo: string;
  desconto_medio: number | null;
  de_zonas: string[];
};

/** Menos zonas do que isto não é um agregado — é uma zona com outro nome. */
export const MINIMO_ZONAS = 2;

export function mediana(ns: number[]): number {
  if (!ns.length) return 0;
  const o = [...ns].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
}

/**
 * @param zonas benchmarks das freguesias e microzonas DE UM concelho
 * @returns um derivado por combinação tipo+tipologia que tenha zonas que
 *   cheguem. Vazio quando não há material — e vazio é a resposta certa.
 */
export function derivarConcelho(zonas: Zona[]): Derivado[] {
  const porChave = new Map<string, Zona[]>();
  for (const z of zonas) {
    if (!(z.eur_m2_medio > 0)) continue;
    const k = `${z.tipo_imovel}|${z.tipologia}`;
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k)!.push(z);
  }

  const out: Derivado[] = [];
  for (const [k, lista] of porChave) {
    // Uma zona pode aparecer duas vezes — o mesmo retângulo importado da
    // freguesia e da microzona. Contá-la duas vezes fingiria mais
    // concordância do que existe, e a mediana de dois números iguais é
    // esse número: pareceria um concelho muito coerente sem o ser.
    const vistas = new Set<string>();
    const unicas = lista.filter((z) => {
      const id = `${z.geografia_id}|${z.eur_m2_medio}`;
      if (vistas.has(id)) return false;
      vistas.add(id);
      return true;
    });
    if (unicas.length < MINIMO_ZONAS) continue;

    const [tipo, tipologia] = k.split("|");
    const descontos = unicas.map((z) => z.desconto_medio).filter((d): d is number => d != null);

    out.push({
      tipo_imovel: tipo,
      tipologia,
      eur_m2_medio: mediana(unicas.map((z) => z.eur_m2_medio)),
      // Somada, não a mediana: a amostra do concelho é mesmo a soma das
      // zonas que o compõem.
      n_transacoes: unicas.reduce((s, z) => s + (z.n_transacoes ?? 0), 0),
      // O período mais recente das zonas — dizer que é de junho quando a
      // zona mais nova é de março seria dizer mal a idade do número.
      periodo: unicas.map((z) => z.periodo).sort().slice(-1)[0],
      desconto_medio: descontos.length ? Number(mediana(descontos.map((d) => d * 10000)) / 10000) : null,
      de_zonas: [...new Set(unicas.map((z) => z.nome))].sort(),
    });
  }

  return out.sort((a, b) =>
    a.tipo_imovel.localeCompare(b.tipo_imovel) || a.tipologia.localeCompare(b.tipologia));
}
