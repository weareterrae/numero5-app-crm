/**
 * Encontra o que está mal nos dados de mercado, antes de alguém dar por isso.
 *
 * O PADRÃO QUE ISTO EXISTE PARA QUEBRAR
 *
 * Nada nesta camada grita quando corre mal. Um benchmark com o €/m² e o
 * preço por fogo trocados, uma amostra fina de mais para servir, uma
 * freguesia duplicada, um número de há um ano — nenhum destes casos dá
 * erro. Todos fazem as avaliações daquela zona ficarem silenciosamente
 * erradas, e o relatório continua a sair com ar de bom.
 *
 * Todos os defeitos aqui verificados JÁ ACONTECERAM neste sistema, num
 * único dia de trabalho. Não são hipóteses: são a lista do que correu
 * mal e demorou a ser visto.
 *
 * SEVERIDADE, e o que ela quer dizer
 *
 *   grave  o número está errado ou é inalcançável. Alguém tem de agir.
 *   aviso  provavelmente certo, mas merece olhos.
 *   info   fica registado para se ver a tendência.
 *
 * NÃO CORRIGE NADA. Um corretor automático que decide qual das duas
 * freguesias sobrevive, ou que apaga um benchmark estranho, faz
 * exatamente o mesmo mal em silêncio que veio denunciar.
 */

export type Problema = {
  tipo: string;
  severidade: "info" | "aviso" | "grave";
  tabela: string;
  registo_id: string | null;
  detalhe: Record<string, unknown>;
};

export type Benchmark = {
  id: string;
  fonte_id: string;
  geografia_id: string;
  geografia_nome: string;
  geografia_nivel: string;
  tipo_imovel: string;
  tipologia: string;
  eur_m2_medio: number | null;
  n_transacoes: number | null;
  periodo: string;
  periodo_fim: string | null;
  desconto_medio: number | null;
  extra: Record<string, unknown> | null;
};

export type Transacao = {
  id: string;
  referencia: string | null;
  area: number | null;
  preco_transacao: number | null;
  data_transacao: string | null;
  geografia_id: string | null;
};

export type Amostra = {
  id: string;
  chave: string;
  n_itens: number | null;
  valida_ate: string | null;
  geografia_nome: string;
};

// Fora disto não é habitação em Portugal — é um engano de leitura ou de
// dedo. O teto alto deixa passar o Chiado sem deixar passar um preço por
// fogo metido na coluna do €/m².
const EUR_M2_MIN = 300;
const EUR_M2_MAX = 25_000;

/** Ao fim de quanto tempo um número deixa de descrever o mercado. */
const MESES_VELHO = 6;

/** Quantos comparáveis o motor exige para usar uma amostra. */
const AMOSTRA_MINIMA = 3;

const mesesEntre = (iso: string, hoje: Date) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return (hoje.getFullYear() - d.getFullYear()) * 12 + (hoje.getMonth() - d.getMonth());
};

/**
 * @param hoje injetado para o resultado não depender do relógio — os
 *   mesmos dados têm de dar os mesmos problemas em qualquer execução.
 */
