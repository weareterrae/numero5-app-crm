import { describe, it, expect } from "vitest";
import { leadsLentas, canaisQueVendem, rotuloOrigem, type LeadSinal } from "./sinais";

const AGORA = new Date("2026-08-02T12:00:00Z").getTime();
const hAtras = (h: number) => new Date(AGORA - h * 3600 * 1000).toISOString();

describe("leadsLentas", () => {
  it("conta só abertas, sem resposta, há mais de 24h", () => {
    const leads: LeadSinal[] = [
      { resultado: "aberto", created_at: hAtras(30) }, // lenta ✓
      { resultado: "aberto", created_at: hAtras(2) }, // recente ✗
      { resultado: "aberto", created_at: hAtras(48), primeira_resposta_at: hAtras(40) }, // já respondida ✗
      { resultado: "ganho", created_at: hAtras(50) }, // já não é aberta ✗
      { resultado: "aberto", created_at: hAtras(30), arquivado: true }, // arquivada ✗
    ];
    expect(leadsLentas(leads, 24, AGORA)).toBe(1);
  });
});

describe("canaisQueVendem", () => {
  it("agrupa ganhos por origem e ordena por valor", () => {
    const leads: LeadSinal[] = [
      { resultado: "ganho", origem: "meta_instant_form", valor_negocio: 1000 },
      { resultado: "ganho", origem: "site", valor_negocio: 500 },
      { resultado: "ganho", origem: "meta_instant_form", valor_negocio: 300 },
      { resultado: "aberto", origem: "site", valor_negocio: 999 }, // não ganho ✗
      { resultado: "ganho", origem: null, valor_negocio: 200 }, // vira "direto"
    ];
    const r = canaisQueVendem(leads);
    expect(r[0]).toEqual({ origem: "meta_instant_form", total: 1300, n: 2 });
    expect(r[1]).toEqual({ origem: "site", total: 500, n: 1 });
    expect(r[2]).toEqual({ origem: "direto", total: 200, n: 1 });
  });
});

describe("rotuloOrigem", () => {
  it("traduz origens conhecidas e cai para o próprio valor", () => {
    expect(rotuloOrigem("meta_instant_form")).toBe("Anúncios (Meta)");
    expect(rotuloOrigem(null)).toBe("Direto");
    expect(rotuloOrigem("xpto")).toBe("xpto");
  });
});
