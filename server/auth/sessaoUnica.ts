/**
 * Sessão única nas rotas de IA (decisão do dono, 17/10/2026): sessão derrubada (a conta foi aberta em outro aparelho) não
 * gasta IA. Pergunta ao banco (app_session_check, migração …13670) como o próprio usuário: no Supabase vale o session_id do
 * token; no banco local, o cabeçalho X-Stazia-Sessao que o app manda. A regra, a equipe e os revisores seguem a chave
 * app_settings 'sessao_unica' (desligada = o banco responde vigente e nada muda).
 *
 * Na dúvida, RECUSA (Pacote 1, achado da auditoria de 17/10): se o banco falhar (sem rede, erro, resposta estranha), a rota
 * de IA não gasta; responde 503 "tente de novo" com o código sessao_indisponivel, que o app NÃO trata como sessão derrubada
 * (ninguém sai da conta por causa disso). Só uma folga: se esta mesma sessão foi confirmada vigente há menos de 2 min, um
 * soluço do banco não interrompe a conversa. O login e a abertura do app não passam por aqui.
 * Para não pesar (a voz chama várias rotas por minuto), cada resposta fica guardada por 30 s nesta instância; uma sessão
 * derrubada nunca volta a valer, então essa resposta fica 10 min.
 */
import type { Request } from "express";
import type { ContentDb, Identity } from "../contentHub/infra";
import { sessionIdFromToken } from "../../src/novo/data/backend";

export const SESSAO_DERRUBADA_CODIGO = "sessao_derrubada";
export const SESSAO_DERRUBADA_MENSAGEM = "Sua conta foi aberta em outro aparelho. Entre de novo para continuar.";
export const SESSAO_INDISPONIVEL_CODIGO = "sessao_indisponivel";
export const SESSAO_INDISPONIVEL_MENSAGEM = "Não deu para conferir a sua sessão agora. Tente de novo em instantes.";

export type SituacaoSessao = "vigente" | "derrubada" | "indisponivel";

const VIGENTE_MS = 30_000;
const DERRUBADA_MS = 10 * 60_000;
const MAX_GUARDADAS = 5_000;
/** Folga de um soluço do banco: sessão confirmada vigente há menos que isto segue valendo se a conferência falhar. */
const FOLGA_FALHA_MS = 2 * 60_000;
const ID_VALIDO = /^[A-Za-z0-9_-]{8,128}$/;

const guardadas = new Map<string, { derrubada: boolean; ate: number; confirmada: number }>();
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

/**
 * Situação desta sessão para uma rota de IA: "vigente" (segue), "derrubada" (outro aparelho entrou: 401 sessao_derrubada) ou
 * "indisponivel" (não deu para conferir: 503 sessao_indisponivel, sem gastar IA e sem tirar ninguém da conta).
 */
export async function conferirSessao(db: Pick<ContentDb, "asUser">, user: Identity, req: Pick<Request, "headers">, agora = Date.now()): Promise<SituacaoSessao> {
  const cabecalho = sessaoDoCabecalho(req);
  const chave = `${user.id}:${sessionIdFromToken(user.jwt) ?? cabecalho ?? "-"}`;
  const guardada = guardadas.get(chave);
  if (guardada && guardada.ate > agora) return guardada.derrubada ? "derrubada" : "vigente";
  try {
    const r = await db.asUser<{ vigente?: unknown } | null>(user, "app_session_check", { p_session_id: cabecalho });
    if (!r || typeof r !== "object" || typeof r.vigente !== "boolean") throw new Error("resposta sem 'vigente'");
    const derrubada = r.vigente === false;
    if (guardadas.size >= MAX_GUARDADAS) guardadas.clear();
    guardadas.set(chave, { derrubada, ate: agora + (derrubada ? DERRUBADA_MS : VIGENTE_MS), confirmada: agora });
    return derrubada ? "derrubada" : "vigente";
  } catch (error) {
    if (!avisouFalha) {
      avisouFalha = true;
      console.warn("[sessao-unica] não foi possível conferir a sessão; a chamada de IA foi recusada:", error instanceof Error ? error.message : error);
    }
    // soluço do banco logo depois de uma confirmação: a conversa não para
    if (guardada && !guardada.derrubada && agora - guardada.confirmada < FOLGA_FALHA_MS) return "vigente";
    return "indisponivel";
  }
}

/** true = esta sessão foi derrubada por outro aparelho. Falha do banco NÃO conta como derrubada (use conferirSessao nas rotas). */
export async function sessaoDerrubada(db: Pick<ContentDb, "asUser">, user: Identity, req: Pick<Request, "headers">, agora = Date.now()): Promise<boolean> {
  return (await conferirSessao(db, user, req, agora)) === "derrubada";
}