export function verificar(
  dados: { benchmarks: Benchmark[]; transacoes: Transacao[]; amostras: Amostra[] },
  hoje: Date,
): Problema[] {
  const out: Problema[] = [];
  const p = (x: Problema) => out.push(x);

  // ---- BENCHMARKS ----------------------------------------------------
  for (const b of dados.benchmarks) {
    const onde = `${b.geografia_nivel} ${b.geografia_nome}` +
      (b.tipologia ? ` · ${b.tipo_imovel} ${b.tipologia}` : " · geral");

    if (!(b.eur_m2_medio && b.eur_m2_medio > 0)) {
      p({ tipo: "benchmark_sem_valor", severidade: "grave", tabela: "imo_benchmarks",
          registo_id: b.id, detalhe: { onde, periodo: b.periodo } });
      continue;
    }

    // Duas ordens de grandeza a mais é o preço por fogo na coluna errada.
    // Aconteceu duas vezes a construir o leitor de PDF.
    if (b.eur_m2_medio < EUR_M2_MIN || b.eur_m2_medio > EUR_M2_MAX) {
      p({ tipo: "eur_m2_impossivel", severidade: "grave", tabela: "imo_benchmarks",
          registo_id: b.id,
          detalhe: { onde, eur_m2: b.eur_m2_medio, periodo: b.periodo,
                     nota: "fora de 300–25.000 €/m² — provável troca de coluna ou de unidade" } });
    }

    // Um price gap positivo diria que se escritura ACIMA do pedido.
    if (b.desconto_medio != null && (b.desconto_medio > 0 || b.desconto_medio < -0.5)) {
      p({ tipo: "price_gap_estranho", severidade: "aviso", tabela: "imo_benchmarks",
          registo_id: b.id, detalhe: { onde, desconto: b.desconto_medio } });
    }

    // Amostra pequena a fazer-se passar por mercado.
    if ((b.n_transacoes ?? 0) > 0 && (b.n_transacoes ?? 0) < 30) {
      p({ tipo: "amostra_pequena", severidade: "aviso", tabela: "imo_benchmarks",
          registo_id: b.id, detalhe: { onde, n: b.n_transacoes } });
    }

    const idade = b.periodo_fim ? mesesEntre(b.periodo_fim, hoje) : mesesEntre(b.periodo + "-01", hoje);
    if (idade > MESES_VELHO) {
      p({ tipo: "benchmark_velho", severidade: idade > 12 ? "grave" : "aviso",
          tabela: "imo_benchmarks", registo_id: b.id,
          detalhe: { onde, periodo: b.periodo, meses: idade } });
    }

    // Um derivado de duas zonas é frágil; de uma, não devia existir.
    const zonas = (b.extra?.de_zonas as string[] | undefined)?.length;
    if (b.extra?.derivado && zonas != null && zonas < 2) {
      p({ tipo: "derivado_de_uma_zona", severidade: "grave", tabela: "imo_benchmarks",
          registo_id: b.id, detalhe: { onde, zonas } });
    }
  }

  // ---- BENCHMARKS QUE SE CONTRADIZEM ---------------------------------
  // Dois números para a mesma coisa e período que discordam muito: um
  // deles descreve outro sítio, e quem lê não sabe qual.
  const porChave = new Map<string, Benchmark[]>();
  for (const b of dados.benchmarks) {
    if (!(b.eur_m2_medio && b.eur_m2_medio > 0)) continue;
    const k = `${b.geografia_id}|${b.tipo_imovel}|${b.tipologia}|${b.periodo}`;
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k)!.push(b);
  }
  for (const [, lista] of porChave) {
    if (lista.length < 2) continue;
    const vs = lista.map((x) => x.eur_m2_medio!);
    const amplitude = Math.max(...vs) / Math.min(...vs) - 1;
    if (amplitude > 0.15) {
      p({ tipo: "benchmarks_em_conflito", severidade: "grave", tabela: "imo_benchmarks",
          registo_id: lista[0].id,
          detalhe: { onde: `${lista[0].geografia_nivel} ${lista[0].geografia_nome}`,
                     valores: vs, amplitude: Math.round(amplitude * 1000) / 10,
                     fontes: lista.map((x) => x.fonte_id) } });
    }
  }

  // ---- TRANSAÇÕES ----------------------------------------------------
  for (const t of dados.transacoes) {
    const q = `venda ${t.referencia ?? t.id.slice(0, 8)}`;
    if (!t.geografia_id) {
      // Existe e nenhuma avaliação a encontra — que é para o que serve.
      p({ tipo: "venda_sem_geografia", severidade: "grave", tabela: "imo_transacoes",
          registo_id: t.id, detalhe: { onde: q } });
    }
    if (t.area && t.preco_transacao) {
      const m2 = t.preco_transacao / t.area;
      if (m2 < EUR_M2_MIN || m2 > EUR_M2_MAX) {
        p({ tipo: "eur_m2_impossivel", severidade: "grave", tabela: "imo_transacoes",
            registo_id: t.id, detalhe: { onde: q, eur_m2: Math.round(m2), area: t.area,
                                         preco: t.preco_transacao } });
      }
    } else {
      p({ tipo: "venda_incompleta", severidade: "aviso", tabela: "imo_transacoes",
          registo_id: t.id, detalhe: { onde: q, area: t.area, preco: t.preco_transacao } });
    }
  }

  // ---- AMOSTRAS ------------------------------------------------------
  for (const a of dados.amostras) {
    const viva = a.valida_ate ? new Date(a.valida_ate) > hoje : false;
    // A armadilha real: fina de mais para o motor a usar, e suficiente
    // para impedir que outra a substitua. Carnaxide ficou assim, a pagar
    // cinco minutos por avaliação sem nunca melhorar.
    if (viva && (a.n_itens ?? 0) < AMOSTRA_MINIMA) {
      p({ tipo: "amostra_fina", severidade: "grave", tabela: "imo_amostras",
          registo_id: a.id,
          detalhe: { onde: a.geografia_nome, itens: a.n_itens,
                     nota: `abaixo de ${AMOSTRA_MINIMA} o motor não a usa` } });
    }
  }

  const ordem = { grave: 0, aviso: 1, info: 2 };
  return out.sort((x, y) => ordem[x.severidade] - ordem[y.severidade] ||
                            x.tipo.localeCompare(y.tipo));
}
