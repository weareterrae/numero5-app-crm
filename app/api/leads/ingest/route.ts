import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServico } from "@/lib/supabase/server";

/**
 * Ingestão de leads de qualquer cliente (org), autenticada por token.
 * O Make (ou o site do cliente) faz um POST com o token da org e os dados
 * da lead. Fire-and-forget: quem chama não depende da resposta.
 *
 * POST /api/leads/ingest
 *   { token, nome?, telefone?, email?, campos?{}, origem?, fonte_detalhe?, hp? }
 */

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*", // gated por token, não por origem
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
}

export async function POST(req: NextRequest) {
  const headers = cors();

  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "json" }, { status: 400, headers });
  }

  // Armadilha para bots.
  if (typeof d.hp === "string" && d.hp.trim() !== "")
    return NextResponse.json({ ok: true }, { headers });

  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const token = s(d.token);
  if (!token) return NextResponse.json({ ok: false, erro: "sem token" }, { status: 401, headers });

  const supabase = criarClienteServico();

  // token → org
  const { data: tk } = await supabase
    .from("org_tokens")
    .select("org_id, ativo")
    .eq("token", token)
    .maybeSingle();
  if (!tk || tk.ativo === false)
    return NextResponse.json({ ok: false, erro: "token invalido" }, { status: 401, headers });
  const orgId = tk.org_id as string;

  const nome = s(d.nome);
  const telefone = s(d.telefone);
  const email = s(d.email);
  if (!nome && !telefone && !email)
    return NextResponse.json({ ok: false, erro: "dados insuficientes" }, { status: 200, headers });

  // Dedup: mesma lead (email) na mesma org nos últimos 10 min → ignora (finge sucesso).
  if (email) {
    const desde = new Date(Date.now() - 600_000).toISOString();
    const { data: rep } = await supabase
      .from("crm_leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("email", email)
      .gte("created_at", desde)
      .limit(1);
    if (rep && rep.length > 0)
      return NextResponse.json({ ok: true, duplicada: true }, { headers });
  }

  // Etapa inicial = a primeira etapa "aberto" da org.
  const { data: etapa } = await supabase
    .from("crm_etapas")
    .select("id")
    .eq("org_id", orgId)
    .eq("tipo", "aberto")
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();

  const campos =
    d.campos && typeof d.campos === "object" && !Array.isArray(d.campos)
      ? (d.campos as Record<string, unknown>)
      : {};

  const { data: lead, error } = await supabase
    .from("crm_leads")
    .insert({
      org_id: orgId,
      etapa_id: etapa?.id ?? null,
      nome: nome || null,
      telefone: telefone || null,
      email: email || null,
      campos,
      origem: s(d.origem) || "integracao",
      fonte_detalhe: s(d.fonte_detalhe) || null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, erro: "db" }, { status: 500, headers });
  return NextResponse.json({ ok: true, id: lead.id }, { headers });
}
