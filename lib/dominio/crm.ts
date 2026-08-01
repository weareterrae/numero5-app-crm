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

// --- Canais de contacto -------------------------------------------------

/** Primeiro nome (para saudações), ou "Olá" se faltar. */
export function primeiroNome(nomeCompleto: string | null): string {
  const p = (nomeCompleto || "").trim().split(/\s+/)[0];
  return p || "";
}

/** Telefone em formato internacional só-dígitos (para wa.me). PT por defeito. */
export function telInternacional(raw: string | null, indicativo = "351"): string | null {
  if (!raw) return null;
  const tinhaMais = raw.trim().startsWith("+");
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (tinhaMais) return d;
  if (d.length === 9) return indicativo + d; // número nacional PT
  return d;
}

export function linkTelefone(tel: string | null): string | null {
  if (!tel) return null;
  const d = tel.replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : null;
}

export function linkWhatsapp(tel: string | null, texto?: string): string | null {
  const n = telInternacional(tel);
  if (!n) return null;
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

export function linkEmail(email: string | null, assunto?: string, corpo?: string): string | null {
  if (!email) return null;
  const p = new URLSearchParams();
  if (assunto) p.set("subject", assunto);
  if (corpo) p.set("body", corpo);
  const qs = p.toString();
  return `mailto:${email}${qs ? `?${qs}` : ""}`;
}

/** Mensagens-modelo (editáveis antes de enviar). Genéricas — sem inventar factos. */
export function mensagemWhatsappPadrao(orgNome: string, nome: string | null): string {
  const n = primeiroNome(nome);
  return `Olá${n ? " " + n : ""}! Aqui é do ${orgNome}. Recebemos o seu contacto e teríamos todo o gosto em ajudar. Quando lhe dá jeito falarmos?`;
}
export function assuntoEmailPadrao(orgNome: string): string {
  return `${orgNome} — o seu contacto`;
}
export function corpoEmailPadrao(orgNome: string, nome: string | null): string {
  const n = primeiroNome(nome);
  return `Olá${n ? " " + n : ""},\n\nRecebemos o seu contacto e teríamos todo o gosto em ajudar. Qual a melhor altura para falarmos?\n\nCom os melhores cumprimentos,\n${orgNome}`;
}

export interface Atividade {
  id: string;
  lead_id: string;
  autor_id: string | null;
  tipo: "nota" | "chamada" | "email" | "mensagem" | "reuniao" | "sistema";
  descricao: string;
  data: string;
  followup_em: string | null;
  concluido: boolean;
}

export const ATIVIDADE_ICON: Record<Atividade["tipo"], string> = {
  nota: "📝",
  chamada: "📞",
  email: "✉️",
  mensagem: "💬",
  reuniao: "🤝",
  sistema: "•",
};

// --- Métricas -----------------------------------------------------------

/** Tempo médio até à 1.ª resposta, em minutos (só das leads respondidas). */
export function tempoMedioRespostaMin(
  leads: Array<Pick<Lead, "created_at" | "primeira_resposta_at">>,
): number | null {
  const resp = leads.filter((l) => l.primeira_resposta_at);
  if (!resp.length) return null;
  const soma = resp.reduce((t, l) => {
    const dt = (Date.parse(l.primeira_resposta_at as string) - Date.parse(l.created_at)) / 60000;
    return t + Math.max(0, dt);
  }, 0);
  return Math.round(soma / resp.length);
}

/** Formata uma duração em minutos de forma humana. */
export function formatarDuracao(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h${min % 60 ? ` ${min % 60}m` : ""}`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}

/** Taxa de conversão para "ganho" sobre o total (0..1) ou null se sem leads. */
export function taxaGanho(leads: Array<Pick<Lead, "resultado">>): number | null {
  if (!leads.length) return null;
  return leads.filter((l) => l.resultado === "ganho").length / leads.length;
}

export function percentagem(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
