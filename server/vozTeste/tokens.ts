/**
 * Voice Tutor — Fase 2 (protótipo). Token TEMPORÁRIO de sessão de voz emitido pelo servidor de teste.
 * O navegador nunca recebe chave do Google nem da ElevenLabs: recebe só este token, que vale poucos segundos, uma única vez,
 * e carrega a escolha validada (motor, voz, nível). Assinado com HMAC-SHA256 (segredo só no servidor).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface DadosSessao {
  motor: "gemini";
  voz: string;
  nivel: string;
  vad: "padrao" | "rapido";
}

interface Carga extends DadosSessao {
  exp: number; // ms desde 1970
  n: string; // nonce (uso único)
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const assinar = (dados: string, segredo: string) => createHmac("sha256", segredo).update(dados).digest();

export function emitirToken(d: DadosSessao, segredo: string, validadeMs = 60_000, agora = Date.now()): { token: string; expiraEm: number } {
  if (!segredo || segredo.length < 32) throw new Error("segredo de sessão ausente ou curto (mínimo 32 caracteres)");
  const carga: Carga = { ...d, exp: agora + validadeMs, n: randomBytes(12).toString("base64url") };
  const corpo = b64u(JSON.stringify(carga));
  return { token: `v1.${corpo}.${b64u(assinar(corpo, segredo))}`, expiraEm: carga.exp };
}

/** Nonces já usados (memória do processo; o protótipo roda num processo só). */
export class UsoUnico {
  private vistos = new Map<string, number>();
  marcar(n: string, exp: number, agora = Date.now()): boolean {
    for (const [k, e] of this.vistos) if (e < agora) this.vistos.delete(k);
    if (this.vistos.has(n)) return false;
    this.vistos.set(n, exp);
    return true;
  }
}

export type Verificacao = { ok: true; dados: DadosSessao } | { ok: false; motivo: "formato" | "assinatura" | "expirado" | "reusado" };

export function verificarToken(token: string, segredo: string, usados: UsoUnico, agora = Date.now()): Verificacao {
  const partes = String(token ?? "").split(".");
  if (partes.length !== 3 || partes[0] !== "v1") return { ok: false, motivo: "formato" };
  const esperado = assinar(partes[1], segredo);
  const recebido = Buffer.from(partes[2], "base64url");
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return { ok: false, motivo: "assinatura" };
  let carga: Carga;
  try {
    carga = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
  } catch {
    return { ok: false, motivo: "formato" };
  }
  if (typeof carga.exp !== "number" || carga.exp < agora) return { ok: false, motivo: "expirado" };
  if (!usados.marcar(carga.n, carga.exp, agora)) return { ok: false, motivo: "reusado" };
  const { motor, voz, nivel, vad } = carga;
  return { ok: true, dados: { motor, voz, nivel, vad } };
}

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
