/**
 * Importação de dados de mercado — SIR e outros exports.
 *
 * O SIR não tem API. Foi confirmado diretamente e é uma restrição, não um
 * obstáculo a contornar: nada aqui faz scraping, automação de sessão ou
 * uso de endpoints internos. O utilizador exporta legitimamente da
 * plataforma e carrega o ficheiro.
 *
 * O desenho tem três teimosias, e cada uma vem de uma forma conhecida de
 * estas coisas correrem mal:
 *
 *  1. NUNCA ASSUMIR O FORMATO. Os exports mudam de nome de coluna entre
 *     versões. Há um dicionário de sinónimos e, para o que não reconhece,
 *     o utilizador mapeia à mão uma vez — e fica guardado.
 *
 *  2. NUNCA GRAVAR SEM MOSTRAR. Primeiro valida e devolve o que
 *     encontrou; a gravação é um segundo ato, deliberado. Um ficheiro com
 *     a coluna errada mapeada corrompe um benchmark, e um benchmark
 *     corrompido não grita: só faz as avaliações daquela zona ficarem
 *     silenciosamente erradas.
 *
 *  3. NUNCA SUBSTITUIR EM SILÊNCIO. Cada importação é uma versão. Agosto
 *     não desaparece quando setembro entra — o histórico é o ativo.
 */

/** Campos internos para onde as colunas do ficheiro são mapeadas. */
export type CampoInterno =
  | "concelho" | "freguesia" | "zona" | "microzona"
  | "tipo_imovel" | "tipologia" | "periodo"
  | "eur_m2_mediano" | "eur_m2_medio" | "eur_m2_p25" | "eur_m2_p75"
  | "preco_mediano" | "n_transacoes" | "desconto_medio"
  | "tempo_absorcao_dias" | "dispersao";

/**
 * Sinónimos conhecidos, por campo.
 *
 * Não é para adivinhar tudo — é para o caso normal não dar trabalho. O
 * que não casar aqui é apresentado ao utilizador para mapear, e a escolha
 * dele fica guardada na importação para a vez seguinte.
 */
const SINONIMOS: Record<CampoInterno, string[]> = {
  concelho: ["concelho", "municipio", "município", "conc"],
  freguesia: ["freguesia", "uniao de freguesias", "união de freguesias", "freg"],
  zona: ["zona", "area geografica", "área geográfica", "localizacao", "localização"],
  microzona: ["microzona", "micro zona", "micro-zona", "subzona", "sub zona"],
  tipo_imovel: ["tipo", "tipo de imovel", "tipo de imóvel", "segmento", "natureza"],
  tipologia: ["tipologia", "tipo de alojamento", "t", "assoalhadas"],
  periodo: ["periodo", "período", "trimestre", "ano", "data", "referencia", "referência"],
  eur_m2_mediano: [
    "preco mediano m2", "preço mediano m2", "mediana eur m2", "€/m2 mediano",
    "eur m2 mediano", "valor mediano m2", "mediana m2", "preco mediano por m2",
  ],
  eur_m2_medio: ["preco medio m2", "preço médio m2", "media eur m2", "€/m2 medio", "valor medio m2"],
  eur_m2_p25: ["p25", "percentil 25", "quartil inferior", "1o quartil"],
  eur_m2_p75: ["p75", "percentil 75", "quartil superior", "3o quartil"],
  preco_mediano: ["preco mediano", "preço mediano", "valor mediano", "mediana preco"],
  n_transacoes: [
    "n transacoes", "nº transações", "numero de transacoes", "número de transações",
    "transacoes", "transações", "n vendas", "n obs", "observacoes", "observações",
  ],
  desconto_medio: ["desconto", "desconto medio", "desconto médio", "diferenca pedido escritura", "gap"],
  tempo_absorcao_dias: ["tempo de absorcao", "tempo de absorção", "dias no mercado", "absorcao", "absorção"],
  dispersao: ["dispersao", "dispersão", "desvio", "variacao", "variação"],
};

