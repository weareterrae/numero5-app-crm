import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Motor do quadro de produção mensal (/producao).
 *
 * Junta, por conta com plano mensal: o estado do plano do mês atual e do
 * seguinte, e quantos posts estão agendados no Metricool (tabela
 * `metricool_agendados`, preenchida pela sincronização). Tudo com leituras
 * TOLERANTES: se a migração 0066 ainda não correu, devolve {pronto:false}
 * em vez de rebentar.
 */

export type EstadoPlano =
  | "rascunho"
  | "enviado"
  | "aprovado"
  | "alteracoes"
  | "recusado"
  | null;

export type Semaforo = "verde" | "ambar" | "vermelho" | "neutro";

export type MesQuadro = {
  mesISO: string; // yyyy-mm-01
  planoId: string | null;
  estado: EstadoPlano;
  agendadoEm: string | null; // marca manual (planos.agendado_em)
  agendados: number | null; // total Metricool (null = sem dados de sincronização)
  pendentes: number | null; // ainda por publicar
};

export type LinhaQuadro = {
  clienteId: string;
  nome: string;
  atual: MesQuadro;
  proximo: MesQuadro;
  semaforo: Semaforo;
  accao: string;
};

export type Quadro =
  | { pronto: false }
  | { pronto: true; linhas: LinhaQuadro[]; janela: boolean; diasAteFim: number; proximoNome: string };

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Nº de dias que faltam até ao fim do mês atual (a data-limite para ter o próximo mês pronto). */
export function diasAteFimDoMes(hoje = new Date()): number {
  const y = hoje.getUTCFullYear();
  const m0 = hoje.getUTCMonth();
  const ultimoDia = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  return ultimoDia - hoje.getUTCDate();
}

function semaforoDe(proximo: MesQuadro, janela: boolean): { semaforo: Semaforo; accao: string } {
  switch (proximo.estado) {
    case "aprovado": {
      const ag = proximo.agendados;
      if (ag != null && ag > 0)
        return { semaforo: "verde", accao: `aprovado e ${ag} agendados` };
      if (proximo.agendadoEm)
        return { semaforo: "verde", accao: "aprovado e marcado como agendado" };
      return { semaforo: "verde", accao: "plano aprovado — falta agendar" };
    }
    case "enviado":
      return { semaforo: "ambar", accao: "enviado ao cliente — a aguardar decisão" };
    case "rascunho":
      return { semaforo: "ambar", accao: "em produção — por enviar" };
    case "alteracoes":
      return { semaforo: "ambar", accao: "alterações pedidas — por ajustar" };
    case "recusado":
    case null:
    default:
      return janela
        ? { semaforo: "vermelho", accao: "por começar — está na hora" }
        : { semaforo: "neutro", accao: "ainda dá tempo" };
  }
}

export async function lerQuadroProducao(svc: SupabaseClient): Promise<Quadro> {
  const hoje = new Date();
  const y = hoje.getUTCFullYear();
  const m0 = hoje.getUTCMonth();
  const atualISO = ymd(new Date(Date.UTC(y, m0, 1)));
  const proximoDate = new Date(Date.UTC(y, m0 + 1, 1));
  const proximoISO = ymd(proximoDate);
  const diasAteFim = diasAteFimDoMes(hoje);
  const janela = diasAteFim <= 20;

  // Contas com plano mensal (leitura tolerante: se a coluna não existe, migração pendente).
  const { data: clientes, error } = await svc
    .from("clientes")
    .select("id, nome_marca")
    .eq("plano_mensal", true)
    .order("nome_marca");
  if (error) return { pronto: false };

  const ids = (clientes ?? []).map((c) => c.id as string);
  if (ids.length === 0)
    return { pronto: true, linhas: [], janela, diasAteFim, proximoNome: MESES[proximoDate.getUTCMonth()] };

  // Planos dos dois meses.
  const planos = await svc
    .from("planos")
    .select("id, cliente_id, mes, estado, agendado_em")
    .in("cliente_id", ids)
    .in("mes", [atualISO, proximoISO])
    .then((r) => r.data ?? [], () => []);

  // Agendados do Metricool dos dois meses.
  const agendados = await svc
    .from("metricool_agendados")
    .select("cliente_id, mes, total, pendentes")
    .in("cliente_id", ids)
    .in("mes", [atualISO, proximoISO])
    .then((r) => r.data ?? [], () => []);

  type PlanoRow = { id: string; cliente_id: string; mes: string; estado: EstadoPlano; agendado_em: string | null };
  type AgRow = { cliente_id: string; mes: string; total: number; pendentes: number };

  const chave = (cid: string, mes: string) => `${cid}|${mes.slice(0, 10)}`;
  const planoPorChave = new Map<string, PlanoRow>();
  for (const p of planos as PlanoRow[]) planoPorChave.set(chave(p.cliente_id, p.mes), p);
  const agPorChave = new Map<string, AgRow>();
  for (const a of agendados as AgRow[]) agPorChave.set(chave(a.cliente_id, a.mes), a);

  const mesDe = (cid: string, mesISO: string): MesQuadro => {
    const p = planoPorChave.get(chave(cid, mesISO));
    const a = agPorChave.get(chave(cid, mesISO));
    return {
      mesISO,
      planoId: p?.id ?? null,
      estado: (p?.estado as EstadoPlano) ?? null,
      agendadoEm: p?.agendado_em ?? null,
      agendados: a ? a.total : null,
      pendentes: a ? a.pendentes : null,
    };
  };

  const linhas: LinhaQuadro[] = (clientes ?? []).map((c) => {
    const cid = c.id as string;
    const proximo = mesDe(cid, proximoISO);
    const atual = mesDe(cid, atualISO);
    const { semaforo, accao } = semaforoDe(proximo, janela);
    return { clienteId: cid, nome: (c.nome_marca as string) ?? "Cliente", atual, proximo, semaforo, accao };
  });

  // Ordena: o que arde primeiro (vermelho → âmbar → neutro → verde).
  const ordem: Record<Semaforo, number> = { vermelho: 0, ambar: 1, neutro: 2, verde: 3 };
  linhas.sort((a, b) => ordem[a.semaforo] - ordem[b.semaforo] || a.nome.localeCompare(b.nome));

  return { pronto: true, linhas, janela, diasAteFim, proximoNome: MESES[proximoDate.getUTCMonth()] };
}
