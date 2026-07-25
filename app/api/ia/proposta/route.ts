import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerJson, obterIA } from "@/lib/ia/provider";
import {
  SISTEMA_PROPOSTA,
  montarDossier,
  type ConteudoProposta,
  type DossierProposta,
} from "@/lib/ia/prompts/proposta";
import { validarConteudoProposta } from "@/lib/ia/prompts/validar-proposta";

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

  const pedido = {
    sistema,
    utilizador: `${emIngles ? "Write the proposal from this real dossier" : "Escreve a proposta a partir deste dossiê real"}:\n\n${montarDossier(dossier)}`,
    json: true,
    // Esquema grande (percebemos, medição, responsabilidades…) + o Gemini gasta
    // tokens a "pensar". Com pouco espaço a resposta sai truncada → JSON inválido.
    maxTokens: 8192,
  };

  // Gera, valida, e tenta uma segunda vez se vier truncada/inválida (Parte 49).
  let ultimoErro = "";
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await ia.gerar(pedido);
    if (!r.ok) {
      ultimoErro = r.erro;
      continue;
    }
    const conteudo = lerJson<ConteudoProposta>(r.texto);
    const validacao = validarConteudoProposta(conteudo);
    if (validacao.ok) return NextResponse.json({ conteudo });
    ultimoErro = validacao.erros.join("; ");
  }

  return NextResponse.json(
    { erro: `A IA não conseguiu completar (${ultimoErro}). Tenta de novo daqui a pouco.` },
    { status: 200 },
  );
}
