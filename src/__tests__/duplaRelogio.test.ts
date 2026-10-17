/**
 * Treinamento em Dupla · etapa 5 · tarefa 15: relógio da sala. O tempo vem do servidor (ends_at / paused_left_ms) corrigido pela
 * diferença de relógio medida no meio da ida e volta; nunca de um contador local.
 */
import { describe, expect, it } from "vitest";
import { formatClock, measureOffset, remainingMs } from "../novo/app/dupla/clock.js";

const T = (iso: string) => Date.parse(iso);

describe("relógio da sala", () => {
  it("diferença de relógio no meio da ida e volta", () => {
    // servidor 12:00:10,000; enviado 12:00:00,000 (aparelho); recebido 400 ms depois → 10 000 − 200 = 9 800
    expect(measureOffset("2026-10-12T12:00:10.000Z", T("2026-10-12T12:00:00.000Z"), T("2026-10-12T12:00:00.400Z"))).toBe(9800);
    expect(measureOffset("não é data", 0, 0)).toBe(0);
  });

  it("restante a partir de ends_at igual (±1 s) em dois aparelhos com relógios diferentes", () => {
    const room = { ends_at: "2026-10-12T12:10:00.000Z", paused_left_ms: null };
    // servidor às 12:00:00; aparelho A adiantado 7 s, aparelho B atrasado 3 min
    const a = { now: T("2026-10-12T12:00:07.000Z"), offset: measureOffset("2026-10-12T12:00:00.000Z", T("2026-10-12T12:00:06.900Z"), T("2026-10-12T12:00:07.100Z")) };
    const b = { now: T("2026-10-12T11:57:00.000Z"), offset: measureOffset("2026-10-12T12:00:00.000Z", T("2026-10-12T11:56:59.800Z"), T("2026-10-12T11:57:00.200Z")) };
    const ra = remainingMs(room, a.now, a.offset)!;
    const rb = remainingMs(room, b.now, b.offset)!;
    expect(Math.abs(ra - rb)).toBeLessThanOrEqual(1000);
    expect(Math.abs(ra - 600000)).toBeLessThanOrEqual(1000);
  });

  it("pausado usa paused_left_ms; sem ends_at → null; nunca negativo; '09:59'", () => {
    expect(remainingMs({ ends_at: null, paused_left_ms: 125000 }, Date.now(), 0)).toBe(125000);
    expect(remainingMs({ ends_at: null, paused_left_ms: null }, Date.now(), 0)).toBeNull();
    expect(remainingMs(null, Date.now(), 0)).toBeNull();
    expect(remainingMs({ ends_at: "2026-10-12T12:00:00.000Z", paused_left_ms: null }, T("2026-10-12T12:05:00.000Z"), 0)).toBe(0);
    expect(formatClock(599999)).toBe("09:59");
    expect(formatClock(600000)).toBe("10:00");
    expect(formatClock(-5)).toBe("00:00");
    expect(formatClock(Number.NaN)).toBe("00:00");
  });
});
