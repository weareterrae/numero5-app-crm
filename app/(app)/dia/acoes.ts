"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterIA } from "@/lib/ia/provider";

/**
 * O Quinto escreve o briefing do dia do OPERADOR: lê o estado real do negócio
 * (recebe-o já resumido da página) e devolve um plano de ataque curto.
 * Gera 1× por dia e guarda em `configuracoes` (chave briefing_dia_YYYY-MM-DD).
 */
export async function gerarBriefingDia(formData: FormData) {
  const contexto = (formData.get("contexto") ?? "").toString().slice(0, 6000);
  if (!contexto.trim()) return;

  const hoje = new Date().toISOString().slice(0, 10);
  const chave = `briefing_dia_${hoje}`;
  const supabase = await criarClienteServidor();

  const { data: existe } = await supabase
    .from("configuracoes")
    .select("chave")
    .eq("chave", chave)
    .maybeSingle();
  if (existe) {
    revalidatePath("/dia");
    return;
  }

  const ia = obterIA();
  if (!ia) return;

  const SISTEMA = `És o Quinto — o braço-direito do Sandro na agência Nº 5 (marketing digital + IA, PT/Angola). Escreves o BRIEFING DO DIA dele, a partir do estado REAL do negócio (dados abaixo). És interno: podes falar de dinheiro, margens e prioridades sem rodeios.

FORMATO (PT-PT, «tu», direto, máx. ~200 palavras, 0-1 emoji), com estes títulos exatos:
**O dia em três linhas** — o retrato honesto: o que está bem, o que está a arder.
**Por ordem de ataque** — 3 a 5 ações concretas, a mais importante primeiro, cada uma com o porquê em meia linha. Prioriza: dinheiro parado > marca às escuras ou publicação falhada > clientes à espera > leads a arrefecer > resto.
**Um olho no dinheiro** — uma linha sobre cobranças/receita por recuperar, se houver.

REGRAS: usa SÓ os dados abaixo, nunca inventes números nem clientes; se o dia estiver calmo, di-lo e sugere UMA coisa proativa (ex.: follow-up a um cliente frio). Números antes de adjetivos.

ESTADO DO NEGÓCIO (${hoje}):
${contexto}`;

  const r = await ia.gerar({
    n5: "app-briefing-dia",
    sistema: SISTEMA,
    utilizador: "Escreve o briefing do dia.",
    maxTokens: 900,
    temperatura: 0.6,
  });
  if (!r.ok || !r.texto.trim()) return;

  await supabase.from("configuracoes").upsert(
    { chave, valor: r.texto.trim(), descricao: "Briefing diário do Quinto (gerado)" },
    { onConflict: "chave" },
  );
  revalidatePath("/dia");
}
