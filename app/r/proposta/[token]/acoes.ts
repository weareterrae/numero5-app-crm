"use server";

import { criarClienteServico } from "@/lib/supabase/server";
import { avisarStaffAcao } from "@/lib/sede/notificar";

/**
 * O cliente decide a proposta a partir da página pública. Sem sessão: o
 * token é a chave. Ao marcar 'aceite' ou 'recusada', os gatilhos da base
 * de dados tratam do resto (mover o cliente no funil, criar a avença).
 */
export async function decidirProposta(
  token: string,
  decisao: "aceite" | "recusada",
  nota: string,
) {
  if (!token || !["aceite", "recusada"].includes(decisao)) {
    return { ok: false as const, erro: "Pedido inválido." };
  }

  const supabase = criarClienteServico();
  const { data: p } = await supabase
    .from("propostas")
    .select("id, estado, cliente_id")
    .eq("partilha_token", token)
    .eq("partilha_ativa", true)
    .maybeSingle();
  if (!p) return { ok: false as const, erro: "Proposta não encontrada." };

  // Já decidida — não se decide duas vezes.
  if (p.estado === "aceite" || p.estado === "recusada") {
    return { ok: true as const, jaDecidida: true, estado: p.estado };
  }

  const comentario = (nota ?? "").trim() || null;
  const patch: Record<string, unknown> = {
    estado: decisao,
    decidida_em: new Date().toISOString(),
    nota_decisao: comentario,
  };
  if (decisao === "recusada") patch.motivo_recusa = comentario;

  const { error } = await supabase.from("propostas").update(patch).eq("id", p.id);
  if (error) return { ok: false as const, erro: "Não foi possível registar. Tenta de novo." };

  // Aceite → arranque automático (idempotente). Nunca impede a decisão:
  // qualquer falha aqui fica registada e resolve-se no operador.
  if (decisao === "aceite") {
    try {
      await arranqueAutomatico(p.id);
    } catch (e) {
      console.error("arranqueAutomatico:", e);
    }
  }

  await avisarStaffAcao({
    clienteId: p.cliente_id,
    titulo: decisao === "aceite" ? "ACEITOU a proposta 🎉" : "recusou a proposta",
    detalhe: comentario ? `Comentário: «${comentario}»` : undefined,
  });

  return { ok: true as const, estado: decisao };
}

/**
 * Proposta aceite → a operação nasce sozinha, sem copiar nada à mão:
 *  1. cobrança do arranque (Fundação) agendada, se houver setup;
 *  2. cobrança da avença do 1.º mês agendada, se houver avença;
 *  3. tarefa de arranque (follow-up amanhã) com os acessos a pedir,
 *     derivados do ESCOPO vendido — nada genérico.
 * Idempotente: correr duas vezes não duplica nada (chave cliente+mes+tipo,
 * e o follow-up só é criado se ainda não existir).
 */
async function arranqueAutomatico(propostaId: string) {
  const supabase = criarClienteServico();
  const { data: prop } = await supabase
    .from("propostas")
    .select("cliente_id, setup_valor, avenca_valor, escopo")
    .eq("id", propostaId)
    .maybeSingle();
  if (!prop) return;

  const mes = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const setup = Number(prop.setup_valor) || 0;
  const avenca = Number(prop.avenca_valor) || 0;

  // 1+2 — calendário de cobrança inicial (upsert = idempotente).
  if (setup > 0) {
    await supabase.from("cobrancas").upsert(
      {
        cliente_id: prop.cliente_id,
        mes,
        tipo: "setup",
        descricao: "Arranque (Fundação)",
        valor: setup,
        estado: "por_cobrar",
      },
      { onConflict: "cliente_id,mes,tipo", ignoreDuplicates: true },
    );
  }
  if (avenca > 0) {
    await supabase.from("cobrancas").upsert(
      {
        cliente_id: prop.cliente_id,
        mes,
        tipo: "avenca",
        descricao: "Acompanhamento mensal — 1.º mês",
        valor: avenca,
        estado: "por_cobrar",
      },
      { onConflict: "cliente_id,mes,tipo", ignoreDuplicates: true },
    );
  }

  // 3 — tarefa de arranque com os acessos derivados do escopo vendido.
  const e = (prop.escopo ?? {}) as {
    canais?: Record<string, { ativo?: boolean }>;
    site?: { tipo?: string };
    extras?: Record<string, boolean>;
  };
  const pedir: string[] = [];
  const canais = Object.entries(e.canais ?? {})
    .filter(([, c]) => c?.ativo)
    .map(([k]) => k);
  if (canais.length) pedir.push(`acessos às redes (${canais.join(", ")})`);
  if (e.extras?.anuncios) pedir.push("acesso ao Meta Business / Google Ads e método de pagamento da verba");
  if (e.site?.tipo && e.site.tipo !== "nenhum") pedir.push("acessos ao domínio e alojamento do site");
  if (e.extras?.assistente) pedir.push("documentos/FAQ para treinar o assistente");
  if (e.extras?.moderacao) pedir.push("regras de resposta e limites da moderação");
  pedir.push("logótipo e kit de marca", "dados de faturação (NIF, morada)");

  const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const marcador = "🚀 Proposta aceite — arranque criado";
  const { data: jaTem } = await supabase
    .from("atividades")
    .select("id")
    .eq("cliente_id", prop.cliente_id)
    .like("descricao", `${marcador}%`)
    .limit(1)
    .maybeSingle();
  if (!jaTem) {
    await supabase.from("atividades").insert({
      cliente_id: prop.cliente_id,
      tipo: "nota",
      descricao: `${marcador}: cobranças agendadas (${[setup > 0 ? "Fundação" : null, avenca > 0 ? "1.ª avença" : null].filter(Boolean).join(" + ") || "—"}). A pedir ao cliente: ${pedir.join("; ")}.`,
      followup_em: amanha,
      followup_nota: "Arranque: pedir acessos e materiais ao cliente (lista na nota).",
    });
  }
}

/**
 * Proposta expirada: o cliente pede uma atualização. Não aceita nada — só
 * deixa rasto para o operador voltar a falar. (Parte 48.)
 */
export async function pedirAtualizacaoProposta(token: string, nota: string) {
  if (!token) return { ok: false as const, erro: "Pedido inválido." };
  const supabase = criarClienteServico();
  const { data: p } = await supabase
    .from("propostas")
    .select("cliente_id, estado")
    .eq("partilha_token", token)
    .eq("partilha_ativa", true)
    .maybeSingle();
  if (!p) return { ok: false as const, erro: "Proposta não encontrada." };
  if (p.estado === "aceite" || p.estado === "recusada")
    return { ok: true as const, jaDecidida: true };

  const comentario = (nota ?? "").trim();
  await supabase.from("atividades").insert({
    cliente_id: p.cliente_id,
    tipo: "nota",
    descricao: `O cliente pediu uma atualização da proposta expirada.${comentario ? ` «${comentario}»` : ""} 🖐️`,
  });
  await avisarStaffAcao({
    clienteId: p.cliente_id,
    titulo: "pediu uma atualização da proposta",
    detalhe: comentario ? `«${comentario}»` : undefined,
  });
  return { ok: true as const };
}
