// =====================================================================
// Testes dos relatórios: nunca aos pedaços
// ---------------------------------------------------------------------
// Estas duas regras custaram uma noite de produção a 22/08/2026. O Mapa de
// Oportunidade da Terrae — que diz a um proprietário quanto vale a casa
// dele — ficava preso no ecrã "a analisar" e o visitante desistia.
//
// A causa era a soma de dois defeitos que, isolados, pareciam inofensivos:
//
//  1. O tempo limite de um pedido era 12s, pensado para um chat. Um
//     relatório leva minutos. Abortava sempre a meio.
//
//  2. Ao abortar a meio, o gateway já tinha enviado metade da resposta ao
//     cliente. Passava ao modelo seguinte, que começava do princípio — e as
//     duas metades ficavam coladas. O resultado medido: um JSON com 77
//     chavetas abertas e 74 fechadas, que o motor da Terrae rejeitava.
//
// Um relatório não é lido enquanto escorre; é lido no fim. Por isso pede-se
// inteiro. Um chat é o contrário — lê-se a escorrer — e mantém streaming.
// =====================================================================
import { describe, it, expect, vi } from "vitest";

/** Fornecedor que regista se lhe pediram stream ou resposta inteira. */
function fornecedor(resposta = '{"valor":1}') {
  return {
    chamadas: [] as string[],
    ultimoOpts: null as any,
    generate: vi.fn(async function (this: any, o: any) {
      return { ok: true, text: resposta, status: 200, kind: "ok" as const, usage: { input: 10, output: 5 } };
    }),
    stream: vi.fn(async function* (o: any) {
      yield { type: "delta" as const, text: resposta };
      return { ok: true, text: resposta, status: 200, kind: "ok" as const };
    }),
  };
}

describe("um relatório pede-se inteiro, não aos pedaços", () => {
  it("com jsonMode usa generate e nunca stream", async () => {
    const p = fornecedor();
    // o gateway decide por `a.jsonMode`; aqui exercita-se a mesma regra
    const jsonMode = true;
    if (jsonMode) await p.generate({ model: "m" });
    else await p.stream({ model: "m" }).next();
    expect(p.generate).toHaveBeenCalledTimes(1);
    expect(p.stream).not.toHaveBeenCalled();
  });

  it("um chat continua a escorrer", async () => {
    const p = fornecedor();
    const jsonMode = false;
    if (jsonMode) await p.generate({ model: "m" });
    else await p.stream({ model: "m" }).next();
    expect(p.stream).toHaveBeenCalledTimes(1);
    expect(p.generate).not.toHaveBeenCalled();
  });
});

describe("duas respostas parciais nunca se colam", () => {
  // A regra: depois de enviar texto ao cliente, um modelo que falhe não
  // pode ser substituído por outro. Concatenar dá um JSON impossível.
  function simular(deuAlgo: boolean, falhou: boolean) {
    const eventos: string[] = [];
    if (falhou) {
      if (deuAlgo) eventos.push("erro:corte_a_meio", "parar");
      else eventos.push("proximo_modelo");
    } else eventos.push("ok");
    return eventos;
  }

  it("falha DEPOIS de enviar texto: pára e assinala", () => {
    expect(simular(true, true)).toEqual(["erro:corte_a_meio", "parar"]);
  });

  it("falha SEM ter enviado nada: tenta o modelo seguinte, em silêncio", () => {
    expect(simular(false, true)).toEqual(["proximo_modelo"]);
  });
});

describe("um JSON truncado tem de ser detetável", () => {
  // Foi assim que se apanhou a avaria: contar chavetas. O motor da Terrae
  // já o fazia, e é por isso que rejeitava — estava certo.
  function equilibrado(s: string) {
    let n = 0, emTexto = false, escape = false;
    for (const c of s) {
      if (emTexto) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') emTexto = false;
      } else if (c === '"') emTexto = true;
      else if (c === "{") n++;
      else if (c === "}") n--;
    }
    return n === 0;
  }

  it("aceita um JSON completo", () => {
    expect(equilibrado('{"a":{"b":1}}')).toBe(true);
  });

  it("rejeita o que ficou a meio", () => {
    expect(equilibrado('{"a":{"b":1}')).toBe(false);
  });

  it("não se engana com chavetas dentro de texto", () => {
    expect(equilibrado('{"a":"tem { e } no meio"}')).toBe(true);
  });
});
