// =====================================================================
// Ferramenta de operação: descobrir e medir modelos de um fornecedor
// ---------------------------------------------------------------------
// Existe para não voltar a acontecer o que aconteceu com o Bedrock:
// assumir disponibilidade a partir de conhecimento histórico em vez de
// perguntar. Corre dentro do runtime (onde as chaves vivem como secrets)
// e devolve só nomes e latências — nunca a chave.
//
// Protegida: exige o segredo interno N5_AI_ADMIN_TOKEN ou a service role.
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

/** Lista os modelos a que a conta tem acesso, por fornecedor. */
async function listar(providerId: string): Promise<string[]> {
  const { data: p } = await db.from("ai_providers").select("*").eq("id", providerId).maybeSingle();
  if (!p) throw new Error(`fornecedor ${providerId} não existe`);
  const key = Deno.env.get(p.api_key_env);
  if (!key) throw new Error(`falta a secret ${p.api_key_env}`);

  if (p.adapter === "openai") {
    const r = await fetch(`${p.base_url}/models`, { headers: { authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return (j.data ?? []).map((m: any) => m.id).sort();
  }
  if (p.adapter === "google") {
    const r = await fetch(`${p.base_url}/models`, { headers: { "x-goog-api-key": key } });
    if (!r.ok) throw new Error(`${r.status}`);
    const j = await r.json();
    return (j.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m: any) => m.name.replace("models/", "")).sort();
  }
  if (p.adapter === "anthropic") {
    const r = await fetch(`${p.base_url}/models`, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (!r.ok) throw new Error(`${r.status}`);
    const j = await r.json();
    return (j.data ?? []).map((m: any) => m.id).sort();
  }
  throw new Error(`adaptador ${p.adapter} sem listagem`);
}

/** Mede TTFT real de um modelo com um prompt fixo e barato. */
async function medir(providerId: string, modelo: string, prompt: string) {
  const { data: p } = await db.from("ai_providers").select("*").eq("id", providerId).maybeSingle();
  const key = Deno.env.get(p!.api_key_env)!;
  const t0 = Date.now();
  let ttft: number | null = null;
  let texto = "";
  try {
    const r = await fetch(`${p!.base_url}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 256,
        stream: true,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok || !r.body) {
      return { modelo, ok: false, erro: `${r.status}: ${(await r.text()).slice(0, 160)}` };
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const linhas = buf.split("\n");
      buf = linhas.pop() ?? "";
      for (const l of linhas) {
        const t = l.trim();
        if (!t.startsWith("data:")) continue;
        const pay = t.slice(5).trim();
        if (pay === "[DONE]") continue;
        try {
          const j = JSON.parse(pay);
          const d = j?.choices?.[0]?.delta?.content;
          if (typeof d === "string" && d) {
            if (ttft === null) ttft = Date.now() - t0;
            texto += d;
          }
        } catch { /* fragmento */ }
      }
    }
    return { modelo, ok: true, ttft_ms: ttft, total_ms: Date.now() - t0, amostra: texto.slice(0, 120) };
  } catch (e) {
    return { modelo, ok: false, erro: String(e).slice(0, 160) };
  }
}

/**
 * Autorizacao: exige um JWT do projeto com a claim role='service_role'.
 * Comparar a string da chave nao serve — o gateway do Supabase pode
 * reescrever o cabecalho, e a chave anon tambem e um JWT valido. O que
 * distingue de facto e a claim dentro do token.
 */
function ehServiceRole(auth: string): boolean {
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const partes = token.split('.');
  if (partes.length !== 3) return false;
  try {
    const b = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b + '='.repeat((4 - b.length % 4) % 4)));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (!ehServiceRole(req.headers.get('authorization') ?? '')) {
    return new Response(JSON.stringify({ erro: 'nao autorizado' }), { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const providerId = body.provider ?? "openai";

  try {
    if (body.medir) {
      const prompt = body.prompt ??
        "Explica-me como estruturar a comunicacao da minha marca este trimestre para captar clientes B2B com uma equipa pequena.";
      const resultados = [];
      for (const m of body.medir as string[]) resultados.push(await medir(providerId, m, prompt));
      return Response.json({ resultados });
    }

    const todos = await listar(providerId);
    // Heurística só para sugerir; a decisão é sempre por medição.
    const chat = todos.filter((m) =>
      !/embed|whisper|tts|audio|image|dall|moderation|realtime|transcribe|search|codex/i.test(m));
    return Response.json({ total: todos.length, chat, todos });
  } catch (e) {
    return Response.json({ erro: String(e) }, { status: 200 });
  }
});
