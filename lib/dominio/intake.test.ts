import { describe, it, expect } from "vitest";
import {
  recebeContactos,
  investeAnuncios,
  temSite,
  processoComercialFraco,
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
