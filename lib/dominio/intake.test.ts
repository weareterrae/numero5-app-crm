import { describe, it, expect } from "vitest";
import {
  recebeContactos,
  investeAnuncios,
  temSite,
  processoComercialFraco,
  respostaSubstancial,
  respostaAdiada,
  urlValido,
  emailValido,
  rotulo,
  type Brief,
} from "./intake";

describe("diagnóstico adaptativo (Parte 6)", () => {
  it("recebeContactos: falso quando só «ainda não»", () => {
    expect(recebeContactos({ leads_como: ["ainda_nao"] })).toBe(false);
    expect(recebeContactos({ leads_como: [] })).toBe(false);
    expect(recebeContactos({ leads_como: ["telefone"] })).toBe(true);
    expect(recebeContactos({ leads_como: ["ainda_nao", "email"] })).toBe(true);
  });

  it("investeAnuncios: só quando diz «sim»", () => {
    expect(investeAnuncios({ anuncios_investe: "sim" })).toBe(true);
    expect(investeAnuncios({ anuncios_investe: "nao" })).toBe(false);
    expect(investeAnuncios({})).toBe(false);
  });

  it("temSite: falso quando «não tenho»", () => {
    expect(temSite({ site_estado: "nao" })).toBe(false);
    expect(temSite({ site_estado: "fraco" })).toBe(true);
    expect(temSite({})).toBe(false);
  });

  it("processoComercialFraco: dois ou mais sinais", () => {
    expect(processoComercialFraco({ leads_resposta: "sem_processo", leads_registo: "nao_registo" })).toBe(true);
    expect(processoComercialFraco({ leads_followup: "nao", leads_registo: "cabeca" })).toBe(true);
    expect(processoComercialFraco({ leads_resposta: "mais" })).toBe(false); // 1 sinal
    expect(processoComercialFraco({ leads_resposta: "na_hora", leads_registo: "crm", leads_followup: "sempre" })).toBe(false);
  });

  it("rotulo traduz as chaves novas nos dois idiomas", () => {
    const b: Brief = { leads_resposta: "na_hora" };
    expect(rotulo("leads_resposta", b.leads_resposta, "pt")).toBe("Quase na hora");
    expect(rotulo("leads_resposta", b.leads_resposta, "en")).toBe("Almost right away");
    expect(rotulo("ferramentas", "crm", "pt")).toBe("CRM");
  });
});

describe("validação inteligente das respostas (Parte 24)", () => {
  it("rejeita lixo e respostas curtas/aleatórias", () => {
    expect(respostaSubstancial("teste")).toBe(false);
    expect(respostaSubstancial("asdf")).toBe(false);
    expect(respostaSubstancial("aaaa")).toBe(false);
    expect(respostaSubstancial("  ")).toBe(false);
    expect(respostaSubstancial("ok")).toBe(false); // < 3 chars
    expect(respostaSubstancial("Quero mais clientes locais")).toBe(true);
  });

  it("distingue «não sei» (adiado) de lixo", () => {
    expect(respostaAdiada("não sei")).toBe(true);
    expect(respostaAdiada("depois")).toBe(true);
    expect(respostaAdiada("Quero vender mais")).toBe(false);
  });

  it("valida URLs e emails", () => {
    expect(urlValido("padaria.pt")).toBe(true);
    expect(urlValido("https://x.com/a")).toBe(true);
    expect(urlValido("semponto")).toBe(false);
    expect(urlValido("")).toBe(false);
    expect(emailValido("ola@padaria.pt")).toBe(true);
    expect(emailValido("ola@x")).toBe(false);
    expect(emailValido("sem-arroba")).toBe(false);
  });
});
