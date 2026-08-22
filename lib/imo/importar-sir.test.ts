// =====================================================================
// Testes da importação de dados de mercado
// ---------------------------------------------------------------------
// Um ficheiro mal importado não grita. Uma coluna trocada — «preço médio»
// onde devia estar «preço mediano» — corrompe o benchmark de uma zona, e
// a partir daí todas as avaliações dessa zona ficam silenciosamente
// erradas. Ninguém vê nada; os números continuam plausíveis.
//
// Por isso a validação é a peça mais desconfiada de todo o sistema, e é
// aqui que se fixa o que ela recusa.
// =====================================================================
import { describe, it, expect } from "vitest";
import { proporMapeamento, numeroPT, periodoNormal, validar } from "./importar-sir";

describe("mapeamento de colunas", () => {
  it("reconhece os nomes habituais de um export", () => {
    const { mapeamento } = proporMapeamento([
      "Concelho", "Freguesia", "Tipologia", "Trimestre",
      "Preço mediano m2", "Nº transações",
    ]);
    expect(mapeamento.concelho).toBe("Concelho");
    expect(mapeamento.freguesia).toBe("Freguesia");
    expect(mapeamento.tipologia).toBe("Tipologia");
    expect(mapeamento.periodo).toBe("Trimestre");
    expect(mapeamento.eur_m2_mediano).toBe("Preço mediano m2");
    expect(mapeamento.n_transacoes).toBe("Nº transações");
  });

  it("aguenta acentos e maiúsculas diferentes", () => {
    const a = proporMapeamento(["MUNICÍPIO"]).mapeamento.concelho;
    const b = proporMapeamento(["municipio"]).mapeamento.concelho;
    expect(a).toBe("MUNICÍPIO");
    expect(b).toBe("municipio");
  });

  it("diz o que NÃO reconheceu, em vez de o ignorar", () => {
    const { porMapear } = proporMapeamento(["Concelho", "Índice de esforço", "Coluna X"]);
    expect(porMapear).toContain("Índice de esforço");
    expect(porMapear).toContain("Coluna X");
  });

  it("não adivinha quando há duas leituras possíveis", () => {
    // "Preço m2" pode ser o médio ou o mediano. Escolher às cegas troca um
    // pelo outro e ninguém repara — o número continua a parecer bem.
    const { ambiguas, mapeamento } = proporMapeamento(["Preço m2"]);
    const foiMapeada = mapeamento.eur_m2_mediano === "Preço m2" || mapeamento.eur_m2_medio === "Preço m2";
    expect(ambiguas.length > 0 || !foiMapeada).toBe(true);
  });
});

describe("números como vêm nos exports", () => {
  it("lê o formato português", () => {
    expect(numeroPT("4.553")).toBe(4553);        // ponto = milhares
    expect(numeroPT("4.553,25")).toBe(4553.25);
    expect(numeroPT("4553,25")).toBe(4553.25);
    expect(numeroPT("1.234.567")).toBe(1234567);
  });
  it("lê também o formato inglês", () => {
    expect(numeroPT("4,553.25")).toBe(4553.25);
  });
  it("aguenta símbolos e espaços", () => {
    expect(numeroPT("4 553 €")).toBe(4553);
    expect(numeroPT("€ 4.553")).toBe(4553);
  });
  it("devolve nulo em vez de zero quando não há número", () => {
    // Zero seria um preço. Nulo é «não sei» — e a diferença importa.
    expect(numeroPT("")).toBeNull();
    expect(numeroPT("n/d")).toBeNull();
    expect(numeroPT(null)).toBeNull();
  });
});

describe("períodos", () => {
  it("entende as formas habituais", () => {
    expect(periodoNormal("2026 Q2")?.periodo).toBe("2026-Q2");
    expect(periodoNormal("Q2 2026")?.periodo).toBe("2026-Q2");
    expect(periodoNormal("2026-T3")?.periodo).toBe("2026-Q3");
    expect(periodoNormal("2026/08")?.periodo).toBe("2026-08");
    expect(periodoNormal("2026")?.periodo).toBe("2026");
  });
  it("guarda a data de fim, para se poder ordenar e medir frescura", () => {
    expect(periodoNormal("2026 Q2")?.fim).toBe("2026-06-30");
    expect(periodoNormal("2026/02")?.fim).toBe("2026-02-28");
  });
  it("recusa o que não consegue ler", () => {
    expect(periodoNormal("primavera")).toBeNull();
    expect(periodoNormal("")).toBeNull();
  });
});

