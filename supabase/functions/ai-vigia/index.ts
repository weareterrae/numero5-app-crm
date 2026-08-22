// =====================================================================
// Vigia ponta a ponta dos assistentes
// ---------------------------------------------------------------------
// Faz uma pergunta REAL ao endpoint REAL e verifica a RESPOSTA.
//
// Existe porque a 22/08/2026 se descobriu que o painel dava verde para
// o Joaquim da Terrae testando apenas o `estado-motor` — "o motor tem
// chave" — e não se o Joaquim respondia. Os dois assistentes mais
// críticos eram os únicos não testados a sério.
//
// Verifica, por esta ordem:
//   1. respondeu HTTP 2xx dentro do prazo?
//   2. o corpo tem conteúdo suficiente (não é resposta vazia/curta)?
//   3. não contém texto proibido ("em manutenção" é falha, não sucesso —
//      um fallback enlatado devolve 200 e parece bom)
//   4. contém o que tem de conter (ex.: o Joaquim fala de exclusividade)
//   5. nos diagnósticos: tem os campos obrigatórios? PESQUISOU mesmo?
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function ehServiceRole(auth: string): boolean {
  const t = auth.replace(/^Bearer\s+/i, "").trim().split(".");
  if (t.length !== 3) return false;
  try {
    const b = t[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b + "=".repeat((4 - b.length % 4) % 4)))?.role === "service_role";
  } catch { return false; }
}

/**
 * Junta o texto de uma resposta SSE do gateway.
 *
 * Sem isto, um vigia que fale ao gateway media o TAMANHO DO PROTOCOLO, não
 * da resposta: o evento `start` mais meia dúzia de `delta` já passam dos 200
 * caracteres mesmo que o assistente diga três palavras. Passava a verde por
 * ruído — a mesma classe de falso-positivo que o `estado-motor` criava.
 */
function juntarSSE(bruto: string): string | null {
  if (!bruto.includes("data:")) return null;
  let texto = "";
  let viuEvento = false;
  for (const linha of bruto.split("\n")) {
    const t = linha.trim();
    if (!t.startsWith("data:")) continue;
    try {
      const ev = JSON.parse(t.slice(5).trim());
      viuEvento = true;
      if (ev.type === "delta" && typeof ev.text === "string") texto += ev.text;
      // um `error` no meio do fluxo é falha, mesmo com HTTP 200
      else if (ev.type === "error") return `__ERRO__:${ev.code ?? "desconhecido"}`;
    } catch { /* fragmento incompleto */ }
  }
  return viuEvento ? texto : null;
}

/** Lê um caminho simples no JSON ('reply', 'data.texto'). */
function ler(obj: unknown, caminho: string | null): string {
  if (!caminho) return typeof obj === "string" ? obj : JSON.stringify(obj);
  let v: any = obj;
  for (const p of caminho.split(".")) v = v?.[p];
  return typeof v === "string" ? v : (v == null ? "" : JSON.stringify(v));
}

type Resultado = { ok: boolean; motivo?: string; status?: number; ms: number; amostra: string };

