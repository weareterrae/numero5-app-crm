import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerJson, obterIA } from "@/lib/ia/provider";
import {
  SISTEMA_PROPOSTA,
  montarDossier,
  type ConteudoProposta,
  type DossierProposta,
} from "@/lib/ia/prompts/proposta";

export async function POST(req: NextRequest) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  const ia = obterIA();
  if (!ia)
    return NextResponse.json(
      { erro: "Falta configurar a IA (IA_API_KEY). Podes escrever a proposta à mão." },
      { status: 200 },
    );

  let dossier: DossierProposta;
  try {
    dossier = await req.json();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  if (!dossier?.cliente) return NextResponse.json({ erro: "Falta o cliente." }, { status: 400 });

  const emIngles = dossier.idioma === "en";
  const sistema = emIngles
    ? `WRITE EVERYTHING IN ENGLISH — the client speaks English. Keep the Nº 5 voice (warm, direct, confident, human, "you") but in natural English. The Portuguese/"tu" language rule below does NOT apply; every other rule still does. All JSON string values must be in English.\n\n${SISTEMA_PROPOSTA}`
    : SISTEMA_PROPOSTA;

  const r = await ia.gerar({
    sistema,
    utilizador: `${emIngles ? "Write the proposal from this real dossier" : "Escreve a proposta a partir deste dossiê real"}:\n\n${montarDossier(dossier)}`,
    json: true,
    maxTokens: 4096,
  });

  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 200 });

  const conteudo = lerJson<ConteudoProposta>(r.texto);
  if (!conteudo?.abertura || !Array.isArray(conteudo.prioridades))
    return NextResponse.json({ erro: "A IA devolveu algo que não consegui ler. Tenta de novo." }, { status: 200 });

  return NextResponse.json({ conteudo });
}
