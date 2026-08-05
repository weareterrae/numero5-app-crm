import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
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
  return b.c <= 30;
}

export async function POST(req: NextRequest) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });
  if (!rateLimit(user.id))
    return NextResponse.json({ sugestao: "Estou a apanhar o fôlego 😅 tenta daqui a um minuto." });

  const ia = obterIA();
  if (!ia)
    return NextResponse.json({ sugestao: "", aviso: "O assistente está em manutenção — escreve à vontade." });

  let c: {
    label?: string;
    marca?: { nome?: string; setor?: string; website?: string };
    respostas?: Record<string, string>;
  };
  try {
    c = await req.json();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const label = String(c?.label || "").slice(0, 200);
  const nome = String(c?.marca?.nome || "a marca").slice(0, 120);
  const setor = String(c?.marca?.setor || "").slice(0, 120);
  const site = String(c?.marca?.website || "").slice(0, 200);
  const respostas = c?.respostas && typeof c.respostas === "object" ? c.respostas : {};
  const contexto = Object.entries(respostas)
    .filter(([k, v]) => !k.startsWith("_") && typeof v === "string" && v.trim())
    .slice(0, 12)
    .map(([, v]) => `- ${String(v).slice(0, 220)}`)
    .join("\n");

  const sistema =
    "És um estratega de marca do Nº 5, agência de marketing digital PT/Angola. Escreves em português de Portugal (europeu, nunca do Brasil), com um tom caloroso, direto e profissional. A tua tarefa: dar UMA sugestão curta e concreta para o cliente preencher um campo do briefing da marca dele. Escreve como se fosses o próprio cliente a responder (na voz da marca), pronto a editar. Regras: 1 a 3 frases, sem listas, sem preâmbulos, sem aspas à volta. Nunca inventes factos específicos (números, prémios, datas); se não souberes, propõe algo plausível e editável. Devolve apenas o texto da sugestão.";

  const utilizador = `Marca: ${nome}${setor ? ` · setor: ${setor}` : ""}${site ? ` · site: ${site}` : ""}.
${contexto ? `O que já disseram no guia:\n${contexto}\n` : ""}
Campo a preencher: «${label}».
Escreve a sugestão (1 a 3 frases), na voz da marca.`;

  const r = await ia.gerar({ sistema, utilizador, maxTokens: 400, temperatura: 0.9 });
  if (!r.ok) return NextResponse.json({ sugestao: "", aviso: "Não consegui sugerir agora — escreve à vontade." });
  return NextResponse.json({ sugestao: r.texto.trim().replace(/^["'«]|["'»]$/g, "").slice(0, 700) });
}
