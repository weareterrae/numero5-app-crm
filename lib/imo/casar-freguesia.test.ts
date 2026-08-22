// =====================================================================
// Testes do casamento de nomes de freguesia
// ---------------------------------------------------------------------
// O caso que estes testes existem para impedir já aconteceu: o relatório
// «UF Algés e Linda-a-Velha» criou uma freguesia nova em vez de encontrar
// «União das Freguesias de Algés, Linda-a-Velha e Cruz Quebrada-Dafundo».
// O import deu tudo verde, a cobertura subiu, e as três microzonas de
// Algés ficaram sem benchmark nenhum — porque continuavam penduradas na
// freguesia oficial, e o benchmark tinha ido para a órfã.
//
// Um dado inalcançável não dá erro. Só faz as avaliações daquela zona
// caírem para o degrau de baixo, em silêncio.
// =====================================================================
import { describe, it, expect } from "vitest";
import { casarFreguesia, lugares } from "./casar-freguesia";

/** Freguesias de Oeiras como estão na hierarquia. */
const OEIRAS = [
  { id: "a", nome: "União das Freguesias de Algés, Linda-a-Velha e Cruz Quebrada-Dafundo" },
  { id: "b", nome: "União das Freguesias de Carnaxide e Queijas" },
  { id: "c", nome: "Oeiras e São Julião da Barra, Paço de Arcos e Caxias" },
  { id: "d", nome: "Barcarena" },
  { id: "e", nome: "Porto Salvo" },
];

describe("o caso real que partiu os dados", () => {
  it("casa a abreviatura do SIR com a união oficial", () => {
    const r = casarFreguesia("UF Algés e Linda-a-Velha", OEIRAS);
    expect(r.tipo).toBe("lugares");
    expect(r.tipo === "lugares" && r.id).toBe("a");
  });

  it("casa mesmo quando o SIR deixa cair todos os membros menos um", () => {
    const r = casarFreguesia("Algés", OEIRAS);
    expect(r.tipo === "lugares" && r.id).toBe("a");
  });

  it("casa Carnaxide e Queijas", () => {
    expect(casarFreguesia("UF Carnaxide e Queijas", OEIRAS)).toMatchObject({ tipo: "lugares", id: "b" });
    expect(casarFreguesia("Queijas", OEIRAS)).toMatchObject({ id: "b" });
  });
});

describe("nomes iguais não passam pelo caminho difícil", () => {
  it("acerta em cheio e diz que foi exata", () => {
    const r = casarFreguesia("Barcarena", OEIRAS);
    expect(r).toMatchObject({ tipo: "exata", id: "d" });
  });
  it("ignora acentos e maiúsculas", () => {
    expect(casarFreguesia("PORTO SALVO", OEIRAS)).toMatchObject({ tipo: "exata", id: "e" });
  });
});

describe("quando não sabe, não adivinha", () => {
  it("recusa quando dois candidatos casam", () => {
    // Uma união e uma das suas freguesias antigas, ambas na tabela: o
    // nome curto cabe nas duas e não há como escolher.
    const ambas = [
      { id: "x", nome: "União das Freguesias de Cascais e Estoril" },
      { id: "y", nome: "Cascais" },
    ];
    const r = casarFreguesia("Cascais e Estoril", ambas);
    expect(r.tipo).toBe("ambigua");
    expect(r.tipo === "ambigua" && r.nomes).toHaveLength(2);
  });

  it("não casa por parecença de letras", () => {
    // «Alcabideche» e «Alcochete» partilham o princípio e não têm nada a
    // ver uma com a outra. Comparar textos casaria; comparar lugares não.
    expect(casarFreguesia("Alcochete", [{ id: "z", nome: "Alcabideche" }]).tipo).toBe("nenhuma");
  });

  it("devolve «nenhuma» para uma freguesia que ainda não existe", () => {
    expect(casarFreguesia("Alcabideche", OEIRAS).tipo).toBe("nenhuma");
  });
});

describe("como se partem os nomes", () => {
  it("separa por vírgulas e por «e»", () => {
    expect(lugares("União das Freguesias de Algés, Linda-a-Velha e Cruz Quebrada-Dafundo"))
      .toEqual(["alges", "linda-a-velha", "cruz quebrada-dafundo"]);
  });

  it("não parte hífenes — «Cruz Quebrada-Dafundo» é um lugar só", () => {
    expect(lugares("Cruz Quebrada-Dafundo")).toEqual(["cruz quebrada-dafundo"]);
  });

  it("aguenta os quatro membros de Oeiras", () => {
    expect(lugares("Oeiras e São Julião da Barra, Paço de Arcos e Caxias"))
      .toEqual(["oeiras", "sao juliao da barra", "paco de arcos", "caxias"]);
  });

  it("tira os prefixos todos", () => {
    for (const p of ["UF Palmela", "União das Freguesias de Palmela",
                     "União de Freguesias de Palmela", "Freguesia de Palmela", "Palmela"]) {
      expect(lugares(p)).toEqual(["palmela"]);
    }
  });
});
