import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServico } from "@/lib/supabase/server";

/**
 * Recebe um lead do formulário do site (numerocinco.pt) e cria-o no CRM.
 * Público e com CORS — o site é outro domínio. Chamado em fire-and-forget:
 * o site não depende da resposta, por isso nunca perde um lead se isto falhar.
 */

const ORIGENS_OK = new Set([
  "https://numerocinco.pt",
  "https://www.numerocinco.pt",
  "https://app.numerocinco.pt",
]);

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ORIGENS_OK.has(origin) ? origin : "https://numerocinco.pt";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get("origin"));

  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers });
  }

  // Armadilha para bots.
  if (typeof d.hp === "string" && d.hp.trim() !== "")
    return NextResponse.json({ ok: true }, { headers });

  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const marca = s(d.marca);
  const email = s(d.email);
  if (marca.length < 2 || !email.includes("@"))
    return NextResponse.json({ ok: false, erro: "dados insuficientes" }, { status: 200, headers });

  const supabase = criarClienteServico();

  // Anti-flood: demasiados leads públicos (sem dono) no último minuto = provável bot.
  const desde = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("clientes")
    .select("id", { count: "exact", head: true })
    .is("owner_id", null)
    .gte("created_at", desde);
  if ((count ?? 0) >= 8) return NextResponse.json({ ok: true }, { headers }); // finge sucesso

  // Dedup: se já há um contacto com este email, não duplica o cliente.
  const { data: existente } = await supabase
    .from("contactos")
    .select("cliente_id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (existente) {
    await supabase.from("atividades").insert({
      cliente_id: existente.cliente_id,
      tipo: "nota",
      descricao: "🌐 Voltou a preencher o formulário do site.",
    });
    return NextResponse.json({ ok: true }, { headers });
  }

  const { data: cliente, error } = await supabase
    .from("clientes")
    .insert({
      nome_marca: marca,
      setor: s(d.setor) || null,
      website: s(d.site) || null,
      estado: "lead",
      notas_gerais: s(d.notas) || null,
    })
    .select("id")
    .single();
  if (error || !cliente) return NextResponse.json({ ok: false }, { status: 200, headers });

  await supabase.from("contactos").insert({
    cliente_id: cliente.id,
    nome: s(d.nome) || marca,
    email,
    telefone: s(d.telefone) || null,
    principal: true,
  });
  await supabase.from("atividades").insert({
    cliente_id: cliente.id,
    tipo: "nota",
    descricao: "🌐 Lead entrou pelo formulário do site.",
  });

  return NextResponse.json({ ok: true }, { headers });
}
