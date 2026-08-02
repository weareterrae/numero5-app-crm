"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { criarClienteServidor, criarClienteServico } from "@/lib/supabase/server";
import { contextoSede } from "@/lib/sede/contexto";
import { obterIA } from "@/lib/ia/provider";
import { canaisQueVendem, leadsLentas, rotuloOrigem, type LeadSinal } from "@/lib/sede/sinais";

function primeiroDiaMesISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function nomeMes() {
  return new Date().toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}
function semTags(html: string | null | undefined) {
  return (html ?? "")
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Gera (uma vez por mês) o resumo do mês do cliente: recap + proposta de rumo
 * para o mês seguinte. Só se ainda não existir. Isolado pela sessão.
 */
export async function gerarResumoMes() {
  const ctx = await contextoSede();
  if (!ctx.clienteId) return;
  const mes = primeiroDiaMesISO();
  const svc = criarClienteServico();

  // Já existe? Não volta a gerar (custo).
  const { data: existe } = await svc
    .from("sede_resumos")
    .select("id")
    .eq("cliente_id", ctx.clienteId)
    .eq("mes", mes)
    .maybeSingle();
  if (existe) {
    revalidatePath("/sede");
    return;
  }

  const ia = obterIA();
  if (!ia) return;

  // ---- Contexto ancorado (mesma disciplina do assistente) ----
  const L: string[] = [];
  const { data: c } = await svc
    .from("clientes")
    .select("nome_marca, setor, brief_sede, kpis")
    .eq("id", ctx.clienteId)
    .maybeSingle();
  const marca = c?.nome_marca || ctx.marca.nome;
  if (c?.setor) L.push(`Setor: ${c.setor}`);
  const b = (c?.brief_sede && typeof c.brief_sede === "object" ? c.brief_sede : {}) as Record<string, string>;
  if (b.ofertas) L.push(`Ofertas: ${b.ofertas}`);
  if (b.epocas) L.push(`Épocas-chave: ${b.epocas}`);
  if (b.nunca_dizer) L.push(`⛔ NUNCA DIZER: ${b.nunca_dizer}`);

  const { data: rel } = await svc
    .from("relatorios")
    .select("titulo, conteudo_html")
    .eq("cliente_id", ctx.clienteId)
    .eq("estado", "enviado")
    .order("mes", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rel) L.push(`Último relatório (${rel.titulo || ""}): ${semTags(rel.conteudo_html).slice(0, 900)}`);

  const { data: plano } = await svc
    .from("planos")
    .select("titulo, estado")
    .eq("cliente_id", ctx.clienteId)
    .eq("arquivado", false)
    .in("estado", ["enviado", "aprovado", "alteracoes"])
    .order("mes", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (plano) L.push(`Plano atual: ${plano.titulo || "plano do mês"} (${plano.estado}).`);

  const supabase = await criarClienteServidor();
  const { data: leadsRaw } = await supabase
    .from("crm_leads")
    .select("created_at, primeira_resposta_at, resultado, arquivado, origem, valor_negocio, ganho_em")
    .eq("org_id", ctx.org.id)
    .eq("arquivado", false);
  const leads = (leadsRaw ?? []) as LeadSinal[];
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const leadsMes = leads.filter((l) => l.created_at && new Date(l.created_at).getTime() >= inicioMes).length;
  const ganhosMes = leads.filter((l) => l.resultado === "ganho" && l.ganho_em && new Date(l.ganho_em).getTime() >= inicioMes);
  const roiMes = ganhosMes.reduce((s, l) => s + (Number(l.valor_negocio) || 0), 0);
  const lentas = leadsLentas(leads);
  const canais = canaisQueVendem(leads).slice(0, 3);
  L.push(
    `Leads este mês: ${leadsMes}. Vendas fechadas este mês: ${ganhosMes.length}${roiMes > 0 ? ` (€${roiMes.toLocaleString("pt-PT")})` : ""}. Leads por responder há +24h: ${lentas}.`,
  );
  if (canais.length) L.push(`Canais que mais venderam: ${canais.map((x) => `${rotuloOrigem(x.origem)} (${x.n})`).join(", ")}.`);
  if (c?.kpis && typeof c.kpis === "object") {
    const k = Object.entries(c.kpis as Record<string, unknown>)
      .filter(([, v]) => v)
      .map(([kk, v]) => `${kk}: ${v}`)
      .join("; ");
    if (k) L.push(`Metas do cliente: ${k}.`);
  }

  const SISTEMA = `És o assistente de IA de ${marca}. Escreves o RESUMO DO MÊS para o dono de ${marca}, dentro do portal (a Sede). O Nº 5 é a agência que trabalha para ${marca}.

TAREFA — escreve um texto curto e caloroso (PT-PT, «tu»), com 3 partes e estes títulos exatos:
**O mês em três linhas** — o que aconteceu, com os números reais (leads, vendas, respostas). Sê honesto; se o mês foi calmo, di-lo sem drama.
**O que proponho para o próximo mês** — 3 a 4 ideias concretas de plano MENSAL, ligadas ao negócio e aos números. É uma proposta de rumo para o mês inteiro (nunca por semana).
**Um passo, se quiseres ir mais longe** — 1 sugestão de serviço que faça sentido, com convite a pedir proposta no separador «Serviços».

REGRAS INVIOLÁVEIS: usa só os DADOS abaixo; NUNCA inventes números; NUNCA reveles nem estimes preços (o valor nasce do diagnóstico); nada de resultados garantidos; respeita «o que nunca dizer». Máximo ~180 palavras. 0-1 emoji.

DADOS (${nomeMes()}):
${L.join("\n")}`;

  const r = await ia.gerar({
    sistema: SISTEMA,
    utilizador: "Escreve o resumo do mês agora.",
    maxTokens: 900,
    temperatura: 0.7,
  });
  if (!r.ok || !r.texto.trim()) return;

  await svc.from("sede_resumos").insert({ cliente_id: ctx.clienteId, mes, texto: r.texto.trim() });
  await svc.from("atividades").insert({
    cliente_id: ctx.clienteId,
    tipo: "nota",
    descricao: `🤖 O assistente gerou o resumo do mês na Sede.`,
  });
  revalidatePath("/sede");
}

/**
 * Troca a marca ativa da Sede. Externo: só para marcas a que ADERIU
 * (org_membros) — pedir outra é simplesmente ignorado. Staff: qualquer uma.
 */
export async function trocarMarcaSede(formData: FormData) {
  const slug = (formData.get("slug") ?? "").toString().trim();
  if (!slug) redirect("/sede");

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?proximo=/sede");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("externo")
    .eq("id", user.id)
    .maybeSingle();
  const isStaff = perfil?.externo === false;

  const { data: org } = await supabase.from("orgs").select("id, slug").eq("slug", slug).maybeSingle();
  if (!org) redirect("/sede");

  if (!isStaff) {
    const { data: mem } = await supabase
      .from("org_membros")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("org_id", org.id)
      .maybeSingle();
    if (!mem) redirect("/sede"); // não é dele — ignora em silêncio
  }

  const jar = await cookies();
  jar.set("sede_org", org.slug, { path: "/", httpOnly: true, sameSite: "lax" });
  revalidatePath("/sede");
  redirect("/sede");
}
