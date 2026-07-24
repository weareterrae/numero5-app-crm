import { criarClienteServidor } from "@/lib/supabase/server";
import type { Estado } from "@/lib/dominio/funil";

export type Cliente = {
  id: string;
  nome_marca: string;
  setor: string | null;
  website: string | null;
  redes: Record<string, string>;
  origem: string | null;
  estado: Estado;
  valor_estimado: number | null;
  motivo_perda: string | null;
  notas_gerais: string | null;
  ultima_interacao_at: string | null;
  created_at: string;
};

/** Lê os campos do intake sem partir se a migração 0008 ainda não correu. */
export async function obterIntake(
  clienteId: string,
): Promise<{ intake_token: string | null; intake_submetido_em: string | null }> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("clientes")
    .select("intake_token, intake_submetido_em")
    .eq("id", clienteId)
    .maybeSingle();
  if (error || !data) return { intake_token: null, intake_submetido_em: null };
  return data as { intake_token: string | null; intake_submetido_em: string | null };
}

export type Atividade = {
  id: string;
  cliente_id: string;
  tipo: "nota" | "chamada" | "email" | "reuniao" | "mensagem";
  descricao: string;
  data: string;
  followup_em: string | null;
  followup_nota: string | null;
  concluido: boolean;
};

export type Contacto = {
  id: string;
  cliente_id: string;
  nome: string;
  cargo: string | null;
  departamento: string | null;
  email: string | null;
  telefone: string | null;
  principal: boolean;
};

export const DEPARTAMENTOS = [
  ["decisor", "Decisor"],
  ["geral", "Contacto geral"],
  ["financeiro", "Financeiro"],
  ["marketing", "Marketing"],
  ["tecnico", "Técnico"],
  ["outro", "Outro"],
] as const;

// NOTA: intake_token/intake_submetido_em NÃO entram aqui de propósito —
// só existem após a migração 0008. A ficha lê-os à parte, de forma tolerante,
// para nunca partir antes de a migração correr.
export const CAMPOS_CLIENTE =
  "id, nome_marca, setor, website, redes, origem, estado, valor_estimado, motivo_perda, notas_gerais, ultima_interacao_at, created_at";

export async function listarClientes(): Promise<Cliente[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("clientes")
    .select(CAMPOS_CLIENTE)
    .order("ultima_interacao_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as Cliente[];
}

export async function obterCliente(id: string): Promise<Cliente | null> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("clientes").select(CAMPOS_CLIENTE).eq("id", id).maybeSingle();
  return (data as unknown as Cliente) ?? null;
}

export async function listarAtividades(clienteId: string): Promise<Atividade[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("atividades")
    .select("id, cliente_id, tipo, descricao, data, followup_em, followup_nota, concluido")
    .eq("cliente_id", clienteId)
    .order("data", { ascending: false });
  return (data ?? []) as unknown as Atividade[];
}

export async function listarContactos(clienteId: string): Promise<Contacto[]> {
  const supabase = await criarClienteServidor();
  // "*" para não partir se a coluna departamento (0013) ainda não existir.
  const { data } = await supabase
    .from("contactos")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("principal", { ascending: false });
  return (data ?? []) as unknown as Contacto[];
}

/** Redes sociais que a ficha conhece, pela ordem em que se mostram. */
export const REDES = [
  ["site", "Website"],
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["linkedin", "LinkedIn"],
  ["youtube", "YouTube"],
  ["tiktok", "TikTok"],
  ["x", "X"],
  ["gmb", "Google Business"],
  ["outro", "Outro"],
] as const;

/** Passos de arranque quando um lead vira cliente. */
export const ONBOARDING = [
  ["acessos", "Recebi acessos às redes / plataformas"],
  ["marca", "Recebi logótipo e manual de marca"],
  ["tom", "Aliniei o tom de voz com o cliente"],
  ["metricool", "Liguei a marca no Metricool"],
  ["primeiro_plano", "Enviei o primeiro plano mensal"],
  ["faturacao", "Dados de faturação e avença tratados"],
] as const;

export const ORIGENS = [
  ["referencia", "Referência"],
  ["redes", "Redes sociais"],
  ["organico", "Orgânico"],
  ["outbound", "Abordagem nossa"],
  ["evento", "Evento"],
  ["outro", "Outro"],
] as const;
