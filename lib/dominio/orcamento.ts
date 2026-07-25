/**
 * Do âmbito ao valor — com a conta à vista.
 *
 * ⚠️ MODELO (decidido com o Sandro, 24-07-2026):
 * A produção conta-se UMA vez. Um post que sai no Instagram e no Facebook
 * foi feito uma vez, não duas — cobrar a dobrar seria cobrar trabalho que
 * não existe. O que cresce com cada canal é a GESTÃO (adaptar formatos,
 * responder, acompanhar): 1.º canal completo, seguintes a valor reduzido.
 *
 * Exceção: um canal marcado como «conteúdo próprio» (ex.: LinkedIn de um
 * imobiliário) é uma segunda linha de trabalho — paga gestão completa.
 *
 * Os preços unitários vêm da base de dados: são decisão do negócio,
 * nunca estão escritos no código.
 */

/** Formatação local, para este módulo não depender de mais nada. */
const eur = (v: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

export const CANAIS = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["linkedin", "LinkedIn"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
  ["x", "X"],
  ["gmb", "Google Business"],
] as const;

export type ChaveCanal = (typeof CANAIS)[number][0];

/** Peças ÚNICAS produzidas por mês. */
export type Producao = {
  posts: number;
  carrosseis: number;
  reels: number;
  stories: number;
};

export const PRODUCAO_VAZIA: Producao = { posts: 0, carrosseis: 0, reels: 0, stories: 0 };

export type Canal = {
  ativo: boolean;
  /** Leva conteúdo próprio, não adaptado — paga gestão completa. */
  proprio: boolean;
};

export type TipoSite = "nenhum" | "melhorias" | "novo" | "loja";

/** Serviços à medida do catálogo (vídeo, fotografia, apps…) com quantidade. */
export type ServicoExtra = { chave: string; rotulo: string; quantidade: number };

/** Chaves geridas pelos controlos estruturados — não entram nos "outros serviços". */
export const CHAVES_ESTRUTURADAS = new Set([
  "post", "carrossel", "reel", "story",
  "gestao_canal", "gestao_canal_extra",
  "anuncios", "anuncios_pct", "moderacao", "moderacao_setup",
  "assistente", "assistente_setup", "relatorio", "direcao",
  "site_novo", "site_melhorias", "loja_online", "identidade", "perfis",
]);

/** Parâmetros de âmbito — o que fica combinado dentro de cada serviço. */
export type Ambitos = {
  /** Nº máximo de slides por carrossel. */
  carrossel_slides?: number;
  /** Duração máxima do reel, em segundos. */
  reel_duracao?: number;
  /** Âmbito da loja online (produtos, pagamentos, entregas). */
  loja?: string;
  /** Âmbito do assistente (documentos, fluxos, integrações). */
  assistente?: string;
  /** Limite de interações/mês na moderação. */
  moderacao_limite?: number;
};

export type Escopo = {
  producao: Producao;
  canais: Partial<Record<ChaveCanal, Canal>>;
  site: { tipo: TipoSite; paginas: number };
  /** Verba mensal de anúncios do cliente (não é receita nossa). */
  verba_anuncios: number;
  /** Serviços à medida acrescentados a partir do catálogo. */
  servicos: ServicoExtra[];
  /** Parâmetros de âmbito combinados com o cliente. */
  ambitos: Ambitos;
  extras: {
    anuncios: boolean;
    /** Respostas a comentários, menções e mensagens, com aprovação humana. */
    moderacao: boolean;
    /** Chat no site do cliente. */
    assistente: boolean;
    relatorio: boolean;
    identidade: boolean;
    montar_perfis: boolean;
    /** Direção e coordenação de marketing — obrigatório em qualquer avença. */
    direcao: boolean;
  };
};

export const ESCOPO_VAZIO: Escopo = {
  producao: { ...PRODUCAO_VAZIA },
  canais: {},
  site: { tipo: "nenhum", paginas: 0 },
  verba_anuncios: 0,
  servicos: [],
  ambitos: {},
  extras: {
    anuncios: false,
    moderacao: false,
    assistente: false,
    relatorio: false,
    identidade: false,
    montar_perfis: false,
    direcao: false,
  },
};

export type Preco = {
  chave: string;
  rotulo: string;
  tipo: "mensal" | "setup";
  unidade: string;
  preco: number | null;
  minutos: number | null;
  /** Campos comerciais (catálogo 0022), opcionais. */
  custo_interno?: number | null;
  /** Custos externos por unidade (licenças, stock, fornecedores) — 0024. */
  custo_externo?: number | null;
  tempo_planeado_min?: number | null;
  preco_minimo?: number | null;
  percentagem?: number | null;
};

/** Arredondamento comercial: sobe ao múltiplo de `passo` imediatamente superior. */
export function arredondarComercial(valor: number, passo = 50): number {
  if (!(valor > 0) || !(passo > 0)) return Math.max(0, Math.round(valor));
  return Math.ceil(valor / passo) * passo;
}

/** Custo total da linha: (custo interno + custos externos) × quantidade. */
function custoLinha(p: Preco, quantidade: number): number | null {
  if (p.custo_interno == null && p.custo_externo == null) return null;
  const unit = (Number(p.custo_interno) || 0) + (Number(p.custo_externo) || 0);
  return unit * quantidade;
}

/** Margem prevista (0–1) de um total face ao custo interno. Null se não dá. */
export function margem(total: number, custo: number): number | null {
  if (!(total > 0)) return null;
  return (total - custo) / total;
}

/** €/hora efetiva de um total face ao tempo planeado (minutos). Null se sem tempo. */
export function euroHora(total: number, minutos: number): number | null {
  if (!(minutos > 0)) return null;
  return total / (minutos / 60);
}

/** Limiares de rentabilidade (da tabela `configuracoes`). */
export type Limiares = {
  valorHoraAlvo: number;
  amareloHora: number;
  vermelhoHora: number;
  /** Fração 0–1: abaixo disto a margem fica amarela. */
  amareloMargem: number;
  /** Fração 0–1: abaixo disto a margem fica vermelha. */
  vermelhoMargem: number;
};

export const LIMIARES_DEFEITO: Limiares = {
  valorHoraAlvo: 65,
  amareloHora: 45,
  vermelhoHora: 30,
  amareloMargem: 0.4,
  vermelhoMargem: 0.25,
};

export type CorSemaforo = "verde" | "amarelo" | "vermelho";
export type Semaforo = { cor: CorSemaforo; motivos: string[] };

const ORDEM: Record<CorSemaforo, number> = { verde: 0, amarelo: 1, vermelho: 2 };

/**
 * Semáforo de rentabilidade a partir da margem e do €/hora, contra os limiares.
 * Fica pela pior das duas dimensões. Null em ambas → sem dados (verde neutro).
 */
export function semaforo(
  margemFrac: number | null,
  euroH: number | null,
  lim: Limiares = LIMIARES_DEFEITO,
): Semaforo {
  let cor: CorSemaforo = "verde";
  const motivos: string[] = [];
  const piora = (c: CorSemaforo) => {
    if (ORDEM[c] > ORDEM[cor]) cor = c;
  };

  if (euroH != null) {
    if (euroH < lim.vermelhoHora) {
      piora("vermelho");
      motivos.push(`${Math.round(euroH)} €/h — abaixo do mínimo (${lim.vermelhoHora})`);
    } else if (euroH < lim.amareloHora) {
      piora("amarelo");
      motivos.push(`${Math.round(euroH)} €/h — abaixo do alvo (${lim.valorHoraAlvo})`);
    }
  }
  if (margemFrac != null) {
    const pct = Math.round(margemFrac * 100);
    if (margemFrac < lim.vermelhoMargem) {
      piora("vermelho");
      motivos.push(`margem ${pct}% — abaixo do mínimo (${Math.round(lim.vermelhoMargem * 100)}%)`);
    } else if (margemFrac < lim.amareloMargem) {
      piora("amarelo");
      motivos.push(`margem ${pct}% — abaixo do confortável (${Math.round(lim.amareloMargem * 100)}%)`);
    }
  }

  return { cor, motivos };
}

export type LinhaOrcamento = {
  chave: string;
  rotulo: string;
  quantidade: number;
  precoUnitario: number | null;
  total: number | null;
  minutos: number | null;
  /** Custo interno da linha (custo_interno × quantidade). */
  custo: number | null;
  /** Tempo planeado da linha, em minutos. */
  tempoMin: number;
};

export type Orcamento = {
  mensal: LinhaOrcamento[];
  setup: LinhaOrcamento[];
  totalMensal: number;
  totalSetup: number;
  minutosMensais: number;
  /** Custo interno somado (para a margem). */
  custoMensal: number;
  custoSetup: number;
  /** Tempo planeado somado (para o €/hora). */
  tempoMensalMin: number;
  tempoSetupMin: number;
  porDefinir: string[];
};

/** Aceita âmbitos gravados no modelo antigo (peças por canal). */
export function normalizarEscopo(bruto: unknown): Escopo {
  const e = (bruto ?? {}) as Record<string, unknown>;
  if (e.producao) {
    return {
      ...ESCOPO_VAZIO,
      ...(e as unknown as Escopo),
      producao: { ...PRODUCAO_VAZIA, ...(e.producao as Producao) },
      servicos: Array.isArray(e.servicos) ? (e.servicos as ServicoExtra[]) : [],
      ambitos: { ...ESCOPO_VAZIO.ambitos, ...((e.ambitos as Ambitos) ?? {}) },
    };
  }
  // Modelo antigo: somar as peças que estavam espalhadas pelos canais.
  const antigos = (e.canais ?? {}) as Record<string, Record<string, number | boolean>>;
  const producao = { ...PRODUCAO_VAZIA };
  const canais: Partial<Record<ChaveCanal, Canal>> = {};
  for (const [k, v] of Object.entries(antigos)) {
    if (!v?.ativo) continue;
    canais[k as ChaveCanal] = { ativo: true, proprio: false };
    producao.posts += Number(v.posts) || 0;
    producao.carrosseis += Number(v.carrosseis) || 0;
    producao.reels += Number(v.reels) || 0;
    producao.stories += Number(v.stories) || 0;
  }
  return {
    ...ESCOPO_VAZIO,
    ...(e as unknown as Escopo),
    producao,
    canais,
    servicos: Array.isArray(e.servicos) ? (e.servicos as ServicoExtra[]) : [],
    ambitos: { ...ESCOPO_VAZIO.ambitos, ...((e.ambitos as Ambitos) ?? {}) },
  };
}

export function canaisAtivos(e: Escopo): [ChaveCanal, Canal][] {
  return (Object.entries(e.canais) as [ChaveCanal, Canal][]).filter(([, c]) => c?.ativo);
}

export function quantidades(e: Escopo): Record<string, number> {
  const ativos = canaisAtivos(e);
  // Cada canal com conteúdo próprio paga gestão COMPLETA (é outra linha de
  // trabalho). Dos que levam conteúdo adaptado, o primeiro paga completa e
  // os restantes pagam reduzida.
  const proprios = ativos.filter(([, c]) => c.proprio).length;
  const adaptados = ativos.length - proprios;
  const completos = proprios + (adaptados > 0 ? 1 : 0);
  const extras = Math.max(0, adaptados - 1);

  return {
    post: e.producao.posts,
    carrossel: e.producao.carrosseis,
    reel: e.producao.reels,
    story: e.producao.stories,
    gestao_canal: completos,
    gestao_canal_extra: extras,
    anuncios: e.extras.anuncios ? 1 : 0,
    moderacao: e.extras.moderacao ? 1 : 0,
    moderacao_setup: e.extras.moderacao ? 1 : 0,
    assistente: e.extras.assistente ? 1 : 0,
    relatorio: e.extras.relatorio ? 1 : 0,
    direcao: e.extras.direcao ? 1 : 0,
    site_novo: e.site.tipo === "novo" ? Math.max(0, Number(e.site.paginas) || 0) : 0,
    site_melhorias: e.site.tipo === "melhorias" ? 1 : 0,
    loja_online: e.site.tipo === "loja" ? 1 : 0,
    identidade: e.extras.identidade ? 1 : 0,
    perfis: e.extras.montar_perfis ? ativos.length : 0,
    assistente_setup: e.extras.assistente ? 1 : 0,
  };
}

export function calcular(e: Escopo, precos: Preco[]): Orcamento {
  const q = quantidades(e);
  const mensal: LinhaOrcamento[] = [];
  const setup: LinhaOrcamento[] = [];
  const porDefinir: string[] = [];

  const pct = precos.find((p) => p.chave === "anuncios_pct")?.preco ?? null;
  const verba = Math.max(0, Number(e.verba_anuncios) || 0);

  for (const p of precos) {
    // A percentagem não é uma linha: entra no cálculo da gestão de anúncios.
    if (p.chave === "anuncios_pct") continue;

    const quantidade = q[p.chave] ?? 0;
    if (quantidade <= 0) continue;

    let total = p.preco === null ? null : Number(p.preco) * quantidade;
    let rotulo = p.rotulo;

    // Gestão de anúncios: o MAIOR entre o fixo e a percentagem da verba.
    if (p.chave === "anuncios" && pct !== null && verba > 0) {
      const porPercentagem = (verba * pct) / 100;
      const fixo = p.preco === null ? 0 : Number(p.preco);
      if (porPercentagem > fixo) {
        total = porPercentagem;
        rotulo = `${p.rotulo} — ${pct}% de ${eur(verba)}`;
      } else if (p.preco !== null) {
        rotulo = `${p.rotulo} — mínimo (${pct}% seriam ${eur(porPercentagem)})`;
      }
    }

    if (total === null) porDefinir.push(p.rotulo);

    (p.tipo === "mensal" ? mensal : setup).push({
      chave: p.chave,
      rotulo,
      quantidade,
      precoUnitario: p.preco,
      total,
      minutos: p.minutos ? p.minutos * quantidade : null,
      custo: custoLinha(p, quantidade),
      tempoMin: (Number(p.tempo_planeado_min ?? p.minutos ?? 0) || 0) * quantidade,
    });
  }

  // Serviços à medida (vídeo, fotografia, apps…) escolhidos do catálogo.
  const porChave = new Map(precos.map((p) => [p.chave, p]));
  for (const s of e.servicos ?? []) {
    const quantidade = Math.max(0, Number(s.quantidade) || 0);
    if (quantidade <= 0) continue;
    const p = porChave.get(s.chave);
    if (!p) continue;
    const total = p.preco === null ? null : Number(p.preco) * quantidade;
    if (p.preco === null) porDefinir.push(p.rotulo);
    (p.tipo === "mensal" ? mensal : setup).push({
      chave: p.chave,
      rotulo: p.rotulo,
      quantidade,
      precoUnitario: p.preco,
      total,
      minutos: p.minutos ? p.minutos * quantidade : null,
      custo: custoLinha(p, quantidade),
      tempoMin: (Number(p.tempo_planeado_min ?? p.minutos ?? 0) || 0) * quantidade,
    });
  }

  const somar = (l: LinhaOrcamento[]) => l.reduce((t, x) => t + (x.total ?? 0), 0);
  const somarCusto = (l: LinhaOrcamento[]) => l.reduce((t, x) => t + (x.custo ?? 0), 0);
  const somarTempo = (l: LinhaOrcamento[]) => l.reduce((t, x) => t + (x.tempoMin ?? 0), 0);

  return {
    mensal,
    setup,
    totalMensal: somar(mensal),
    totalSetup: somar(setup),
    minutosMensais: mensal.reduce((t, l) => t + (l.minutos ?? 0), 0),
    custoMensal: somarCusto(mensal),
    custoSetup: somarCusto(setup),
    tempoMensalMin: somarTempo(mensal),
    tempoSetupMin: somarTempo(setup),
    porDefinir,
  };
}

export function pecasPorMes(e: Escopo): number {
  const p = e.producao;
  return p.posts + p.carrosseis + p.reels + p.stories;
}

/**
 * A proposta é uma avença mensal? (produção, canais ou extras recorrentes).
 * A própria direção não conta — é o que se está a exigir.
 */
export function ehAvencaMensal(e: Escopo): boolean {
  return (
    pecasPorMes(e) > 0 ||
    canaisAtivos(e).length > 0 ||
    e.extras.moderacao ||
    e.extras.assistente ||
    e.extras.anuncios ||
    e.extras.relatorio
  );
}

/**
 * Comparação elemento-a-elemento entre o que o cliente pediu e a nossa
 * recomendação (Parte 46). Valores neutros de idioma — a página formata.
 */
export type Comparacao = {
  producao: [number, number];
  canais: [number, number];
  site: [TipoSite, TipoSite];
  assistente: [boolean, boolean];
  anuncios: [boolean, boolean];
  relatorio: [boolean, boolean];
};

export function compararEscopos(pedido: Escopo, nosso: Escopo): Comparacao {
  return {
    producao: [pecasPorMes(pedido), pecasPorMes(nosso)],
    canais: [canaisAtivos(pedido).length, canaisAtivos(nosso).length],
    site: [pedido.site.tipo, nosso.site.tipo],
    assistente: [pedido.extras.assistente, nosso.extras.assistente],
    anuncios: [pedido.extras.anuncios, nosso.extras.anuncios],
    relatorio: [pedido.extras.relatorio, nosso.extras.relatorio],
  };
}

/** As linhas que o cliente lê na proposta — derivadas do que se orçamentou. */
export function descreverEscopo(e: Escopo): string[] {
  const linhas: string[] = [];
  const ativos = canaisAtivos(e);

  const partes: string[] = [];
  if (e.producao.posts) partes.push(`${e.producao.posts} post${e.producao.posts > 1 ? "s" : ""}`);
  if (e.producao.carrosseis)
    partes.push(`${e.producao.carrosseis} carrossel${e.producao.carrosseis > 1 ? "/carrosséis" : ""}`);
  if (e.producao.reels) partes.push(`${e.producao.reels} reel${e.producao.reels > 1 ? "s" : ""}`);
  if (e.producao.stories) partes.push(`${e.producao.stories} histórias`);
  if (partes.length) linhas.push(`${partes.join(" + ")} por mês, com a cara da tua marca`);

  const detalhe: string[] = [];
  if (e.producao.carrosseis && e.ambitos.carrossel_slides)
    detalhe.push(`carrosséis até ${e.ambitos.carrossel_slides} slides`);
  if (e.producao.reels && e.ambitos.reel_duracao)
    detalhe.push(`reels até ${e.ambitos.reel_duracao}s`);
  if (detalhe.length) linhas.push(`Cada peça no seu formato: ${detalhe.join(", ")}`);

  if (ativos.length) {
    const nomes = ativos.map(([k]) => CANAIS.find(([c]) => c === k)?.[1] ?? k);
    linhas.push(`Publicação e gestão em ${nomes.join(", ")} — publicar, responder e acompanhar`);
    const proprios = ativos.filter(([, c]) => c.proprio).map(([k]) => CANAIS.find(([c]) => c === k)?.[1]);
    if (proprios.length) linhas.push(`Conteúdo próprio para ${proprios.join(", ")}`);
  }

  if (e.site.tipo === "novo")
    linhas.push(`Site novo${e.site.paginas ? ` (${e.site.paginas} páginas)` : ""}`);
  if (e.site.tipo === "melhorias") linhas.push("Melhorias ao site atual");
  if (e.site.tipo === "loja")
    linhas.push(
      e.ambitos.loja
        ? `Loja online: ${e.ambitos.loja}`
        : "Loja online com catálogo e pagamentos",
    );

  if (e.extras.identidade) linhas.push("Identidade e estratégia documentadas");
  if (e.extras.montar_perfis) linhas.push("Perfis das redes montados e otimizados");
  if (e.extras.moderacao)
    linhas.push(
      `Respostas a comentários, menções e mensagens: o assistente sugere no tom da tua marca e tu aprovas num clique — ninguém fica sem resposta, e nada sai sem o teu aval${
        e.ambitos.moderacao_limite ? ` (até ${e.ambitos.moderacao_limite} interações/mês)` : ""
      }`,
    );
  if (e.extras.assistente)
    linhas.push(
      e.ambitos.assistente
        ? `Assistente de IA com nome próprio no teu site: ${e.ambitos.assistente}`
        : "Assistente de IA com nome próprio no teu site, à medida da tua marca",
    );
  if (e.extras.anuncios)
    linhas.push(
      e.verba_anuncios > 0
        ? `Gestão de anúncios sobre uma verba de ${eur(e.verba_anuncios)}/mês (a verba é paga por ti diretamente às plataformas)`
        : "Gestão de anúncios com verba definida contigo",
    );
  if (e.extras.relatorio) linhas.push("Relatório mensal — números antes de adjetivos");

  for (const s of e.servicos ?? []) {
    const q = Math.max(0, Number(s.quantidade) || 0);
    if (q > 0) linhas.push(q > 1 ? `${q}× ${s.rotulo}` : s.rotulo);
  }

  return linhas;
}

export type Alerta = { nivel: "aviso" | "info"; texto: string };

/**
 * Avisos que o operador deve ver antes de fechar a proposta — âmbito por
 * definir, verba em falta, serviços sem preço. Não bloqueiam; alertam.
 */
export function alertas(e: Escopo, orc: Orcamento): Alerta[] {
  const a: Alerta[] = [];
  const ativos = canaisAtivos(e);
  const proprios = ativos.filter(([, c]) => c.proprio).length;

  if (ehAvencaMensal(e) && !e.extras.direcao)
    a.push({
      nivel: "aviso",
      texto: "Avença sem direção e coordenação — uma operação mensal exige tempo de planeamento e acompanhamento.",
    });
  if (proprios > 0)
    a.push({
      nivel: "info",
      texto: `${proprios} canal(is) com conteúdo próprio — cada um paga gestão completa e a produção exclusiva conta à parte.`,
    });
  if (e.producao.carrosseis > 0 && !e.ambitos.carrossel_slides)
    a.push({ nivel: "aviso", texto: "Carrosséis sem nº de slides definido — combina o limite antes de propor." });
  if (e.producao.reels > 0 && !e.ambitos.reel_duracao)
    a.push({ nivel: "aviso", texto: "Reels sem duração máxima definida." });
  if (e.site.tipo === "loja" && !e.ambitos.loja)
    a.push({ nivel: "aviso", texto: "Loja online sem âmbito (produtos, pagamentos, entregas) definido." });
  if (e.extras.assistente && !e.ambitos.assistente)
    a.push({ nivel: "aviso", texto: "Assistente sem âmbito (documentos, fluxos, integrações) definido." });
  if (e.extras.moderacao && !e.ambitos.moderacao_limite)
    a.push({ nivel: "aviso", texto: "Moderação sem limite de interações/mês — risco de âmbito aberto." });
  if (e.extras.anuncios && !(e.verba_anuncios > 0))
    a.push({ nivel: "aviso", texto: "Anúncios ligados mas sem verba mensal definida." });
  if (orc.porDefinir.length > 0)
    a.push({ nivel: "aviso", texto: `${orc.porDefinir.length} serviço(s) ainda [A DEFINIR] no catálogo.` });

  return a;
}
