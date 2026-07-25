"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Resultado } from "@/lib/dominio/diagnostico/verificacoes";
import {
  gerarRecomendacoes,
  sugerirPacote,
  type ChaveObjetivo,
} from "@/lib/dominio/diagnostico/recomendacoes";

export type RedeAvaliada = { nome: string; notas: (number | null)[]; obs: string };

export type PayloadDiagnostico = {
  id: string;
  site_url: string | null;
  site_score: number | null;
  site_resultado: Resultado[];
  redes_scorecard: RedeAvaliada[];
  estado_atual: {
    site?: string;
    redes?: string;
    presenca?: string;
    ferramentas?: string;
    orcamento_atual?: string;
    notas?: string;
  };
  objetivos: { selecionados: ChaveObjetivo[]; texto_livre: string };
};

/** Cria um diagnóstico novo para o cliente e abre o editor. */
export async function criarDiagnostico(formData: FormData) {
  const clienteId = (formData.get("cliente_id") ?? "").toString();
  if (!clienteId) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("website")
    .eq("id", clienteId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("diagnosticos")
    .insert({
      cliente_id: clienteId,
      criado_por: user?.id ?? null,
      site_url: cliente?.website ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return;
  revalidatePath(`/clientes/${clienteId}`);
  redirect(`/diagnosticos/${data.id}`);
}

/** Guarda o diagnóstico e recalcula as recomendações a partir dos dados. */
export async function guardarDiagnostico(p: PayloadDiagnostico) {
  const supabase = await criarClienteServidor();

  const { data: diag } = await supabase
    .from("diagnosticos")
    .select("cliente_id")
    .eq("id", p.id)
    .maybeSingle();
  if (!diag) return { ok: false as const, erro: "Diagnóstico não encontrado." };

  // Redes com nota calculada e critérios fracos identificados.
  const { pontuarRede, CRITERIOS_REDE } = await import("@/lib/dominio/diagnostico/pontuacao");
  const redes = p.redes_scorecard.map((r) => ({
    nome: r.nome,
    nota: pontuarRede(r.notas),
    fracos: r.notas
      .map((n, i) => (n === 0 ? CRITERIOS_REDE[i].split(" (")[0].toLowerCase() : null))
      .filter((v): v is string => v !== null),
  }));

  const entrada = {
    temSite: !!p.site_url,
    notaSite: p.site_score,
    resultados: p.site_resultado,
    redes,
    semPresenca: [] as string[],
    objetivos: p.objetivos.selecionados,
  };

  const recomendacoes = gerarRecomendacoes(entrada);
  const pacote = sugerirPacote(entrada);

  const { error } = await supabase
    .from("diagnosticos")
    .update({
      site_url: p.site_url,
      site_score: p.site_score,
      site_resultado: p.site_resultado,
      redes_scorecard: p.redes_scorecard,
      estado_atual: p.estado_atual,
      objetivos: p.objetivos,
      recomendacoes,
      pacote_sugerido: pacote.chave,
    })
    .eq("id", p.id);

  if (error) return { ok: false as const, erro: error.message };

  revalidatePath(`/diagnosticos/${p.id}`);
  revalidatePath(`/clientes/${diag.cliente_id}`);
  return { ok: true as const, recomendacoes, pacote };
}

/** Dá o diagnóstico por concluído e move o cliente no funil. */
export async function concluirDiagnostico(formData: FormData) {
  const id = (formData.get("id") ?? "").toString();
  if (!id) return;

  const supabase = await criarClienteServidor();
  const { data: diag } = await supabase
    .from("diagnosticos")
    .select("cliente_id")
    .eq("id", id)
    .maybeSingle();
  if (!diag) return;

  await supabase.from("diagnosticos").update({ estado: "concluido" }).eq("id", id);
  await supabase
    .from("clientes")
    .update({ estado: "diagnostico" })
    .eq("id", diag.cliente_id)
    .in("estado", ["lead", "contactado"]);

  revalidatePath(`/diagnosticos/${id}`);
  revalidatePath(`/clientes/${diag.cliente_id}`);
  revalidatePath("/");
}

/** Liga ou desliga a página pública de partilha do relatório. */
export async function alternarPartilha(formData: FormData) {
  const id = (formData.get("id") ?? "").toString();
  const ativar = formData.get("ativar") === "1";
  if (!id) return;

  const supabase = await criarClienteServidor();
  await supabase.from("diagnosticos").update({ partilha_ativa: ativar }).eq("id", id);
  revalidatePath(`/diagnosticos/${id}`);
}

/** Guarda o resumo e as notas da análise interna (Fase 4). */
export async function guardarAnalise(formData: FormData) {
  const id = (formData.get("id") ?? "").toString();
  if (!id) return;
  const texto = (v: FormDataEntryValue | null) => {
    const s = (v ?? "").toString().trim();
    return s === "" ? null : s;
  };
  const analise = {
    resumo: texto(formData.get("resumo")),
    notas: texto(formData.get("notas")),
  };
  const supabase = await criarClienteServidor();
  await supabase.from("diagnosticos").update({ analise }).eq("id", id);
  revalidatePath(`/diagnosticos/${id}`);
}
