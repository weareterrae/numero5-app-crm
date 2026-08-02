import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { criarClienteServidor, criarClienteServico } from "@/lib/supabase/server";
import { obterIA } from "@/lib/ia/provider";

// Rate-limit simples por utilizador (melhor-esforço, por instância).
const balde = new Map<string, { t: number; c: number }>();
function rateLimit(uid: string) {
  const now = Date.now();
  if (balde.size > 3000) balde.clear();
  const b = balde.get(uid) ?? { t: now, c: 0 };
  if (now - b.t > 60000) {
    b.t = now;
    b.c = 0;
  }
  b.c++;
  balde.set(uid, b);
  return b.c <= 20;
}

function semTags(html: string | null | undefined) {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function inicioMesISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export async function POST(req: NextRequest) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });
  if (!rateLimit(user.id)) return NextResponse.json({ resposta: "Estou a apanhar o fôlego 😅 dá-me um minutinho e tenta outra vez." });

  const ia = obterIA();
  if (!ia) return NextResponse.json({ resposta: "O assistente está em manutenção. Fala com a equipa do Nº 5 — respondemos depressa. 🖐️" });

  let corpo: { mensagens?: { role: string; content: string }[] };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  const mensagens = Array.isArray(corpo.mensagens) ? corpo.mensagens.slice(-14) : [];
  if (!mensagens.length) return NextResponse.json({ erro: "Sem mensagem." }, { status: 400 });

  // Resolve a org SEMPRE pela sessão (externo → adesão; staff → cookie de preview).
  const { data: perfil } = await supabase.from("profiles").select("externo").eq("id", user.id).maybeSingle();
  const isStaff = perfil?.externo === false;
  let orgId: string | null = null;
  if (isStaff) {
    const jar = await cookies();
    const slug = jar.get("sede_org")?.value;
    if (slug) orgId = (await supabase.from("orgs").select("id").eq("slug", slug).maybeSingle()).data?.id ?? null;
  } else {
    orgId = (await supabase.from("org_membros").select("org_id").eq("profile_id", user.id).limit(1).maybeSingle()).data?.org_id ?? null;
  }
  if (!orgId) return NextResponse.json({ resposta: "Ainda estamos a preparar o teu espaço. 🖐️" });

  const { data: org } = await supabase.from("orgs").select("nome, marca").eq("id", orgId).maybeSingle();
  const { data: ligacao } = await supabase.from("orgs").select("cliente_id").eq("id", orgId).maybeSingle();
  const clienteId = (ligacao as { cliente_id?: string | null } | null)?.cliente_id ?? null;
  const marca = org?.nome ?? "a tua marca";

  // ---- Contexto ancorado ----
  const svc = criarClienteServico();
  const L: string[] = [];

  if (clienteId) {
    const { data: c } = await svc
      .from("clientes")
      .select("nome_marca, setor, website, brief_sede")
      .eq("id", clienteId)
      .maybeSingle();
    if (c) {
      L.push(`--- O NEGÓCIO (${c.nome_marca || marca}) ---`);
      if (c.setor) L.push(`Setor: ${c.setor}`);
      if (c.website) L.push(`Site: ${c.website}`);
      const b = (c.brief_sede && typeof c.brief_sede === "object" ? c.brief_sede : {}) as Record<string, string>;
      if (b.publico_alvo) L.push(`Público-alvo: ${b.publico_alvo}`);
      if (b.ofertas) L.push(`Ofertas em destaque: ${b.ofertas}`);
      if (b.epocas) L.push(`Épocas-chave: ${b.epocas}`);
      if (b.nunca_dizer) L.push(`⛔ O QUE NUNCA DIZER: ${b.nunca_dizer}`);
    }

    const { data: rel } = await svc
      .from("relatorios")
      .select("titulo, mes, conteudo_html")
      .eq("cliente_id", clienteId)
      .eq("estado", "enviado")
      .order("mes", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rel) L.push(`--- ÚLTIMO RELATÓRIO (${rel.titulo || ""}) ---\n${semTags(rel.conteudo_html).slice(0, 1200)}`);

    const { data: plano } = await svc
      .from("planos")
      .select("titulo, estado")
      .eq("cliente_id", clienteId)
      .in("estado", ["enviado", "aprovado", "alteracoes"])
      .order("mes", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (plano) L.push(`Plano atual: ${plano.titulo || "plano do mês"} (${plano.estado}).`);

    const { data: peds } = await svc.from("pedidos").select("estado").eq("cliente_id", clienteId);
    const abertos = (peds ?? []).filter((p) => p.estado !== "feito").length;
    if (peds) L.push(`Pedidos abertos: ${abertos}.`);
  }

  // leads (orgs-keyed) via RLS + filtro por org
  const { data: leads } = await supabase
    .from("crm_leads")
    .select("primeira_resposta_at, resultado, arquivado, created_at")
    .eq("org_id", orgId)
    .eq("arquivado", false);
  if (leads) {
    const desde = inicioMesISO();
    const mes = leads.filter((l) => l.created_at && l.created_at >= desde).length;
    const porResp = leads.filter((l) => !l.primeira_resposta_at && l.resultado === "aberto").length;
    const ganhos = leads.filter((l) => l.resultado === "ganho").length;
    L.push(`--- LEADS ---\nEste mês: ${mes} · Por responder: ${porResp} · Vendas fechadas: ${ganhos}.`);
  }

  const SISTEMA = `És o assistente de IA de ${marca} — vives dentro do portal (a Sede) e falas com o dono/equipa de ${marca}. Conheces o negócio a partir dos DADOS abaixo (a ficha que mantêm, os relatórios e o plano que o Nº 5 produz, as leads e as vendas). O Nº 5 é a agência de marketing que trabalha para ${marca}.

COMO FALAS
- Português de Portugal, tratamento por «tu», caloroso e direto. Respostas curtas e úteis (2-6 frases ou uma lista pequena).
- Explicas o trabalho de forma simples, dás ideias concretas ao negócio e respondes a perguntas sobre os números e o plano.
- Se te pedirem para escrever algo (uma legenda, uma ideia de post), escreve pronto a usar. 0-1 emoji.

⛔ REGRAS INVIOLÁVEIS
- Usa SÓ os DADOS abaixo. NUNCA inventes métricas, números, resultados ou factos. Se não sabes, diz que não sabes e sugere falar com a equipa do Nº 5.
- NUNCA reveles preços, custos, nem dados de outros clientes ou internos da agência.
- Não prometas resultados garantidos. Números antes de adjetivos.
- És consultivo: sugeres e explicas; as decisões e a execução são das pessoas.
- Respeita rigorosamente «o que nunca dizer» se estiver nos dados.

${L.join("\n")}`;

  const conversa = mensagens
    .map((m) => `${m.role === "assistant" ? "ASSISTENTE" : "CLIENTE"}: ${String(m.content).slice(0, 2000)}`)
    .join("\n\n");

  const r = await ia.gerar({
    sistema: SISTEMA,
    utilizador: `${conversa}\n\nResponde à última mensagem do CLIENTE.`,
    maxTokens: 1200,
    temperatura: 0.7,
  });

  if (!r.ok) return NextResponse.json({ resposta: "Tive um percalço a pensar 😅 tenta outra vez, ou fala com a equipa do Nº 5." });
  return NextResponse.json({ resposta: r.texto });
}
