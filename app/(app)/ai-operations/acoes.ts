"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Controlo de tráfego do rollout: legacy ↔ gateway.
 *
 * É a válvula de segurança da migração. Voltar a 0 % é o rollback e não
 * precisa de deploy — critério de aceitação nº7 do P0.
 *
 * Escreve com o cliente do UTILIZADOR (não service role), de propósito:
 * assim a política RLS `ai_assistants_escrita` (só equipa) é quem decide
 * se a alteração passa. Um cliente externo autenticado não consegue mexer
 * no rollout de ninguém.
 */
export async function definirTrafego(assistantId: string, percentagem: number) {
  const pct = Math.max(0, Math.min(100, Math.round(percentagem)));
  const sb = await criarClienteServidor();

  const { error } = await sb
    .from("ai_assistants")
    .update({
      traffic_percentage: pct,
      // 0 % desliga o gateway por inteiro — rollback limpo, não meio-termo.
      gateway_enabled: pct > 0,
    })
    .eq("id", assistantId);

  if (error) return { ok: false as const, erro: error.message };

  // Deixa rasto: uma mudança de rollout é uma decisão de operação.
  await sb.from("ai_incidents").insert({
    tipo: "TRAFFIC_SPIKE",
    severidade: "info",
    assistant_id: assistantId,
    titulo: pct === 0 ? "Rollout revertido para 0 %" : `Rollout a ${pct} %`,
    detalhe: { percentagem: pct },
    resolvido: true,
    resolvido_em: new Date().toISOString(),
  });

  revalidatePath("/ai-operations");
  return { ok: true as const, percentagem: pct };
}

/** Marca um incidente como resolvido, com quem o fechou implícito na RLS. */
export async function resolverIncidente(id: string) {
  const sb = await criarClienteServidor();
  const { error } = await sb
    .from("ai_incidents")
    .update({ resolvido: true, resolvido_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false as const, erro: error.message };
  revalidatePath("/ai-operations");
  return { ok: true as const };
}

/**
 * Fecha de uma vez todos os incidentes abertos de um tipo.
 *
 * PORQUE É PRECISO, e não é preguiça
 *
 * Estes incidentes vêm aos molhos: um modelo doente abre um
 * MODEL_UNHEALTHY, um CIRCUIT_OPEN e um HIGH_ERROR_RATE no mesmo minuto,
 * e recupera sozinho três minutos depois. Fechá-los um a um faz com que
 * ninguém os feche — e uma fila que ninguém fecha deixa de ser um alarme
 * e passa a ser decoração. Foi o que aconteceu: 36 abertos, zero lidos.
 *
 * O que interessa registar não é «alguém carregou 36 vezes». É que uma
 * pessoa olhou para aquele tipo de falha e decidiu que estava tratado.
 *
 * Escreve com o cliente do UTILIZADOR: é a RLS que decide se pode, não
 * este código.
 */
export async function resolverPorTipo(tipo: string) {
  const sb = await criarClienteServidor();
  const { data, error } = await sb
    .from("ai_incidents")
    .update({ resolvido: true, resolvido_em: new Date().toISOString() })
    .eq("tipo", tipo)
    .eq("resolvido", false)
    .select("id");
  if (error) return { ok: false as const, erro: error.message };
  revalidatePath("/ai-operations");
  return { ok: true as const, fechados: (data ?? []).length };
}