describe("validação — o que entra e o que fica de fora", () => {
  const MAP = {
    concelho: "Concelho", freguesia: "Freguesia", tipologia: "Tipologia",
    periodo: "Trimestre", eur_m2_mediano: "€/m2", n_transacoes: "N",
  } as const;

  const linha = (o: Record<string, unknown>) => ({
    Concelho: "Oeiras", Freguesia: "Carnaxide", Tipologia: "T3",
    Trimestre: "2026 Q2", "€/m2": "4.553", N: "42", ...o,
  });

  it("aceita uma linha completa", () => {
    const { resumo, linhas } = validar([linha({})], MAP);
    expect(resumo.validas).toBe(1);
    expect(linhas[0].normalizado?.eur_m2_mediano).toBe(4553);
    expect(linhas[0].normalizado?.periodo).toBe("2026-Q2");
  });

  it("rejeita sem geografia — não há onde pousar o número", () => {
    const { resumo } = validar([linha({ Concelho: "", Freguesia: "" })], MAP);
    expect(resumo.rejeitadas).toBe(1);
  });

  it("rejeita sem período legível", () => {
    expect(validar([linha({ Trimestre: "algures em 2026" })], MAP).resumo.rejeitadas).toBe(1);
  });

  it("rejeita sem €/m²", () => {
    expect(validar([linha({ "€/m2": "" })], MAP).resumo.rejeitadas).toBe(1);
  });

  it("rejeita €/m² implausível — é coluna errada, não mercado extraordinário", () => {
    // 45 € por m² seria a coluna do desconto no sítio do preço.
    expect(validar([linha({ "€/m2": "45" })], MAP).resumo.rejeitadas).toBe(1);
    // 90.000 € por m² não existe em Portugal.
    expect(validar([linha({ "€/m2": "90000" })], MAP).resumo.rejeitadas).toBe(1);
  });

  it("avisa (não rejeita) quando a amostra é pequena", () => {
    const { resumo, linhas } = validar([linha({ N: "3" })], MAP);
    expect(resumo.avisos).toBe(1);
    expect(linhas[0].motivo).toMatch(/amostra pequena/);
  });

  it("avisa quando não sabe quantas transações sustentam o número", () => {
    const { linhas } = validar([linha({ N: "" })], MAP);
    expect(linhas[0].estado).toBe("AVISO");
    expect(linhas[0].motivo).toMatch(/número de transações/);
  });

  it("normaliza o desconto venha em percentagem ou em fração", () => {
    const map2 = { ...MAP, desconto_medio: "Desconto" } as const;
    const a = validar([{ ...linha({}), Desconto: "12" }], map2).linhas[0];
    const b = validar([{ ...linha({}), Desconto: "0,12" }], map2).linhas[0];
    expect(a.normalizado?.desconto_medio).toBeCloseTo(0.12, 4);
    expect(b.normalizado?.desconto_medio).toBeCloseTo(0.12, 4);
  });

  it("prefere a microzona à freguesia quando o ficheiro traz as duas", () => {
    const map3 = { ...MAP, microzona: "Microzona" } as const;
    const { linhas } = validar([{ ...linha({}), Microzona: "Miraflores" }], map3);
    expect(linhas[0].normalizado?.zona).toBe("Miraflores");
  });

  it("conta certo num ficheiro misto", () => {
    const { resumo } = validar([
      linha({}),                              // válida
      linha({ N: "2" }),                      // aviso
      linha({ "€/m2": "" }),                  // rejeitada
      linha({ Trimestre: "??" }),             // rejeitada
    ], MAP);
    expect(resumo).toEqual({ total: 4, validas: 1, avisos: 1, rejeitadas: 2 });
  });
});
