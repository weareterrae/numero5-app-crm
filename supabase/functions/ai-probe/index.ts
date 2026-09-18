// =====================================================================
// Synthetic Monitoring — detetar antes do utilizador
// ---------------------------------------------------------------------
// Corre em cron. Para cada modelo roteável, faz uma probe minúscula
// ("Respond only with OK.", 5 tokens de saída) e regista TTFT, latência
// e estado. Alimenta o health registry e o disjuntor.
//
// Custo: desprezável por desenho. Com 8 modelos a cada 15 min, são ~770
// probes/dia × ~15 tokens ≈ 12k tokens/dia. Cêntimos por mês.
//
// É esta peça que teria dado o alarme às 21h de 20/08 em vez de ser o
// Sandro a descobrir que os assistentes estavam em baixo.
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { OpenAIProvider } from "../_shared/n5-ai/providers/openai.ts";
import { GoogleProvider } from "../_shared/n5-ai/providers/google.ts";
import { AnthropicProvider } from "../_shared/n5-ai/providers/anthropic.ts";
import type { AIProvider } from "../_shared/n5-ai/types.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function construir(p: any, key: string): AIProvider {
  switch (p.adapter) {
    case "openai": return new OpenAIProvider(p.id, p.base_url, key);
    case "google": return new GoogleProvider(p.id, p.base_url, key);
    case "anthropic": return new AnthropicProvider(p.id, p.base_url, key);
    default: throw new Error(`adaptador ${p.adapter}`);
  }
}

/** Um incidente por modelo por hora — não encher a tabela de ruído. */
async function incidente(tipo: string, sev: string, modelo: any, titulo: string, detalhe: unknown) {
  const desde = new Date(Date.now() - 3600_000).toISOString();
  const { data: recente } = await db.from("ai_incidents").select("id")
    .eq("tipo", tipo).eq("model_id", modelo.id).gte("created_at", desde).limit(1).maybeSingle();
  if (recente) return;
  await db.from("ai_incidents").insert({
    tipo, severidade: sev, model_id: modelo.id, provider_id: modelo.provider_id,
    titulo, detalhe,
  });
}

/**
 * Fecha os MODEL_UNHEALTHY e CIRCUIT_OPEN em aberto deste modelo quando a
 * sonda volta a passar. Sem isto, uma falha PASSAGEIRA de rede (timeout,
 * blip) fica aberta para sempre — ninguém a fecha à mão porque já nem é
 * verdade — e o email de alerta (`ai-alertas`) reenvia-a a cada 30 min só
 * porque a lista de "por resolver" nunca muda de tamanho. Medido a
 * 26/08/2026: 73 MODEL_UNHEALTHY + 22 CIRCUIT_OPEN presos desde 22/08, e a
 * sonda invocada à mão respondeu ok=true nos 8/8 modelos.
 */
async function resolverSeRecuperado(modelo: any) {
  await db.from("ai_incidents")
    .update({ resolvido: true, resolvido_em: new Date().toISOString() })
    .in("tipo", ["MODEL_UNHEALTHY", "CIRCUIT_OPEN"]).eq("model_id", modelo.id).eq("resolvido", false);
}

Deno.serve(async () => {
  const t0 = Date.now();
  const { data: provs } = await db.from("ai_providers").select("*").eq("enabled", true);
  const { data: modelos } = await db.from("ai_models").select("*")
    .eq("enabled", true).in("status", ["ACTIVE", "DEGRADED"]);

  const porId = new Map((provs ?? []).map((p: any) => [p.id, p]));
  const resultados: unknown[] = [];

  for (const m of modelos ?? []) {
    const p = porId.get(m.provider_id);
    if (!p) continue;
    const key = Deno.env.get(p.api_key_env);
    if (!key) {
      resultados.push({ modelo: m.provider_model_id, saltado: `sem ${p.api_key_env}` });
      continue;
    }

    // Falha anterior consecutiva, ANTES de registar esta — decide se é ruído
    // passageiro (uma probe isolada) ou já a segunda a fio (vale a pena avisar).
    const { data: anterior } = await db.from("ai_probes").select("ok")
      .eq("model_id", m.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const falhouAnterior = anterior?.ok === false;

    let ok = false, latencia = 0, status = 0;
    try {
      const prov = construir(p, key);
      const h = await prov.health(m.provider_model_id);
      ok = h.ok; latencia = h.latencyMs; status = h.status;
    } catch (e) {
      ok = false; status = 0;
    }

    await db.from("ai_probes").insert({
      model_id: m.id, ok, latency_ms: latencia,
      error_code: ok ? null : String(status),
    });

    // alimenta a mesma janela de saúde que os pedidos reais usam
    const janela = new Date(
      Math.floor(Date.now() / (m.circuit_cooldown_seconds * 1000)) * m.circuit_cooldown_seconds * 1000,
    ).toISOString();
    await db.rpc("ai_health_bump", {
      p_model_id: m.id, p_window_start: janela, p_ok: ok, p_status: status,
      p_latency_ms: latencia, p_ttft_ms: null,
    });

    // estado de saúde declarado a partir da probe
    const novo = ok ? "HEALTHY" : (status === 429 || status >= 500 ? "DEGRADED" : "UNHEALTHY");
    const patch: Record<string, unknown> = {
      health_status: novo, last_health_check: new Date().toISOString(),
    };
    // probe boa com o disjuntor em recuperação → fecha o circuito
    if (ok && m.circuit_state !== "CLOSED") {
      patch.circuit_state = "CLOSED";
      patch.circuit_opened_at = null;
    }
    await db.from("ai_models").update(patch).eq("id", m.id);

    if (ok) await resolverSeRecuperado(m);

    // Só duas falhas seguidas (≈15-30 min) abrem incidente — um blip isolado
    // (timeout de rede, ruído do lado da Google/OpenAI) resolve-se sozinho na
    // sonda seguinte e nunca chega a e-mail. 8 modelos a cada 15 min geram
    // blips isolados com regularidade; o que interessa sinalizar é o que
    // persiste.
    if (!ok && falhouAnterior) {
      await incidente(
        "MODEL_UNHEALTHY", status === 404 ? "crit" : "warn", m,
        `Probe falhou: ${m.display_name}`,
        { status, provider: m.provider_id, modelo: m.provider_model_id },
      );
    }
    resultados.push({ modelo: m.provider_model_id, ok, status, latencia, falhaIsolada: !ok && !falhouAnterior });
  }

  // higiene: janelas antigas não servem para nada
  await db.rpc("ai_limpar_janelas", { p_dias: 7 }).then(() => {}, () => {});

  return Response.json({ duracao_ms: Date.now() - t0, probes: resultados });
});
