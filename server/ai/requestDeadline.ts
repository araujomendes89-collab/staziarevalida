/**
 * Hora-limite do pedido ao site (correção IA10, 2026-10-10). A Vercel corta cada pedido em 300 s; o prazo começa quando o
 * pedido chega e vale para todas as chamadas de IA dele (um roteiro de Podcast, por exemplo, pode chamar a IA duas vezes).
 * O servidor marca a hora-limite na chegada (requestDeadlineMiddleware) e o maestro a lê (currentRequestDeadline).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

/** Orçamento de um pedido no site: 270 s dos 300 s da Vercel (sobra para gravar e responder). */
export const REQUEST_BUDGET_MS = 270_000;

const store = new AsyncLocalStorage<{ deadlineAt: number }>();

/** Roda `fn` com a hora-limite `deadlineAt` (ms desde 1970) valendo para todo o trabalho dentro dela. */
export function withRequestDeadline<T>(deadlineAt: number, fn: () => T): T {
  return store.run({ deadlineAt }, fn);
}

/** A hora-limite do pedido em andamento, ou null fora de um pedido marcado. */
export function currentRequestDeadline(): number | null {
  return store.getStore()?.deadlineAt ?? null;
}

/** Express: marca a hora-limite na chegada de cada pedido (usado só no site da Vercel). */
export function requestDeadlineMiddleware(budgetMs = REQUEST_BUDGET_MS) {
  return (_req: Request, _res: Response, next: NextFunction) => withRequestDeadline(Date.now() + budgetMs, next);
}
