import { describe, it, expect } from "vitest";
import { confiancaPorDefeito, rotuloConfianca, corConfianca } from "./confianca";

describe("níveis de confiança das métricas (Partes 42-43)", () => {
  it("classifica pelo nome da métrica", () => {
    expect(confiancaPorDefeito("Contactos do formulário")).toBe("confirmado_sistema");
    expect(confiancaPorDefeito("Alcance no Instagram")).toBe("reportado_plataforma");
    expect(confiancaPorDefeito("Vendas")).toBe("comunicado_cliente");
    expect(confiancaPorDefeito("ROI")).toBe("estimado");
  });

  it("ROI e vendas nunca vêm como confirmado pelo sistema", () => {
    expect(confiancaPorDefeito("ROI da campanha")).not.toBe("confirmado_sistema");
    expect(confiancaPorDefeito("Vendas comunicadas")).not.toBe("confirmado_sistema");
  });

  it("rótulos bilingues e cores", () => {
    expect(rotuloConfianca("estimado", "pt")).toBe("Estimado");
    expect(rotuloConfianca("estimado", "en")).toBe("Estimated");
    expect(corConfianca("confirmado_sistema")).toBe("good");
    expect(corConfianca("estimado")).toBe("warn");
  });
});
