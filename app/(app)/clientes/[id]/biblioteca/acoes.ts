"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

const t = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

// Upload seguro: extensões de trabalho comuns, máx. 25 MB por ficheiro.
const EXTENSOES_OK = new Set([
  "pdf", "png", "jpg", "jpeg", "webp", "gif", "svg", "mp4", "mov", "mp3",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "zip",
]);
const MAX_BYTES = 25 * 1024 * 1024;

export async function juntarConteudo(formData: FormData) {
  const clienteId = t(formData.get("cliente_id"));
  const tema = t(formData.get("tema"));
  if (!clienteId || !tema) return;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ficheiro anexo (opcional; migração 0044). Falha de upload não impede o registo.
  let ficheiro: string | null = null;
  const f = formData.get("ficheiro");
  if (f instanceof File && f.size > 0 && f.size <= MAX_BYTES) {
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (EXTENSOES_OK.has(ext)) {
      const nomeLimpo = f.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const caminho = `${clienteId}/${crypto.randomUUID().slice(0, 8)}-${nomeLimpo}`;
      const { error } = await supabase.storage
        .from("materiais")
        .upload(caminho, f, { contentType: f.type || undefined })
        .then((r) => r, () => ({ error: { message: "storage indisponível" } }));
      if (!error) ficheiro = caminho;
    }
  }

  const base = {
    cliente_id: clienteId,
    tema,
    formato: t(formData.get("formato")),
    canal: t(formData.get("canal")),
    data: t(formData.get("data")),
    desempenho: t(formData.get("desempenho")),
    reutilizavel: formData.get("reutilizavel") !== "nao",
    origem: t(formData.get("origem")),
    licenca: t(formData.get("licenca")),
    notas: t(formData.get("notas")),
    autor_id: user?.id ?? null,
  };
  // Coluna «ficheiro» num insert tolerante: se a 0044 não correu, repete sem ela.
  // (cast: a coluna é nova e pode não existir nos tipos gerados)
  const comFicheiro = { ...base, ficheiro } as unknown as typeof base;
  const { error: insErr } = await supabase
    .from("biblioteca_conteudos")
    .insert(ficheiro ? comFicheiro : base);
  if (insErr && ficheiro) await supabase.from("biblioteca_conteudos").insert(base);

  revalidatePath(`/clientes/${clienteId}/biblioteca`);
}

export async function apagarConteudo(id: string, clienteId: string, _fd: FormData) {
  const supabase = await criarClienteServidor();
  // Se houver ficheiro anexo, remove-o do bucket (query tolerante à falta da coluna).
  const { data: row } = await supabase
    .from("biblioteca_conteudos")
    .select("ficheiro")
    .eq("id", id)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }));
  const ficheiro = (row as { ficheiro?: string | null } | null)?.ficheiro;
  if (ficheiro) await supabase.storage.from("materiais").remove([ficheiro]);
  await supabase.from("biblioteca_conteudos").delete().eq("id", id);
  revalidatePath(`/clientes/${clienteId}/biblioteca`);
}
