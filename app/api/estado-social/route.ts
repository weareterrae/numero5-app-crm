import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

// Vigia dos bots sociais (FB/IG). Sinais SEM credenciais, verificáveis à hora:
//  · liveness — GET ao endpoint da função (Supabase: 200 "meta-inbox ok"; Terrae: responde).
//  · cérebro  — GET ao PROMPT_URL da marca (a personalidade está acessível?).
// A profundidade (pending_replies por idade, logs de erro) precisa de chaves por
// projeto — fica para v2. Gated pela sessão do operador.
export const dynamic = "force-dynamic";

type Bot = { marca: string; endpoint: string; prompt: string | null; tipo: "supabase" | "netlify" };

const BOTS: Bot[] = [
  { marca: "KoolNature · Chef Kool", endpoint: "https://kvhkbaneplfblcjkvzor.functions.supabase.co/meta-inbox", prompt: "https://koolnature.pt/chef-kool-prompt.txt", tipo: "supabase" },
  { marca: "Nº 5 · Quinto", endpoint: "https://rycgekqszxyudmchpqvs.functions.supabase.co/meta-inbox", prompt: "https://numerocinco.pt/quinto-prompt.txt", tipo: "supabase" },
  { marca: "Água Minda · Kianda", endpoint: "https://bxnxyrzjfyqvogcahrvh.functions.supabase.co/meta-inbox", prompt: null, tipo: "supabase" },
  { marca: "Quente e Bom · Chef Joaquim", endpoint: "https://qciagsktkqljvknmahfu.functions.supabase.co/meta-inbox", prompt: null, tipo: "supabase" },
  { marca: "Massa Prima · Chef Prima", endpoint: "https://swrwomjsleosbckrsjco.functions.supabase.co/meta-inbox", prompt: null, tipo: "supabase" },
  { marca: "Maria Goreti", endpoint: "https://ilpkmbxwbzknruhszgye.functions.supabase.co/meta-inbox", prompt: "https://terrae.pt/mariagoreti-inbox-prompt.txt", tipo: "supabase" },
  { marca: "Externato · Avó Maria", endpoint: "https://qhcuvlpliqanwqrwsozq.functions.supabase.co/meta-inbox", prompt: "https://externatosantamariadebelem.com/avo-prompt.txt", tipo: "supabase" },
  { marca: "Terrae · Joaquim", endpoint: "https://terrae.pt/.netlify/functions/joaquim-social", prompt: null, tipo: "netlify" },
];

async function sonda(url: string, timeoutMs = 8000): Promise<{ status: number; corpo: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    const corpo = (await r.text().catch(() => "")).slice(0, 120);
    return { status: r.status, corpo };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Não autorizado.", { status: 401 });

  const bots = await Promise.all(
    BOTS.map(async (b) => {
      const [live, prompt] = await Promise.all([
        sonda(b.endpoint),
        b.prompt ? sonda(b.prompt) : Promise.resolve(null),
      ]);
      // Supabase: 200 com "ok" no corpo. Terrae (Netlify): responde (mesmo 403) = deployado; sem resposta/404 = em baixo.
      const vivo =
        b.tipo === "supabase"
          ? !!live && live.status === 200 && /ok/i.test(live.corpo)
          : !!live && live.status !== 404;
      const cerebro = b.prompt ? !!prompt && prompt.status === 200 : null; // null = não verificado
      const estado: "verde" | "amarelo" | "vermelho" = !vivo ? "vermelho" : cerebro === false ? "amarelo" : "verde";
      const detalhe = !vivo
        ? live
          ? `a função respondeu ${live.status}`
          : "sem resposta / timeout"
        : cerebro === false
          ? "cérebro (prompt) inacessível"
          : "a responder";
      return { marca: b.marca, estado, vivo, cerebro, detalhe, tipo: b.tipo };
    }),
  );

  const contagem = { verde: 0, amarelo: 0, vermelho: 0 };
  for (const b of bots) contagem[b.estado]++;

  return NextResponse.json({ bots, contagem, verificado: new Date().toISOString() });
}
