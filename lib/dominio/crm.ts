/**
 * CRM multi-cliente — lógica pura (sem UI, sem base de dados).
 * Um "org" é um cliente da agência; cada um tem o seu funil de leads.
 */

export type EtapaTipo = "aberto" | "ganho" | "perdido";
export type Resultado = "aberto" | "ganho" | "perdido";

export interface Org {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
}

export interface Etapa {
  id: string;
  chave: string;
  titulo: string;
  ordem: number;
  tipo: EtapaTipo;
}

export interface Lead {
  id: string;
  org_id: string;
  etapa_id: string | null;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  campos: Record<string, unknown>;
  origem: string | null;
  fonte_detalhe: string | null;
  notas: string | null;
  dono_id: string | null;
  resultado: Resultado;
  motivo_perda: string | null;
  primeira_resposta_at: string | null;
  ultima_atividade_at: string | null;
  arquivado: boolean;
  created_at: string;
}

/** Funil-modelo para uma escola (usado ao criar a org do Externato). */
export const ETAPAS_ESCOLA: Array<Omit<Etapa, "id">> = [
  { chave: "nova", titulo: "Nova", ordem: 1, tipo: "aberto" },
  { chave: "contactada", titulo: "Contactada", ordem: 2, tipo: "aberto" },
  { chave: "visita_marcada", titulo: "Visita marcada", ordem: 3, tipo: "aberto" },
  { chave: "visitou", titulo: "Visitou", ordem: 4, tipo: "aberto" },
  { chave: "matriculada", titulo: "Matriculada", ordem: 5, tipo: "ganho" },
  { chave: "perdida", titulo: "Perdida", ordem: 6, tipo: "perdido" },
];

/** Minutos decorridos desde um instante ISO (0 se inválido). */
export function minutosDesde(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}

/** Etiqueta humana de "há quanto tempo" — para o cronómetro de resposta. */
export function haQuantoTempo(iso: string | null): string {
  const m = minutosDesde(iso);
  if (m < 1) return "agora mesmo";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

/**
 * Urgência de uma lead ainda por responder (sem primeira resposta).
 * Serve para pintar o cartão: verde (rápido), âmbar, vermelho (a arrefecer).
 */
export function urgencia(lead: Pick<Lead, "primeira_resposta_at" | "created_at">): "ok" | "atencao" | "tarde" | null {
  if (lead.primeira_resposta_at) return null; // já respondida
  const m = minutosDesde(lead.created_at);
  if (m <= 10) return "ok";
  if (m <= 60) return "atencao";
  return "tarde";
}

/** Nome a mostrar de uma lead, com recurso ao contacto se faltar o nome. */
export function nomeLead(lead: Pick<Lead, "nome" | "email" | "telefone">): string {
  return lead.nome?.trim() || lead.email?.trim() || lead.telefone?.trim() || "Sem nome";
}
