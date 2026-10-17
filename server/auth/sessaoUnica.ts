/**
 * Sessão única nas rotas de IA (decisão do dono, 17/10/2026): sessão derrubada (a conta foi aberta em outro aparelho) não
 * gasta IA. Pergunta ao banco (app_session_check, migração …13670) como o próprio usuário: no Supabase vale o session_id do
 * token; no banco local, o cabeçalho X-Stazia-Sessao que o app manda. A regra, a equipe e os revisores seguem a chave
 * app_settings 'sessao_unica' (desligada = o banco responde vigente e nada muda).
 *
 * Na dúvida, libera: se o banco falhar (sem rede, migração ainda não aplicada), a chamada segue como antes.
 * Para não pesar (a voz chama várias rotas por minuto), cada resposta fica guardada por 30 s nesta instância; uma sessão
 * derrubada nunca volta a valer, então essa resposta fica 10 min.
 */
import type { Request } from "express";
import type { ContentDb, Identity } from "../contentHub/infra";
import { sessionIdFromToken } from "../../src/novo/data/backend";

export const SESSAO_DERRUBADA_CODIGO = "sessao_derrubada";
export const SESSAO_DERRUBADA_MENSAGEM = "Sua conta foi aberta em outro aparelho. Entre de novo para continuar.";

const VIGENTE_MS = 30_000;
const DERRUBADA_MS = 10 * 60_000;
const MAX_GUARDADAS = 5_000;
const ID_VALIDO = /^[A-Za-z0-9_-]{8,128}$/;

const guardadas = new Map<string, { derrubada: boolean; ate: number }>();
let avisouFalha = false;

/** Sessão que o app mandou no cabeçalho (só vale quando o token não traz session_id). */
export function sessaoDoCabecalho(req: Pick<Request, "headers">): string | null {
  const raw = req.headers["x-stazia-sessao"];
  const value = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();
  return ID_VALIDO.test(value) ? value : null;
}

/** Para os testes: esquece as respostas guardadas. */
export function esquecerSessoesGuardadas() {
  guardadas.clear();
  avisouFalha = false;
}

/** true = esta sessão foi derrubada por outro aparelho e a rota de IA deve recusar. */
export async function sessaoDerrubada(db: Pick<ContentDb, "asUser">, user: Identity, req: Pick<Request, "headers">, agora = Date.now()): Promise<boolean> {
  const cabecalho = sessaoDoCabecalho(req);
  const chave = `${user.id}:${sessionIdFromToken(user.jwt) ?? cabecalho ?? "-"}`;
  const guardada = guardadas.get(chave);
  if (guardada && guardada.ate > agora) return guardada.derrubada;
  try {
    const r = await db.asUser<{ vigente?: boolean } | null>(user, "app_session_check", { p_session_id: cabecalho });
    const derrubada = r?.vigente === false;
    if (guardadas.size >= MAX_GUARDADAS) guardadas.clear();
    guardadas.set(chave, { derrubada, ate: agora + (derrubada ? DERRUBADA_MS : VIGENTE_MS) });
    return derrubada;
  } catch (error) {
    if (!avisouFalha) {
      avisouFalha = true;
      console.warn("[sessao-unica] não foi possível conferir a sessão; a chamada segue liberada:", error instanceof Error ? error.message : error);
    }
    return false;
  }
}
