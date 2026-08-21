// =====================================================================
// Testes da FRONTEIRA DE SEGURANÇA do gateway.
// ---------------------------------------------------------------------
// `originAllowed` é o que impede o site do cliente A de falar pelo
// assistente do cliente B. Se isto partir, parte o isolamento entre
// clientes — por isso é o primeiro ficheiro de testes do N5 AI OS.
// =====================================================================

import { describe, it, expect } from "vitest";
import { originAllowed } from "./registry.ts";
import type { AssistantRow } from "./types.ts";

function assistente(dominios: string[]): AssistantRow {
  return {
    id: "a1", org_id: "o1", assistant_key: "k", nome: "Teste", marca: null,
    allowed_domains: dominios, ativo: true, gateway_enabled: true,
    traffic_percentage: 100, routing_policy_id: null,
    max_messages: 16, max_chars_message: 2000, max_output_tokens: 1024, temperature: 0.7,
  };
}

describe("originAllowed — allowlist de domínios", () => {
  const a = assistente(["https://linhasgerais.pt", "https://www.linhasgerais.pt"]);

  it("aceita um domínio da lista", () => {
    expect(originAllowed(a, "https://linhasgerais.pt", null)).toBe(true);
    expect(originAllowed(a, "https://www.linhasgerais.pt", null)).toBe(true);
  });

  it("recusa um domínio que não está na lista", () => {
    expect(originAllowed(a, "https://intruso.com", null)).toBe(false);
  });

  it("recusa um subdomínio não listado — não há correspondência por sufixo", () => {
    expect(originAllowed(a, "https://mau.linhasgerais.pt", null)).toBe(false);
  });

  it("recusa um domínio que apenas CONTÉM o permitido", () => {
    // o ataque clássico: linhasgerais.pt.intruso.com
    expect(originAllowed(a, "https://linhasgerais.pt.intruso.com", null)).toBe(false);
  });

  it("distingue esquema — http não passa por https", () => {
    expect(originAllowed(a, "http://linhasgerais.pt", null)).toBe(false);
  });

  it("usa o referer quando não há origin, mas só a sua ORIGEM", () => {
    expect(originAllowed(a, null, "https://linhasgerais.pt/pagina?x=1")).toBe(true);
    expect(originAllowed(a, null, "https://intruso.com/pagina")).toBe(false);
  });

  it("recusa quando não há origin nem referer e a lista não é vazia", () => {
    // Sem forma de provar a origem, e com allowlist definida → recusa.
    expect(originAllowed(a, null, null)).toBe(false);
  });

  it("recusa um referer que não é um URL válido", () => {
    expect(originAllowed(a, null, "isto-nao-e-um-url")).toBe(false);
  });

  it("lista vazia = assistente interno, sem restrição de domínio", () => {
    const interno = assistente([]);
    expect(originAllowed(interno, "https://qualquer-coisa.com", null)).toBe(true);
    expect(originAllowed(interno, null, null)).toBe(true);
  });

  it("tolera barra final e espaços na configuração", () => {
    const b = assistente([" https://exemplo.pt/ "]);
    expect(originAllowed(b, "https://exemplo.pt", null)).toBe(true);
  });

  it("ignora entradas vazias na lista sem abrir a porta", () => {
    const c = assistente(["", "   ", "https://exemplo.pt"]);
    expect(originAllowed(c, "https://intruso.com", null)).toBe(false);
    expect(originAllowed(c, "https://exemplo.pt", null)).toBe(true);
  });

  it("aceita previews da Netlify só com o curinga explícito", () => {
    const semCuringa = assistente(["https://exemplo.pt"]);
    expect(originAllowed(semCuringa, "https://abc-123.netlify.app", null)).toBe(false);

    const comCuringa = assistente(["https://exemplo.pt", "*.netlify.app"]);
    expect(originAllowed(comCuringa, "https://abc-123.netlify.app", null)).toBe(true);
    // mas não um domínio que só imita
    expect(originAllowed(comCuringa, "https://netlify.app.intruso.com", null)).toBe(false);
  });
});
