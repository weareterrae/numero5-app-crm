import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

// Vigia dos bots sociais (FB/IG). Dois níveis de sinal:
//  v1 (sem credenciais): liveness (GET ao endpoint) + cérebro (GET ao PROMPT_URL).
//  v2 (com SUPABASE_MGMT_TOKEN no ambiente): respostas RECENTES por enviar (chegaram
//     nas últimas 24h e ficaram +2h) e ERROS das últimas 24h, na public.pending_replies
//     de cada projeto, via Management API do Supabase (um só token cobre a conta toda).
//     Janela recente de propósito: somar o histórico dava falsos alarmes (erros antigos,
//     pendentes de semanas). Apanha o bot que responde ao health check mas parou de facto.
// Gated pela sessão do operador.
export const dynamic = "force-dynamic";

type Bot = { marca: string; endpoint: string; prompt: string | null; tipo: "supabase" | "netlify"; ref: string | null };

const BOTS: Bot[] = [
  { marca: "KoolNature · Chef Kool", ref: "kvhkbaneplfblcjkvzor", endpoint: "https://kvhkbaneplfblcjkvzor.functions.supabase.co/meta-inbox", prompt: "https://koolnature.pt/chef-kool-prompt.txt", tipo: "supabase" },
  { marca: "Nº 5 · Quinto", ref: "rycgekqszxyudmchpqvs", endpoint: "https://rycgekqszxyudmchpqvs.functions.supabase.co/meta-inbox", prompt: "https://numerocinco.pt/quinto-prompt.txt", tipo: "supabase" },
  { marca: "Água Minda · Kianda", ref: "bxnxyrzjfyqvogcahrvh", endpoint: "https://bxnxyrzjfyqvogcahrvh.functions.supabase.co/meta-inbox", prompt: null, tipo: "supabase" },
  { marca: "Quente e Bom · Chef Joaquim", ref: "qciagsktkqljvknmahfu", endpoint: "https://qciagsktkqljvknmahfu.functions.supabase.co/meta-inbox", prompt: null, tipo: "supabase" },
  { marca: "Massa Prima · Chef Prima", ref: "swrwomjsleosbckrsjco", endpoint: "https://swrwomjsleosbckrsjco.functions.supabase.co/meta-inbox", prompt: null, tipo: "supabase" },
  { marca: "Maria Goreti", ref: "ilpkmbxwbzknruhszgye", endpoint: "https://ilpkmbxwbzknruhszgye.functions.supabase.co/meta-inbox", prompt: "https://terrae.pt/mariagoreti-inbox-prompt.txt", tipo: "supabase" },
  { marca: "Externato · Avó Maria", ref: "qhcuvlpliqanwqrwsozq", endpoint: "https://qhcuvlpliqanwqrwsozq.functions.supabase.co/meta-inbox", prompt: "https://externatosantamariadebelem.com/avo-prompt.txt", tipo: "supabase" },
  { marca: "Terrae · Joaquim", ref: null, endpoint: "https://terrae.pt/.netlify/functions/joaquim-social", prompt: null, tipo: "netlify" },
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

type Profundo = { presas: number; erros: number; ultima: string | null };

// v2: pendentes presas (+2h) e erros na pending_replies, via Management API.
async function profundidade(ref: string, token: string, timeoutMs = 9000): Promise<Profundo | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        // Janela RECENTE (não o histórico todo): respostas que chegaram nas últimas
        // 24h e ficaram +2h por enviar, e erros das últimas 24h. A última enviada
        // prova que o caminho de envio funciona. (Somar o histórico dava falsos alarmes.)
        query:
          "select count(*) filter (where status='pending' and created_at between now() - interval '24 hours' and now() - interval '2 hours') as presas, " +
          "count(*) filter (where status='error' and created_at > now() - interval '24 hours') as erros, " +
          "max(created_at) filter (where status='sent') as ultima from public.pending_replies",
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const rows = (await r.json().catch(() => null)) as Array<Record<string, unknown>> | null;
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    return {
      presas: Number(row.presas) || 0,
      erros: Number(row.erros) || 0,
      ultima: (row.ultima as string | null) ?? null,
    };
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

  const token = process.env.SUPABASE_MGMT_TOKEN || "";
  const temProfundidade = token.length > 0;

  const bots = await Promise.all(
    BOTS.map(async (b) => {
      const [live, prompt, deep] = await Promise.all([
        sonda(b.endpoint),
        b.prompt ? sonda(b.prompt) : Promise.resolve(null),
        temProfundidade && b.ref ? profundidade(b.ref, token) : Promise.resolve(null),
      ]);
      const vivo =
        b.tipo === "supabase"
          ? !!live && live.status === 200 && /ok/i.test(live.corpo)
          : !!live && live.status !== 404;
      const cerebro = b.prompt ? !!prompt && prompt.status === 200 : null;
      const presas = deep?.presas ?? 0;
      const erros = deep?.erros ?? 0;

      const estado: "verde" | "amarelo" | "vermelho" = !vivo
        ? "vermelho"
        : erros > 0
          ? "vermelho"
          : presas >= 5
            ? "amarelo"
            : cerebro === false
              ? "amarelo"
              : "verde";

      const detalhe = !vivo
        ? live
          ? `a função respondeu ${live.status}`
          : "sem resposta / timeout"
        : erros > 0
          ? `${erros} erro(s) nas últimas 24h`
          : presas >= 5
            ? `${presas} por enviar (últimas 24h)`
            : cerebro === false
              ? "cérebro (prompt) inacessível"
              : "a responder";

      return { marca: b.marca, estado, vivo, cerebro, detalhe, tipo: b.tipo, profundo: !!deep };
    }),
  );

  const contagem = { verde: 0, amarelo: 0, vermelho: 0 };
  for (const b of bots) contagem[b.estado]++;

  return NextResponse.json({ bots, contagem, profundidade: temProfundidade, verificado: new Date().toISOString() });
}
