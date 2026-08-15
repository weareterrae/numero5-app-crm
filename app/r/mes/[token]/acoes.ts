"use server";

import { criarClienteServico } from "@/lib/supabase/server";

export type EstadoReacao = { ok: boolean; reacao: string | null };

/**
 * O cliente reage a uma publicação na página pública do relatório. Sem sessão:
 * o token é a chave. Uma reação por post (upsert); clicar na mesma limpa-a.
 * Isto alimenta a decisão de conteúdo do mês seguinte — o que o cliente quer
 * ver mais, menos, ou marcou como favorito.
 */
export async function reagirPost(
  token: string,
  postUrl: string,
  reacao: "mais" | "menos" | "favorito" | "",
): Promise<EstadoReacao> {
  if (!token || !postUrl) return { ok: false, reacao: null };
  if (reacao !== "" && !["mais", "menos", "favorito"].includes(reacao))
    return { ok: false, reacao: null };

  const supabase = criarClienteServico();
  const { data: rel } = await supabase
    .from("relatorios")
    .select("id")
    .eq("partilha_token", token)
    .eq("partilha_ativa", true)
    .maybeSingle();
  if (!rel) return { ok: false, reacao: null };

  if (reacao === "") {
    await supabase
      .from("relatorio_post_reacoes")
      .delete()
      .match({ relatorio_id: rel.id, post_url: postUrl, autor: "cliente" });
    return { ok: true, reacao: null };
  }

  await supabase
    .from("relatorio_post_reacoes")
    .upsert(
      { relatorio_id: rel.id, post_url: postUrl, reacao, autor: "cliente" },
      { onConflict: "relatorio_id,post_url,autor" },
    );
  return { ok: true, reacao };
}
