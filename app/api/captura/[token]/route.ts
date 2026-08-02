import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServico } from "@/lib/supabase/server";

/**
 * Captação de leads do CLIENTE: recebe um contacto do site/página dele e
 * cria a lead na org certa (crm_leads), identificada pelo captura_token.
 * Público e com CORS aberto — o site do cliente é um domínio qualquer.
 * Segurança: token opaco por org + honeypot + anti-flood por org.
 */

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: CORS });
  }

  // Armadilha para bots.
  if (typeof d.hp === "string" && d.hp.trim() !== "") return NextResponse.json({ ok: true }, { headers: CORS });

  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const nome = s(d.nome).slice(0, 120);
  const email = s(d.email).slice(0, 200);
  const telefone = s(d.telefone).slice(0, 40);
  const mensagem = s(d.mensagem).slice(0, 1000);
  if (!nome && !email && !telefone)
    return NextResponse.json({ ok: false, erro: "dados insuficientes" }, { status: 200, headers: CORS });
  if (email && !email.includes("@"))
    return NextResponse.json({ ok: false, erro: "email inválido" }, { status: 200, headers: CORS });

  const svc = criarClienteServico();

  // Org pelo token (opaco). Sem org válida, finge sucesso (não dá pistas).
  const { data: org } = await svc
    .from("orgs")
    .select("id, ativo")
    .eq("captura_token", token)
    .maybeSingle();
  if (!org || org.ativo === false) return NextResponse.json({ ok: true }, { headers: CORS });

  // Anti-flood: máx. 10 leads/minuto por org.
  const desde = new Date(Date.now() - 60_000).toISOString();
  const { count } = await svc
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("origem", "formulario")
    .gte("created_at", desde);
  if ((count ?? 0) >= 10) return NextResponse.json({ ok: true }, { headers: CORS });

  // Dedup: mesma org + mesmo email nas últimas 24h → regista atividade, não duplica.
  if (email) {
    const ontem = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: dup } = await svc
      .from("crm_leads")
      .select("id")
      .eq("org_id", org.id)
      .ilike("email", email)
      .gte("created_at", ontem)
      .limit(1)
      .maybeSingle();
    if (dup) {
      await svc.from("crm_atividades").insert({
        org_id: org.id,
        lead_id: dup.id,
        tipo: "sistema",
        descricao: "Voltou a preencher o formulário." + (mensagem ? ` Mensagem: «${mensagem}»` : ""),
      });
      return NextResponse.json({ ok: true }, { headers: CORS });
    }
  }

  // 1.ª etapa do funil da org (menor ordem), se existir.
  const { data: etapa } = await svc
    .from("crm_etapas")
    .select("id")
    .eq("org_id", org.id)
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: lead, error } = await svc
    .from("crm_leads")
    .insert({
      org_id: org.id,
      etapa_id: etapa?.id ?? null,
      nome: nome || null,
      email: email || null,
      telefone: telefone || null,
      origem: "formulario",
      notas: mensagem || null,
      campos: { via: "captura", pagina: s(d.pagina).slice(0, 300) || null },
    })
    .select("id")
    .single();
  if (error || !lead) return NextResponse.json({ ok: false }, { status: 200, headers: CORS });

  await svc.from("crm_atividades").insert({
    org_id: org.id,
    lead_id: lead.id,
    tipo: "sistema",
    descricao: "🌐 Lead entrou pelo formulário." + (mensagem ? ` Mensagem: «${mensagem}»` : ""),
  });

  return NextResponse.json({ ok: true }, { headers: CORS });
}
