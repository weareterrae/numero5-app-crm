import { describe, it, expect } from "vitest";
import {
  minutosReuniao,
  resumoReunioes,
  reuniaoExcedePercentagem,
  type Reuniao,
} from "./operacao";

describe("reuniões (Fase 2, bloco 2)", () => {
  it("os minutos reais preferem a duração real à planeada", () => {
    expect(minutosReuniao({ duracao_planeada_min: 30, duracao_real_min: 55 })).toBe(55);
    expect(minutosReuniao({ duracao_planeada_min: 30, duracao_real_min: null })).toBe(30);
    expect(minutosReuniao({ duracao_planeada_min: null, duracao_real_min: null })).toBe(0);
  });

  it("uma reunião incluída não conta como extra", () => {
    const r: Reuniao[] = [{ duracao_real_min: 40, incluida: true }];
    const s = resumoReunioes(r, 2);
    expect(s.incluidas).toBe(1);
    expect(s.extras).toBe(0);
    expect(s.excedeIncluidas).toBe(false);
  });

  it("uma reunião adicional conta como extra e por faturar", () => {
    const r: Reuniao[] = [
      { duracao_real_min: 40, incluida: true },
      { duracao_real_min: 60, incluida: false, faturar: true, faturada: false },
    ];
    const s = resumoReunioes(r, 1);
    expect(s.extras).toBe(1);
    expect(s.extrasPorFaturar).toBe(1);
    expect(s.excedeIncluidas).toBe(true); // 2 reuniões, limite 1
  });

  it("as horas reais somam-se para a rentabilidade", () => {
    const r: Reuniao[] = [
      { duracao_real_min: 90, incluida: true },
      { duracao_planeada_min: 30, incluida: true }, // sem real → usa planeada
    ];
    const s = resumoReunioes(r, 4);
    expect(s.minutosReais).toBe(120);
    expect(s.horasReais).toBe(2);
  });

  it("extra já faturado não conta para «por faturar»", () => {
    const r: Reuniao[] = [{ duracao_real_min: 60, incluida: false, faturar: true, faturada: true }];
    expect(resumoReunioes(r, 1).extrasPorFaturar).toBe(0);
  });

  it("sem limite definido, nunca excede", () => {
    const r: Reuniao[] = [{ incluida: true }, { incluida: true }, { incluida: true }];
    expect(resumoReunioes(r, null).excedeIncluidas).toBe(false);
  });

  it("alerta quando o tempo de reunião passa a percentagem das horas contratadas", () => {
    // 300 min = 5h; 20 h contratadas; limite 20% = 4h → 5h > 4h → alerta
    expect(reuniaoExcedePercentagem(300, 20, 20)).toBe(true);
    expect(reuniaoExcedePercentagem(180, 20, 20)).toBe(false); // 3h < 4h
    expect(reuniaoExcedePercentagem(300, null, 20)).toBe(false); // sem horas contratadas
    expect(reuniaoExcedePercentagem(300, 20, null)).toBe(false); // sem limite
  });
});
