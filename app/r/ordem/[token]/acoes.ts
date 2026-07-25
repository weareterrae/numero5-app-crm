"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServico } from "@/lib/supabase/server";

/**
 * Decisão do cliente sobre uma ordem de alteração (página pública, service role).
 * decisao: aceite | recusada | esclarecimento. Só «aceite» a coloca a caminho
 * da produção — a decisão fica registada.
 */
export async function decidirOrdem(token: string, decisao: string, formData: FormData) {
  if (!["aceite", "recusada", "esclarecimento"].includes(decisao)) return;
  const nota = (formData.get("nota") ?? "").toString().trim() || null;

  const supabase = criarClienteServico();
  const patch: Record<string, unknown> = { estado: decisao };
  if (decisao === "aceite") patch.aceite_em = new Date().toISOString();
  if (nota) patch.decisao_nota = nota;

  // Só decide enquanto está à espera do cliente (enviada ou esclarecimento).
  await supabase
    .from("ordens_alteracao")
    .update(patch)
    .eq("token", token)
    .in("estado", ["enviada", "esclarecimento"]);

  revalidatePath(`/r/ordem/${token}`);
}
