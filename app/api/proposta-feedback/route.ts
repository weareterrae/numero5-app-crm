import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServico } from "@/lib/supabase/server";
import { enviarEmailResend } from "@/lib/email/resend";

/**
 * Recebe o feedback de uma proposta pública (ex.: numerocinco.pt/linhasgerais),
 * cria/atualiza o lead no CRM e avisa por email. Público e com CORS.
 * Fire-and-forget: a página não depende da resposta.
 */

const ORIGENS_OK = new Set([
  "https://numerocinco.pt",
  "https://www.numerocinco.pt",
  "https://app.numerocinco.pt",
]);

const AVISO_PARA = "sandro.sousa@numerocinco.pt";

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
  const marca = s(d.marca) || "Linhas Gerais";

  const campos: Array<[string, string]> = [
    ["Feedback", s(d.feedback)],
    ["O que pretendem", s(d.objetivos)],
    ["Como pretendem trabalhar", s(d.como)],
    ["O que podemos melhorar", s(d.melhorar)],
    ["Como veem o negócio", s(d.negocio)],
    ["A equipa", s(d.equipa)],
  ];
  const preenchidos = campos.filter(([, v]) => v.length > 0);
  if (preenchidos.length === 0)
    return NextResponse.json({ ok: false, erro: "sem respostas" }, { status: 200, headers });

  const quem = s(d.nome);
  const cargo = s(d.cargo);
  const cabecalho = quem || cargo ? `De: ${quem}${cargo ? ` (${cargo})` : ""}\n\n` : "";
  const linhas = preenchidos.map(([k, v]) => `• ${k}:\n${v}`).join("\n\n");

  const supabase = criarClienteServico();

  // Encontrar ou criar o lead da marca.
  let clienteId: string | null = null;
  const { data: existente } = await supabase
    .from("clientes")
    .select("id")
    .ilike("nome_marca", marca)
    .limit(1)
    .maybeSingle();
  if (existente) {
    clienteId = existente.id as string;
  } else {
    const { data: novo } = await supabase
      .from("clientes")
      .insert({
        nome_marca: marca,
        estado: "lead",
        website: "https://linhasgerais.pt",
        notas_gerais: "Lead da proposta pública em numerocinco.pt/linhasgerais.",
      })
      .select("id")
      .single();
    clienteId = (novo?.id as string) ?? null;
  }

  if (clienteId) {
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await supabase.from("atividades").insert({
      cliente_id: clienteId,
      tipo: "nota",
      descricao: `📝 Respondeu à proposta (numerocinco.pt/linhasgerais).\n\n${cabecalho}${linhas}`,
      followup_em: amanha,
      followup_nota: `${marca} respondeu à proposta — responder em 24 h.`,
    });
  }

  // Aviso por email ao Sandro (não parte a resposta se falhar).
  try {
    await enviarEmailResend({
      para: AVISO_PARA,
      assunto: `📝 ${marca} respondeu à proposta${quem ? ` — ${quem}` : ""}`,
      texto: `${marca} acabou de responder à proposta em numerocinco.pt/linhasgerais.\n\n${cabecalho}${linhas}`,
      link: "https://app.numerocinco.pt/clientes",
    });
  } catch {
    /* email é best-effort */
  }

  return NextResponse.json({ ok: true }, { headers });
}
