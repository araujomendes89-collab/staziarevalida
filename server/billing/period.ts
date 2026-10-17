/** Contas de data e documento da cobrança (sem fornecedor). Brasília é UTC-3 o ano todo (sem horário de verão desde 2019). */
import type { Cycle } from "./provider";

const BRT = 3 * 3600_000;

/** AAAA-MM-DD no fuso de Brasília, com dias a somar. */
export function brtDate(d: Date, addDays = 0): string {
  const x = new Date(d.getTime() - BRT + addDays * 86_400_000);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

/** Soma meses a um dia AAAA-MM-DD (dia 31 vira o último dia do mês). */
export function addMonthsToDay(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Fim do dia AAAA-MM-DD em Brasília (23:59:59). */
export function endOfBrtDay(day: string): Date {
  return new Date(`${day}T23:59:59-03:00`);
}

export const cycleMonths = (c: Cycle | "mensal" | "trimestral") => (c === "quarterly" || c === "trimestral" ? 3 : 1);

/**
 * Até quando vale o acesso pago por uma cobrança do plano (regra SEM tolerância: vale até o fim do dia do próximo vencimento).
 *   - pago até o vencimento (cartão no dia, Pix antes): vencimento + ciclo (pagar antes não perde dias);
 *   - pago DEPOIS do vencimento (cartão que o fornecedor reprocessou dias depois, ou Pix atrasado; o acesso já tinha caído):
 *     o período conta da CONFIRMAÇÃO (decisão do dono 17/10): dia do pagamento + ciclo.
 */
export function periodEndFor(opts: { method: "pix" | "card" | "debit"; dueDate: string | null; paidAt: Date; cycle: Cycle | "mensal" | "trimestral" }): Date {
  const paidDay = brtDate(opts.paidAt);
  const due = opts.dueDate ?? paidDay;
  const base = paidDay > due ? paidDay : due;
  return endOfBrtDay(addMonthsToDay(base, cycleMonths(opts.cycle)));
}

/** CPF (11 dígitos) ou CNPJ (14) com dígitos verificadores corretos. Devolve só os dígitos, ou null. */
export function cleanDocument(raw: unknown): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (/^(\d)\1+$/.test(d)) return null;
  const check = (digits: string, weights: number[]) => {
    const sum = weights.reduce((acc, w, i) => acc + Number(digits[i]) * w, 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  if (d.length === 11) {
    const a = check(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const b = check(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return a === Number(d[9]) && b === Number(d[10]) ? d : null;
  }
  if (d.length === 14) {
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    return check(d, w1) === Number(d[12]) && check(d, w2) === Number(d[13]) ? d : null;
  }
  return null;
}
