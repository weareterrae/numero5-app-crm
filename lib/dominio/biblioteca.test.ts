import { describe, it, expect } from "vitest";
import { sugestoesReaproveitamento } from "./biblioteca";

describe("reaproveitamento de conteúdos (Parte 47)", () => {
  it("sugere transformações por formato", () => {
    expect(sugestoesReaproveitamento("post")).toContain("Transformar em carrossel");
    expect(sugestoesReaproveitamento("carrossel")).toContain("Transformar em reel");
    expect(sugestoesReaproveitamento("reel").some((s) => s.includes("clips"))).toBe(true);
  });

  it("bom desempenho aparece primeiro", () => {
    expect(sugestoesReaproveitamento("post", "otimo")[0]).toContain("bom desempenho");
  });

  it("não sugere nada se não for reutilizável", () => {
    expect(sugestoesReaproveitamento("post", "bom", false)).toHaveLength(0);
  });
});
