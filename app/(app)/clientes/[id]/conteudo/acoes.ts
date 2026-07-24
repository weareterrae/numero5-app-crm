"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { PecaGerada } from "@/lib/ia/prompts/conteudo";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

/** Parte hashtags escritas à mão (espaços ou linhas) e garante o #. */
function lerHashtags(v: FormDataEntryValue | null): string[] {
  return (v ?? "")
    .toString()
    .split(/[\s,]+/)
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`));
}

const TIPOS_OK = new Set(["post", "carrossel", "reel", "story", "outro"]);

/**
 * Guarda de uma vez as peças que a IA gerou (vêm num JSON escondido).
 * Cada peça fica em rascunho, pronta a rever.
 */
export async function guardarPecas(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  const mes = t(formData.get("mes"));
  const bruto = t(formData.get("pecas"));
  if (!clienteId || !mes || !bruto) return;

  let pecas: PecaGerada[];
  try {
    pecas = JSON.parse(bruto);
  } catch {
    return;
  }
  if (!Array.isArray(pecas) || pecas.length === 0) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Continua a numerar a seguir ao que já existe neste mês.
  const { data: ultimo } = await supabase
    .from("conteudos")
    .select("ordem")
    .eq("cliente_id", clienteId)
    .eq("mes", mes)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  let ordem = (ultimo?.ordem ?? 0) + 1;

  const linhas = pecas.map((p) => ({
    cliente_id: clienteId,
    mes,
    tipo: TIPOS_OK.has(p.tipo) ? p.tipo : "outro",
    tema: p.tema?.toString().slice(0, 300) ?? null,
    copy: p.copy?.toString() ?? "",
    hashtags: Array.isArray(p.hashtags) ? p.hashtags : [],
    extra: {
      ...(Array.isArray(p.slides) && p.slides.length ? { slides: p.slides } : {}),
      ...(p.guiao ? { guiao: p.guiao } : {}),
    },
    estado: "rascunho",
    ordem: ordem++,
    criado_por: user?.id ?? null,
  }));

  await supabase.from("conteudos").insert(linhas);
  revalidatePath(`/clientes/${clienteId}/conteudo`);
}

/** Grava as alterações do comercial a uma peça. */
export async function atualizarConteudo(formData: FormData) {
  const id = t(formData.get("id"));
  const clienteId = t(formData.get("cliente_id"));
  if (!id) return;

  const slidesTexto = t(formData.get("slides"));
  const guiao = t(formData.get("guiao"));
  const extra: Record<string, unknown> = {};
  if (slidesTexto)
    extra.slides = slidesTexto
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  if (guiao) extra.guiao = guiao;

  const supabase = await criarClienteServidor();
  await supabase
    .from("conteudos")
    .update({
      tema: t(formData.get("tema")),
      copy: (formData.get("copy") ?? "").toString(),
      hashtags: lerHashtags(formData.get("hashtags")),
      extra,
    })
    .eq("id", id);

  if (clienteId) revalidatePath(`/clientes/${clienteId}/conteudo`);
}

/** Aprova (ou volta a rascunho) uma peça. */
export async function alternarAprovado(formData: FormData) {
  const id = t(formData.get("id"));
  const clienteId = t(formData.get("cliente_id"));
  const estado = formData.get("estado") === "aprovado" ? "aprovado" : "rascunho";
  if (!id) return;
  const supabase = await criarClienteServidor();
  await supabase.from("conteudos").update({ estado }).eq("id", id);
  if (clienteId) revalidatePath(`/clientes/${clienteId}/conteudo`);
}

export async function apagarConteudo(formData: FormData) {
  const id = t(formData.get("id"));
  const clienteId = t(formData.get("cliente_id"));
  if (!id) return;
  const supabase = await criarClienteServidor();
  await supabase.from("conteudos").delete().eq("id", id);
  if (clienteId) revalidatePath(`/clientes/${clienteId}/conteudo`);
}
