/**
 * CÉREBRO DO TUTOR — assinatura dos pedidos servidor a servidor entre a PONTE de voz (Cloud Run) e o app (Vercel):
 *   ponte → app  POST /api/tutor/voz/conhecimento   (busca de conhecimento da ligação; o texto da busca não passa pelo navegador)
 *   ponte → app  POST /api/tutor/voz/pacote          (material novo do tema depois de next_question)
 *   app → ponte  POST /vetor                         (vetor da pergunta do Tutor por texto: o site não tem conta de serviço do Google)
 * HMAC-SHA256 com chave derivada de VOZ_PONTE_SEGREDO (o mesmo segredo do bilhete, que só o app e a ponte conhecem), com rótulo
 * próprio (não serve para o bilhete nem para o relatório de uso). O corpo leva `ts` (prazo de 30 s) e `n` (nonce: assinatura
 * repetida é recusada na mesma instância).
 * Arquivo puro (só node:crypto): também vai no pacote da ponte.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PRAZO_ASSINATURA_MS = 30_000;
export const CABECALHO_ASSINATURA = "x-stazia-conhecimento-assinatura";

const chave = (segredo: string) => `stazia-voz-ponte:conhecimento:v1:${segredo}`;

export function assinarCorpo(corpo: string, segredo: string): string {
  if (!segredo || segredo.length < 32) throw new Error("VOZ_PONTE_SEGREDO ausente ou curto (mínimo 32 caracteres)");
  return createHmac("sha256", chave(segredo)).update(corpo).digest("hex");
}

/** Monta o corpo com ts e nonce e devolve corpo + assinatura. */
export function corpoAssinado(dados: Record<string, unknown>, segredo: string, agora = Date.now()): { corpo: string; assinatura: string } {
  const corpo = JSON.stringify({ ...dados, ts: agora, n: randomBytes(12).toString("base64url") });
  return { corpo, assinatura: assinarCorpo(corpo, segredo) };
}

/** Nonces já usados nesta instância (dentro do prazo). */
export class NoncesConhecimento {
  private vistos = new Map<string, number>();
  marcar(n: string, ate: number, agora = Date.now()): boolean {
    for (const [k, e] of this.vistos) if (e < agora) this.vistos.delete(k);
    if (this.vistos.has(n)) return false;
    if (this.vistos.size > 50_000) return false; // inundação: recusa em vez de crescer sem fim
    this.vistos.set(n, ate);
    return true;
  }
}

export type Conferido<T> = { ok: true; dados: T } | { ok: false; motivo: "assinatura" | "formato" | "prazo" | "repetido" };

/** Confere assinatura, prazo e nonce. */
export function conferirCorpo<T extends Record<string, unknown>>(corpo: string, assinatura: string, segredo: string, nonces: NoncesConhecimento, agora = Date.now()): Conferido<T> {
  if (!segredo || segredo.length < 32 || !/^[0-9a-f]{64}$/.test(String(assinatura ?? ""))) return { ok: false, motivo: "assinatura" };
  const certa = Buffer.from(assinarCorpo(corpo, segredo), "hex");
  if (!timingSafeEqual(certa, Buffer.from(assinatura, "hex"))) return { ok: false, motivo: "assinatura" };
  let d: T & { ts?: unknown; n?: unknown };
  try {
    d = JSON.parse(corpo);
  } catch {
    return { ok: false, motivo: "formato" };
  }
  if (!d || typeof d !== "object" || typeof d.ts !== "number" || typeof d.n !== "string" || d.n.length < 8 || d.n.length > 64) return { ok: false, motivo: "formato" };
  if (Math.abs(agora - d.ts) > PRAZO_ASSINATURA_MS) return { ok: false, motivo: "prazo" };
  if (!nonces.marcar(d.n, d.ts + PRAZO_ASSINATURA_MS, agora)) return { ok: false, motivo: "repetido" };
  return { ok: true, dados: d };
}