async function correr(v: any): Promise<Resultado> {
  const t0 = Date.now();
  try {
    const r = await fetch(v.url, {
      method: v.metodo ?? "POST",
      headers: { "content-type": "application/json", ...(v.cabecalhos ?? {}) },
      body: v.metodo === "GET" ? undefined : JSON.stringify(v.corpo ?? {}),
      signal: AbortSignal.timeout(v.timeout_ms ?? 45000),
    });
    // O corpo TEM de ser lido antes de medir. Num stream, o `fetch` resolve
    // assim que chegam os cabeçalhos — medir aqui dava 1,2s para um
    // relatório que demora 42, e o painel mostrava um tempo tranquilizador
    // que era falso.
    const bruto = await r.text();
    const ms = Date.now() - t0;

    if (!r.ok) {
      return { ok: false, motivo: `http_${r.status}`, status: r.status, ms, amostra: bruto.slice(0, 200) };
    }

    // SSE primeiro: se veio do gateway, o que conta é o texto gerado, não o
    // envelope do protocolo.
    const sse = juntarSSE(bruto);
    if (sse?.startsWith("__ERRO__:")) {
      return { ok: false, motivo: `gateway:${sse.slice(9)}`, status: r.status, ms, amostra: bruto.slice(0, 200) };
    }

    let corpo: unknown = bruto;
    if (sse === null) { try { corpo = JSON.parse(bruto); } catch { /* alguns devolvem texto cru */ } }
    const texto = sse ?? ler(corpo, v.campo_resposta);
    const amostra = texto.slice(0, 300);

    // 2. resposta com substância
    if (texto.trim().length < (v.min_caracteres ?? 40)) {
      return { ok: false, motivo: `resposta_curta:${texto.trim().length}`, status: r.status, ms, amostra };
    }

    // 3. texto proibido — o fallback enlatado devolve 200 e engana
    const baixo = texto.toLowerCase();
    for (const proibido of (v.nao_pode_conter ?? [])) {
      if (proibido && baixo.includes(String(proibido).toLowerCase())) {
        return { ok: false, motivo: `texto_proibido:${proibido}`, status: r.status, ms, amostra };
      }
    }

    // 4. está no tema? Basta UM dos termos — semântica OR de propósito.
    //
    // Com AND, o Joaquim falhou uma vez por dizer "um único consultor
    // do início à escritura" em vez da palavra "exclusivo": resposta
    // perfeita, alarme falso. Um vigia que grita sem razão deixa de ser
    // lido, e é nesse dia que o alarme a sério passa despercebido.
    const termos = (v.deve_conter ?? []).filter(Boolean);
    if (termos.length > 0) {
      const noTema = termos.some((t: string) => baixo.includes(String(t).toLowerCase()));
      if (!noTema) {
        return { ok: false, motivo: `fora_de_tema:${termos.join("|")}`, status: r.status, ms, amostra };
      }
    }
    // 5. diagnósticos: campos obrigatórios
    for (const campo of (v.campos_json ?? [])) {
      const tem = corpo && typeof corpo === "object" && campo in (corpo as Record<string, unknown>);
      if (!tem) return { ok: false, motivo: `falta_campo:${campo}`, status: r.status, ms, amostra };
    }

    // 6. credibilidade: devia ter pesquisado?
    if (v.espera_pesquisa) {
      const c: any = corpo;
      const pesquisou = !!(c?.grounding_usado || c?.fontes?.length || c?.sources?.length);
      if (!pesquisou) {
        // Não é erro técnico: é resposta plausível SEM fontes — pior,
        // porque parece boa.
        return { ok: false, motivo: "sem_pesquisa", status: r.status, ms, amostra };
      }
    }

    return { ok: true, status: r.status, ms, amostra };
  } catch (e) {
    const ms = Date.now() - t0;
    const msg = String(e);
    return { ok: false, motivo: /timeout|abort/i.test(msg) ? "timeout" : "rede", ms, amostra: msg.slice(0, 160) };
  }
}

/** Um incidente por vigia por hora — sem encher de ruído. */
async function incidente(v: any, res: Resultado) {
  const desde = new Date(Date.now() - 3600_000).toISOString();
  const { data: recente } = await db.from("ai_incidents").select("id")
    .eq("tipo", "MODEL_UNHEALTHY").ilike("titulo", `Vigia: ${v.nome}%`)
    .gte("created_at", desde).limit(1).maybeSingle();
  if (recente) return;
  await db.from("ai_incidents").insert({
    tipo: "MODEL_UNHEALTHY",
    severidade: v.critico ? "crit" : "warn",
    titulo: `Vigia: ${v.nome} (${v.marca}) não passou`,
    detalhe: { motivo: res.motivo, http: res.status, latencia_ms: res.ms, amostra: res.amostra },
  });
}

Deno.serve(async (req) => {
  if (!ehServiceRole(req.headers.get("authorization") ?? "")) {
    return new Response(JSON.stringify({ erro: "nao autorizado" }), { status: 401 });
  }

  const { data: vigias } = await db.from("ai_vigias").select("*").eq("ativo", true);
  const saida: unknown[] = [];

  for (const v of vigias ?? []) {
    const res = await correr(v);
    await db.from("ai_vigia_execucoes").insert({
      vigia_id: v.id, ok: res.ok, http_status: res.status ?? null,
      latencia_ms: res.ms, motivo: res.motivo ?? null, amostra: res.amostra?.slice(0, 500) ?? null,
    });
    if (!res.ok) await incidente(v, res);
    saida.push({ vigia: v.chave, ok: res.ok, motivo: res.motivo, ms: res.ms });
  }

  const maus = saida.filter((x: any) => !x.ok);
  return Response.json({ total: saida.length, falhas: maus.length, resultados: saida });
});
