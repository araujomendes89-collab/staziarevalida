/**
 * PONTE DE VOZ (Gemini Live pelo Vertex) — bilhete da ligação.
 *
 * O servidor do app (Vercel) monta a sessão inteira (modelo, voz, instruções do professor, ferramentas, limite de tempo, quem é
 * o aluno e qual é a ligação) e SELA num bilhete com AES-256-GCM (chave derivada de VOZ_PONTE_SEGREDO, que só o app e a ponte
 * no Cloud Run conhecem). O navegador recebe o bilhete, mas não lê nem altera nada (cifrado e autenticado); só o entrega à ponte
 * na primeira mensagem do WebSocket (não vai na URL, para não cair em log). O bilhete vale pouco (padrão 60 s para abrir) e uma vez.
 * Nenhuma credencial do Google sai do servidor.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface FerramentaDeclarada { name: string; description: string; parameters: unknown }

export interface ConteudoBilhete {
  /** id da ligação no banco (tutor_voice_calls.id) */
  vc: string;
  /** id do aluno (só para registrar o uso; nunca vai ao Google) */
  u: string;
  modelo: string;
  voz: string;
  instrucoes: string;
  ferramentas: FerramentaDeclarada[];
  /** limite da ligação em segundos (o que o painel e o saldo do aluno permitem) */
  maxSegundos: number;
  /** "padrao" ou "rapido" (detector de fim de fala) */
  vad?: "padrao" | "rapido";
}

interface Selado extends ConteudoBilhete { v: 1; exp: number; n: string }

const chave = (segredo: string) => createHash("sha256").update(`stazia-voz-ponte:bilhete:v1:${segredo}`).digest();

export function selarBilhete(c: ConteudoBilhete, segredo: string, validadeMs = 60_000, agora = Date.now()): { bilhete: string; expiraEm: number; nonce: string } {
  if (!segredo || segredo.length < 32) throw new Error("VOZ_PONTE_SEGREDO ausente ou curto (mínimo 32 caracteres)");
  const n = randomBytes(12).toString("base64url");
  const corpo: Selado = { ...c, v: 1, exp: agora + validadeMs, n };
  const iv = randomBytes(12);
  const cif = createCipheriv("aes-256-gcm", chave(segredo), iv);
  const ct = Buffer.concat([cif.update(JSON.stringify(corpo), "utf8"), cif.final()]);
  return { bilhete: Buffer.concat([iv, cif.getAuthTag(), ct]).toString("base64url"), expiraEm: corpo.exp, nonce: n };
}

export type Aberto = { ok: true; conteudo: ConteudoBilhete; nonce: string; exp: number } | { ok: false; motivo: "formato" | "lacre" | "expirado" | "reusado" };

/** Nonces já usados nesta instância da ponte. */
export class NoncesUsados {
  private vistos = new Map<string, number>();
  marcar(n: string, exp: number, agora = Date.now()): boolean {
    for (const [k, e] of this.vistos) if (e < agora) this.vistos.delete(k);
    if (this.vistos.has(n)) return false;
    this.vistos.set(n, exp);
    return true;
  }
}

export function abrirBilhete(bilhete: string, segredo: string, usados: NoncesUsados, agora = Date.now()): Aberto {
  let buf: Buffer;
  try {
    buf = Buffer.from(String(bilhete ?? ""), "base64url");
  } catch {
    return { ok: false, motivo: "formato" };
  }
  if (buf.length < 12 + 16 + 10 || buf.length > 200_000) return { ok: false, motivo: "formato" };
  let corpo: Selado;
  try {
    const dec = createDecipheriv("aes-256-gcm", chave(segredo), buf.subarray(0, 12));
    dec.setAuthTag(buf.subarray(12, 28));
    corpo = JSON.parse(Buffer.concat([dec.update(buf.subarray(28)), dec.final()]).toString("utf8"));
  } catch {
    return { ok: false, motivo: "lacre" };
  }
  if (corpo.v !== 1 || typeof corpo.exp !== "number" || corpo.exp < agora) return { ok: false, motivo: "expirado" };
  if (!usados.marcar(corpo.n, corpo.exp, agora)) return { ok: false, motivo: "reusado" };
  const { vc, u, modelo, voz, instrucoes, ferramentas, maxSegundos, vad } = corpo;
  return { ok: true, conteudo: { vc, u, modelo, voz, instrucoes, ferramentas, maxSegundos, vad }, nonce: corpo.n, exp: corpo.exp };
}

/** Assinatura do relatório de uso que a ponte manda ao app no fim da ligação. */
export const assinarRelatorio = (corpo: string, segredo: string) => createHmac("sha256", `stazia-voz-ponte:relatorio:v1:${segredo}`).update(corpo).digest("hex");
export function relatorioConfere(corpo: string, assinatura: string, segredo: string): boolean {
  if (!segredo || segredo.length < 32 || !/^[0-9a-f]{64}$/.test(assinatura)) return false;
  return timingSafeEqual(Buffer.from(assinarRelatorio(corpo, segredo), "hex"), Buffer.from(assinatura, "hex"));
}