/** Sem acentos, sem pontuação, minúsculas: é assim que se compara. */
function chave(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Propõe um mapeamento das colunas do ficheiro para os campos internos.
 *
 * Devolve também o que NÃO reconheceu, porque é isso que o utilizador tem
 * de decidir. Uma coluna por mapear não é um erro — é uma pergunta.
 */
export function proporMapeamento(colunas: string[]): {
  mapeamento: Partial<Record<CampoInterno, string>>;
  porMapear: string[];
  ambiguas: Array<{ coluna: string; candidatos: CampoInterno[] }>;
} {
  const mapeamento: Partial<Record<CampoInterno, string>> = {};
  const usadas = new Set<string>();
  const ambiguas: Array<{ coluna: string; candidatos: CampoInterno[] }> = [];

  for (const col of colunas) {
    const k = chave(col);
    if (!k) continue;
    // Correspondência EXATA ganha sempre à parcial. Sem esta regra,
    // «Tipologia» casava com `tipo_imovel` (porque contém «tipo») e com
    // `tipologia`, ficava ambígua, e uma coluna óbvia exigia trabalho
    // manual. A parcial só decide quando não há exata nenhuma.
    const exatos: CampoInterno[] = [];
    const parciais: CampoInterno[] = [];
    for (const [campo, nomes] of Object.entries(SINONIMOS) as [CampoInterno, string[]][]) {
      if (nomes.some((n) => k === chave(n))) exatos.push(campo);
      else if (nomes.some((n) => k.includes(chave(n)) || chave(n).includes(k))) parciais.push(campo);
    }
    const candidatos = exatos.length ? exatos : parciais;

    if (candidatos.length === 1 && !mapeamento[candidatos[0]]) {
      mapeamento[candidatos[0]] = col;
      usadas.add(col);
    } else if (candidatos.length > 1) {
      // Duas leituras possíveis é pior do que nenhuma: adivinhar aqui
      // troca «preço médio» por «preço mediano» e ninguém repara.
      ambiguas.push({ coluna: col, candidatos });
      usadas.add(col);
    }
  }

  return {
    mapeamento,
    porMapear: colunas.filter((c) => c && !usadas.has(c)),
    ambiguas,
  };
}

/** Lê números como vêm nos exports portugueses. */
export function numeroPT(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const temPonto = s.includes("."), temVirgula = s.includes(",");
  let limpo = s;
  if (temPonto && temVirgula) {
    limpo = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (temVirgula) {
    limpo = s.replace(/\./g, "").replace(",", ".");
  } else if (temPonto) {
    limpo = /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  }
  const n = parseFloat(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza um período para uma forma comparável e ordenável. */
export function periodoNormal(v: unknown): { periodo: string; fim: string } | null {
  const s = String(v ?? "").trim();
  if (!s) return null;

  let m = s.match(/(\d{4})\s*[\/\-\s]?\s*[QqTt]\s*([1-4])/) || s.match(/[QqTt]\s*([1-4])\s*[\/\-\s]?\s*(\d{4})/);
  if (m) {
    const ano = m[1].length === 4 ? m[1] : m[2];
    const tri = m[1].length === 4 ? m[2] : m[1];
    const fimMes = ["03-31", "06-30", "09-30", "12-31"][Number(tri) - 1];
    return { periodo: `${ano}-Q${tri}`, fim: `${ano}-${fimMes}` };
  }
  m = s.match(/(\d{4})[\/\-](\d{1,2})/);
  if (m) {
    const mes = String(Number(m[2])).padStart(2, "0");
    const ultimo = new Date(Number(m[1]), Number(m[2]), 0).getDate();
    return { periodo: `${m[1]}-${mes}`, fim: `${m[1]}-${mes}-${ultimo}` };
  }
  m = s.match(/^(\d{4})$/);
  if (m) return { periodo: m[1], fim: `${m[1]}-12-31` };
  return null;
}

export type LinhaValidada = {
  numero: number;
  bruto: Record<string, unknown>;
  normalizado: Record<string, unknown> | null;
  estado: "VALIDA" | "AVISO" | "REJEITADA";
  motivo?: string;
};

/**
 * Valida as linhas contra o mapeamento. NÃO grava nada.
 *
 * Devolve o que vai acontecer, para o utilizador confirmar. Só depois de
 * ele olhar é que se escreve na base de dados.
 */
export function validar(
  linhas: Record<string, unknown>[],
  mapeamento: Partial<Record<CampoInterno, string>>,
): { linhas: LinhaValidada[]; resumo: { total: number; validas: number; avisos: number; rejeitadas: number } } {
  const out: LinhaValidada[] = [];
  const le = (l: Record<string, unknown>, campo: CampoInterno) => {
    const col = mapeamento[campo];
    return col ? l[col] : undefined;
  };

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const bruto = l;
    const avisos: string[] = [];

    // Sem geografia não há onde pousar o número.
    const concelho = String(le(l, "concelho") ?? "").trim();
    const zona = String(le(l, "microzona") ?? le(l, "freguesia") ?? le(l, "zona") ?? "").trim();
    if (!concelho && !zona) {
      out.push({ numero: i + 2, bruto, normalizado: null, estado: "REJEITADA", motivo: "sem geografia" });
      continue;
    }

    const per = periodoNormal(le(l, "periodo"));
    if (!per) {
      out.push({ numero: i + 2, bruto, normalizado: null, estado: "REJEITADA", motivo: "período ilegível" });
      continue;
    }

    const m2 = numeroPT(le(l, "eur_m2_mediano")) ?? numeroPT(le(l, "eur_m2_medio"));
    if (m2 == null) {
      out.push({ numero: i + 2, bruto, normalizado: null, estado: "REJEITADA", motivo: "sem €/m²" });
      continue;
    }
    // Um €/m² fora deste intervalo em Portugal é erro de coluna ou de
    // unidade, não um mercado extraordinário. Rejeita-se em vez de se
    // deixar entrar e envenenar a mediana da zona.
    if (m2 < 300 || m2 > 25000) {
      out.push({
        numero: i + 2, bruto, normalizado: null, estado: "REJEITADA",
        motivo: `€/m² implausível (${Math.round(m2)}) — provável coluna errada`,
      });
      continue;
    }

    const n = numeroPT(le(l, "n_transacoes"));
    if (n == null) avisos.push("sem número de transações: o benchmark perde prioridade");
    else if (n < 5) avisos.push(`amostra pequena (${n} transações)`);

    const desconto = numeroPT(le(l, "desconto_medio"));
    // Aceita 12 e 0,12 — os exports usam as duas convenções.
    const descontoNorm = desconto == null ? null : (Math.abs(desconto) > 1 ? desconto / 100 : desconto);

    out.push({
      numero: i + 2,
      bruto,
      normalizado: {
        concelho, zona,
        // Vazio, nunca nulo: e o que permite haver uma so linha por
        // zona+tipologia+periodo. Com nulos, "todas as tipologias"
        // duplicava-se em silencio.
        tipo_imovel: String(le(l, "tipo_imovel") ?? "").trim(),
        tipologia: String(le(l, "tipologia") ?? "").trim(),
        periodo: per.periodo, periodo_fim: per.fim,
        eur_m2_mediano: numeroPT(le(l, "eur_m2_mediano")),
        eur_m2_medio: numeroPT(le(l, "eur_m2_medio")),
        eur_m2_p25: numeroPT(le(l, "eur_m2_p25")),
        eur_m2_p75: numeroPT(le(l, "eur_m2_p75")),
        preco_mediano: numeroPT(le(l, "preco_mediano")),
        n_transacoes: n,
        desconto_medio: descontoNorm,
        tempo_absorcao_dias: numeroPT(le(l, "tempo_absorcao_dias")),
        dispersao: numeroPT(le(l, "dispersao")),
      },
      estado: avisos.length ? "AVISO" : "VALIDA",
      motivo: avisos.join(" · ") || undefined,
    });
  }

  return {
    linhas: out,
    resumo: {
      total: out.length,
      validas: out.filter((x) => x.estado === "VALIDA").length,
      avisos: out.filter((x) => x.estado === "AVISO").length,
      rejeitadas: out.filter((x) => x.estado === "REJEITADA").length,
    },
  };
}

/** SHA-256 do ficheiro. É o que impede a mesma importação duas vezes. */
export async function hashFicheiro(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
