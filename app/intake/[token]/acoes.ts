"use server";

import { criarClienteServico } from "@/lib/supabase/server";
import { obterContexto } from "@/lib/dominio/diagnostico/analisar-site";
import { correrTodas } from "@/lib/dominio/diagnostico/verificacoes";
import { pontuarSite } from "@/lib/dominio/diagnostico/pontuacao";
import { ESCOPO_VAZIO, type Escopo } from "@/lib/dominio/orcamento";
import type { ChaveObjetivo } from "@/lib/dominio/diagnostico/recomendacoes";
import type { Brief } from "@/lib/dominio/intake";

export type SubmissaoIntake = {
  token: string;
  website: string;
  redes: Record<string, string>;
  temHoje: string;
  objetivos: ChaveObjetivo[];
  objetivosTexto: string;
  pedido: Escopo;
  orcamento: string;
  brief: Brief;
};

/**
 * Recebe o formulário preenchido pelo cliente. É PÚBLICO (não há sessão):
 * a segurança é o token, que só o cliente certo tem. Usa a service role
 * para escrever, tal como as páginas de partilha /r/.
 */
export async function submeterIntake(dados: SubmissaoIntake) {
  const supabase = criarClienteServico();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome_marca, estado, intake_submetido_em")
    .eq("intake_token", dados.token)
    .maybeSingle();
  if (!cliente) return { ok: false as const, erro: "Link inválido." };

  // Analisar o site, se o cliente indicou um.
  let siteScore: number | null = null;
  let siteResultado: unknown[] = [];
  let siteUrl: string | null = dados.website?.trim() || null;
  if (siteUrl) {
    const obtido = await obterContexto(siteUrl);
    if (obtido.ok) {
      const { data: catalogo } = await supabase
        .from("verificacoes_catalogo")
        .select("codigo, titulo, peso, ativo");
      const ativos = new Set((catalogo ?? []).filter((c) => c.ativo).map((c) => c.codigo));
      const pesos = Object.fromEntries((catalogo ?? []).map((c) => [c.codigo, Number(c.peso) || 1]));
      const titulos = Object.fromEntries((catalogo ?? []).map((c) => [c.codigo, c.titulo]));
      const todos = correrTodas(obtido.ctx);
      const resultados = ativos.size > 0 ? todos.filter((r) => ativos.has(r.codigo)) : todos;
      siteScore = pontuarSite(resultados, pesos);
      siteResultado = resultados.map((r) => ({ ...r, titulo: titulos[r.codigo] ?? r.codigo }));
      siteUrl = obtido.ctx.urlFinal;
    }
  }

  // Guardar o diagnóstico como preenchido pelo cliente.
  const { error: erroDiag } = await supabase.from("diagnosticos").insert({
    cliente_id: cliente.id,
    origem: "cliente",
    estado: "rascunho",
    site_url: siteUrl,
    site_score: siteScore,
    site_resultado: siteResultado,
    estado_atual: { site: siteUrl ?? "", notas: dados.temHoje ?? "" },
    objetivos: { selecionados: dados.objetivos ?? [], texto_livre: dados.objetivosTexto ?? "" },
    pedido: { ...ESCOPO_VAZIO, ...dados.pedido, orcamento: dados.orcamento || "" },
    brief: dados.brief ?? {},
  });
  if (erroDiag) return { ok: false as const, erro: "Não foi possível guardar. Tenta de novo." };

  // Atualizar os links do cliente e mover no funil.
  await supabase
    .from("clientes")
    .update({
      website: siteUrl ?? undefined,
      redes: Object.keys(dados.redes ?? {}).length ? dados.redes : undefined,
      estado: ["lead", "contactado"].includes(cliente.estado) ? "diagnostico" : cliente.estado,
      intake_submetido_em: new Date().toISOString(),
    })
    .eq("id", cliente.id);

  // Deixar rasto na timeline.
  await supabase.from("atividades").insert({
    cliente_id: cliente.id,
    tipo: "nota",
    descricao: "O cliente preencheu o diagnóstico pelo link. 🖐️",
  });

  // Limpar o rascunho — o diagnóstico final passa a ser a fonte (tolerante).
  await supabase
    .from("clientes")
    .update({ intake_rascunho: null, intake_passo: 0 })
    .eq("id", cliente.id)
    .then(
      (r) => r,
      () => ({ data: null }),
    );

  return { ok: true as const, nome: cliente.nome_marca, jaTinha: !!cliente.intake_submetido_em };
}

/**
 * Guarda o diagnóstico em curso (a cada passo). Público, protegido pelo token.
 * Tolerante: se a migração 0034 ainda não correu, não faz nada e não parte.
 */
export async function guardarRascunhoIntake(dados: {
  token: string;
  passo: number;
  website?: string;
  redes?: Record<string, string>;
  temHoje?: string;
  objetivos?: ChaveObjetivo[];
  objetivosTexto?: string;
  pedido?: Escopo;
  orcamento?: string;
  brief?: Brief;
}) {
  const supabase = criarClienteServico();
  const { token, passo, ...rascunho } = dados;
  await supabase
    .from("clientes")
    .update({ intake_rascunho: rascunho, intake_passo: Math.max(0, Math.round(passo) || 0) })
    .eq("intake_token", token)
    .is("intake_submetido_em", null)
    .then(
      (r) => r,
      () => ({ data: null }),
    );
  return { ok: true as const };
}
