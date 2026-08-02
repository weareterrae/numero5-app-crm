"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ESTADOS, exigeMotivo, type Estado } from "@/lib/dominio/funil";
import { ONBOARDING } from "@/lib/db/clientes";

function texto(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}

function numero(v: FormDataEntryValue | null): number | null {
  const s = (v ?? "").toString().trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function lerRedes(formData: FormData): Record<string, string> {
  const redes: Record<string, string> = {};
  for (const [chave, valor] of formData.entries()) {
    if (chave.startsWith("rede_")) {
      const v = valor.toString().trim();
      if (v) redes[chave.slice(5)] = v;
    }
  }
  return redes;
}

export async function criarCliente(formData: FormData) {
  const nome = texto(formData.get("nome_marca"));
  if (!nome) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      nome_marca: nome,
      setor: texto(formData.get("setor")),
      website: texto(formData.get("website")),
      origem: texto(formData.get("origem")),
      estado: (texto(formData.get("estado")) ?? "lead") as Estado,
      valor_estimado: numero(formData.get("valor_estimado")),
      notas_gerais: texto(formData.get("notas_gerais")),
      redes: lerRedes(formData),
      owner_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return;
  revalidatePath("/clientes");
  revalidatePath("/");
  redirect(`/clientes/${data.id}`);
}

export async function atualizarCliente(formData: FormData) {
  const id = texto(formData.get("id"));
  const nome = texto(formData.get("nome_marca"));
  if (!id || !nome) return;

  const supabase = await criarClienteServidor();
  await supabase
    .from("clientes")
    .update({
      nome_marca: nome,
      setor: texto(formData.get("setor")),
      website: texto(formData.get("website")),
      origem: texto(formData.get("origem")),
      valor_estimado: numero(formData.get("valor_estimado")),
      notas_gerais: texto(formData.get("notas_gerais")),
      redes: lerRedes(formData),
    })
    .eq("id", id);

  // Campos de colunas mais recentes (migrações 0016 / 0018). Vão num update à
  // parte: se a migração ainda não correu, isto falha em silêncio sem partir
  // a gravação dos dados base.
  await supabase
    .from("clientes")
    .update({
      idioma: formData.get("idioma") === "en" ? "en" : "pt",
      metricool_blog_id: texto(formData.get("metricool_blog_id")),
      empresa_fiscal: texto(formData.get("empresa_fiscal")),
      nif: texto(formData.get("nif")),
      morada: texto(formData.get("morada")),
      codigo_postal: texto(formData.get("codigo_postal")),
      localidade: texto(formData.get("localidade")),
      kit_logo: texto(formData.get("kit_logo")),
      kit_cores: texto(formData.get("kit_cores")),
      kit_fontes: texto(formData.get("kit_fontes")),
      kit_notas: texto(formData.get("kit_notas")),
    })
    .eq("id", id);

  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
}

/** Guarda o checklist de onboarding (jsonb chave→bool). */
export async function guardarOnboarding(formData: FormData) {
  const id = texto(formData.get("id"));
  if (!id) return;
  const supabase = await criarClienteServidor();
  const estado: Record<string, boolean> = {};
  for (const [chave] of ONBOARDING) estado[chave] = formData.get(`ob_${chave}`) === "on";
  await supabase.from("clientes").update({ onboarding: estado }).eq("id", id);
  revalidatePath(`/clientes/${id}`);
}

/** Muda o estado no funil. Ao dar como perdido, o motivo é obrigatório. */
export async function mudarEstado(formData: FormData) {
  const id = texto(formData.get("id"));
  const novo = texto(formData.get("estado")) as Estado | null;
  if (!id || !novo || !ESTADOS.includes(novo)) return;

  const motivo = texto(formData.get("motivo_perda"));
  if (exigeMotivo(novo) && !motivo) return;

  const supabase = await criarClienteServidor();
  await supabase
    .from("clientes")
    .update({ estado: novo, ...(exigeMotivo(novo) ? { motivo_perda: motivo } : {}) })
    .eq("id", id);

  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  revalidatePath("/clientes/funil");
  revalidatePath("/");
}

export async function adicionarAtividade(formData: FormData) {
  const clienteId = texto(formData.get("cliente_id"));
  const descricao = texto(formData.get("descricao"));
  if (!clienteId || !descricao) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("atividades").insert({
    cliente_id: clienteId,
    autor_id: user?.id ?? null,
    tipo: (texto(formData.get("tipo")) ?? "nota") as string,
    descricao,
    followup_em: texto(formData.get("followup_em")),
    followup_nota: texto(formData.get("followup_nota")),
  });

  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/");
}

export async function concluirFollowup(formData: FormData) {
  const id = texto(formData.get("atividade_id"));
  const clienteId = texto(formData.get("cliente_id"));
  if (!id) return;

  const supabase = await criarClienteServidor();
  await supabase.from("atividades").update({ concluido: true }).eq("id", id);

  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/");
}

/** Apaga o cliente e tudo o que lhe está ligado (diagnósticos, propostas,
 *  avenças, produção, atividades, conversas — via ON DELETE CASCADE). */
export async function apagarCliente(formData: FormData) {
  const id = texto(formData.get("id"));
  if (!id) return;
  const supabase = await criarClienteServidor();
  await supabase.from("clientes").delete().eq("id", id);
  revalidatePath("/clientes");
  revalidatePath("/");
  redirect("/clientes");
}

export async function adicionarContacto(formData: FormData) {
  const clienteId = texto(formData.get("cliente_id"));
  const nome = texto(formData.get("nome"));
  if (!clienteId || !nome) return;

  const supabase = await criarClienteServidor();
  const novoContacto: Record<string, unknown> = {
    cliente_id: clienteId,
    nome,
    cargo: texto(formData.get("cargo")),
    email: texto(formData.get("email")),
    telefone: texto(formData.get("telefone")),
    principal: formData.get("principal") === "on",
  };
  // departamento vem da migração 0013 — só se inclui se preenchido, para não
  // partir a criação de contactos antes de a migração correr.
  const dep = texto(formData.get("departamento"));
  if (dep) novoContacto.departamento = dep;

  await supabase.from("contactos").insert(novoContacto);

  revalidatePath(`/clientes/${clienteId}`);
}

export async function apagarContacto(formData: FormData) {
  const id = texto(formData.get("contacto_id"));
  const clienteId = texto(formData.get("cliente_id"));
  if (!id) return;

  const supabase = await criarClienteServidor();
  await supabase.from("contactos").delete().eq("id", id);
  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
}

export async function editarContacto(formData: FormData) {
  const id = texto(formData.get("contacto_id"));
  const clienteId = texto(formData.get("cliente_id"));
  const nome = texto(formData.get("nome"));
  if (!id || !nome) return;

  const supabase = await criarClienteServidor();
  await supabase
    .from("contactos")
    .update({
      nome,
      departamento: texto(formData.get("departamento")),
      cargo: texto(formData.get("cargo")),
      email: texto(formData.get("email")),
      telefone: texto(formData.get("telefone")),
      principal: formData.get("principal") === "on",
    })
    .eq("id", id);

  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
}

/** Guarda o nível de complexidade do cliente (Fase 2, Prioridade 2). */
export async function guardarComplexidade(formData: FormData) {
  const id = (formData.get("id") ?? "").toString();
  const nivel = (formData.get("complexidade") ?? "").toString();
  if (!id || !["baixa", "media", "alta", "personalizada"].includes(nivel)) return;
  const supabase = await criarClienteServidor();
  await supabase.from("clientes").update({ complexidade: nivel }).eq("id", id);
  revalidatePath(`/clientes/${id}/rentabilidade`);
  revalidatePath(`/clientes/${id}`);
}

/** Liga uma organização da Sede (sem cliente) a esta ficha — ativa o portal. */
export async function ligarSedeOrg(formData: FormData) {
  const clienteId = (formData.get("cliente_id") ?? "").toString();
  const orgId = (formData.get("org_id") ?? "").toString();
  if (!clienteId || !orgId) return;
  const supabase = await criarClienteServidor();
  // Só liga orgs livres — nunca rouba a org de outro cliente.
  await supabase.from("orgs").update({ cliente_id: clienteId }).eq("id", orgId).is("cliente_id", null);
  await supabase.from("atividades").insert({
    cliente_id: clienteId,
    tipo: "nota",
    descricao: "🏠 Sede ligada a esta ficha (org associada).",
  });
  revalidatePath(`/clientes/${clienteId}`);
}
