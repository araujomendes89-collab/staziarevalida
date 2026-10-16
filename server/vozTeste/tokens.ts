/**
 * Voice Tutor — Fase 2 (protótipo). Segredo compartilhado do Custom LLM (Authorization: Bearer), comparado sem vazar tempo.
 * (O acesso do navegador à voz ao vivo é pelo bilhete selado da ponte: server/vozPonte/bilhete.ts.)
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Compara um segredo recebido (ex.: Authorization: Bearer do Custom LLM) sem vazar tempo. Segredo vazio nunca autoriza. */
export function segredoConfere(recebido: string | undefined | null, esperado: string | undefined | null): boolean {
  if (!esperado || esperado.length < 32 || !recebido) return false;
  const a = createHmac("sha256", "cmp").update(recebido).digest();
  const b = createHmac("sha256", "cmp").update(esperado).digest();
  return timingSafeEqual(a, b);
}

export function bearer(cabecalho: string | string[] | undefined): string | null {
  const v = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;
  const m = /^Bearer\s+(.+)$/i.exec(v ?? "");
  return m ? m[1].trim() : null;
}
