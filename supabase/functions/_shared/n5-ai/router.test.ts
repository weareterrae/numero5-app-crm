// =====================================================================
// Testes do router e do disjuntor.
// ---------------------------------------------------------------------
// É esta lógica que decide se o utilizador recebe resposta quando um
// fornecedor cai. Se partir, volta a acontecer o de 20/08/2026 — com a
// diferença de que agora seria culpa nossa, não da Google.
// =====================================================================

import { describe, it, expect } from "vitest";
import { Router, circuitAllows } from "./router.ts";
import { Registry } from "./registry.ts";
import type { ModelRow } from "./types.ts";

function modelo(over: Partial<ModelRow> = {}): ModelRow {
  return {
    id: "m1", provider_id: "google", provider_model_id: "gemini-x",
    display_name: "X", status: "ACTIVE", enabled: true,
    supports_streaming: true, context_window: null,
    input_cost: 1, output_cost: 2, cached_input_cost: null,
    priority: 100, health_status: "HEALTHY",
    circuit_state: "CLOSED", circuit_opened_at: null, circuit_cooldown_seconds: 120,
    ...over,
  } as ModelRow;
}

describe("circuitAllows — o disjuntor", () => {
  it("deixa passar com o circuito fechado", () => {
    expect(circuitAllows(modelo())).toBe(true);
  });

  it("bloqueia com o circuito aberto dentro do arrefecimento", () => {
    const agora = Date.now();
    const m = modelo({
      circuit_state: "OPEN",
      circuit_opened_at: new Date(agora - 30_000).toISOString(), // aberto há 30s
      circuit_cooldown_seconds: 120,
    });
    expect(circuitAllows(m, agora)).toBe(false);
  });

  it("volta a deixar passar depois do arrefecimento", () => {
    const agora = Date.now();
    const m = modelo({
      circuit_state: "OPEN",
      circuit_opened_at: new Date(agora - 121_000).toISOString(), // já passou
      circuit_cooldown_seconds: 120,
    });
    expect(circuitAllows(m, agora)).toBe(true);
  });

  it("em HALF_OPEN deixa passar — é a tentativa de recuperação", () => {
    expect(circuitAllows(modelo({ circuit_state: "HALF_OPEN" }))).toBe(true);
  });

  it("respeita arrefecimentos diferentes por modelo (nada hardcoded)", () => {
    const agora = Date.now();
    const abertoHa60s = new Date(agora - 60_000).toISOString();
    const curto = modelo({ circuit_state: "OPEN", circuit_opened_at: abertoHa60s, circuit_cooldown_seconds: 30 });
    const longo = modelo({ circuit_state: "OPEN", circuit_opened_at: abertoHa60s, circuit_cooldown_seconds: 600 });
    expect(circuitAllows(curto, agora)).toBe(true);
    expect(circuitAllows(longo, agora)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Router.chain — base de dados falsa, mínima e explícita
// ---------------------------------------------------------------------

function fakeDb(regras: { role: string; model_id: string }[]) {
  return {
    from: (t: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: t === "ai_routing_rules" ? regras : [] }),
        }),
      }),
    }),
  } as any;
}

function fakeRegistry(modelos: ModelRow[]) {
  const r = new Registry(fakeDb([]), () => "k");
  // substitui só a leitura de modelos; o resto do Registry fica intacto
  (r as any).models = async () => modelos;
  return r;
}

describe("Router.chain — cadeia de fallback", () => {
  it("devolve a cadeia pela ordem PRIMARY → FALLBACK_1 → FALLBACK_2", async () => {
    const a = modelo({ id: "a", provider_model_id: "primario" });
    const b = modelo({ id: "b", provider_model_id: "reserva1" });
    const c = modelo({ id: "c", provider_model_id: "reserva2" });
    const router = new Router(
      fakeDb([
        { role: "FALLBACK_2", model_id: "c" },
        { role: "PRIMARY", model_id: "a" },     // desordenado de propósito
        { role: "FALLBACK_1", model_id: "b" },
      ]),
      fakeRegistry([a, b, c]),
    );
    const cadeia = await router.chain("pol", "STANDARD");
    expect(cadeia.map((x) => x.model.provider_model_id)).toEqual(["primario", "reserva1", "reserva2"]);
  });

  it("salta modelos com o disjuntor aberto", async () => {
    const agora = new Date().toISOString();
    const a = modelo({ id: "a", provider_model_id: "em-baixo", circuit_state: "OPEN", circuit_opened_at: agora });
    const b = modelo({ id: "b", provider_model_id: "saudavel" });
    const router = new Router(
      fakeDb([{ role: "PRIMARY", model_id: "a" }, { role: "FALLBACK_1", model_id: "b" }]),
      fakeRegistry([a, b]),
    );
    const cadeia = await router.chain("pol", "STANDARD");
    expect(cadeia.map((x) => x.model.provider_model_id)).toEqual(["saudavel"]);
  });

  it("salta modelos retirados ou desativados", async () => {
    const a = modelo({ id: "a", provider_model_id: "retirado", status: "RETIRED" });
    const b = modelo({ id: "b", provider_model_id: "vivo" });
    const router = new Router(
      fakeDb([{ role: "PRIMARY", model_id: "a" }, { role: "FALLBACK_1", model_id: "b" }]),
      fakeRegistry([a, b]),
    );
    const cadeia = await router.chain("pol", "STANDARD");
    expect(cadeia.map((x) => x.model.provider_model_id)).toEqual(["vivo"]);
  });

  it("usa modelos DEGRADED — melhor degradar do que não responder", async () => {
    const a = modelo({ id: "a", provider_model_id: "degradado", status: "DEGRADED" });
    const router = new Router(fakeDb([{ role: "PRIMARY", model_id: "a" }]), fakeRegistry([a]));
    expect((await router.chain("pol", "STANDARD")).length).toBe(1);
  });

  it("REDE DE SEGURANÇA: sem política utilizável, varre o registo", async () => {
    // Cenário real: todos os modelos da política com o disjuntor aberto.
    // Preferir um modelo são fora da política a devolver nada.
    const sao = modelo({ id: "z", provider_model_id: "sobrevivente", health_status: "HEALTHY", priority: 10 });
    const router = new Router(fakeDb([]), fakeRegistry([sao]));
    const cadeia = await router.chain(null, "STANDARD");
    expect(cadeia.map((x) => x.model.provider_model_id)).toEqual(["sobrevivente"]);
    expect(cadeia[0].reason).toContain("registry-scan");
  });

  it("na varredura prefere os saudáveis aos não saudáveis", async () => {
    const doente = modelo({ id: "d", provider_model_id: "doente", health_status: "UNHEALTHY", priority: 1 });
    const saudavel = modelo({ id: "s", provider_model_id: "saudavel", health_status: "HEALTHY", priority: 99 });
    const router = new Router(fakeDb([]), fakeRegistry([doente, saudavel]));
    const cadeia = await router.chain(null, "STANDARD");
    // saúde ganha à prioridade
    expect(cadeia[0].model.provider_model_id).toBe("saudavel");
  });

  it("devolve cadeia vazia quando não há nada utilizável", async () => {
    const morto = modelo({ id: "m", status: "RETIRED" });
    const router = new Router(fakeDb([]), fakeRegistry([morto]));
    expect(await router.chain(null, "STANDARD")).toEqual([]);
  });
});
