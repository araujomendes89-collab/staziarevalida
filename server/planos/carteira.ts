/**
 * Carteira de créditos de IA (planos, etapa 2; migração 20261003013680_carteira_creditos.sql). Um só caminho para todo recurso de
 * IA que gasta crédito: RESERVAR antes de chamar a IA → CONFIRMAR pelo custo real (US$) → DEVOLVER se a IA falhar.
 *
 *  - Quem decide é sempre o banco (ch_worker_carteira_reservar). Com a chave "cadeados_ligados" DESLIGADA (modo sombra), o banco
 *    aplica a regra de HOJE por dentro (Tutor por texto = ch_worker_tutor_text_reserve, sem mudança; dica = o mesmo teto por dia,
 *    agora contado no banco) e só anota o custo real; com a chave ligada, a carteira manda.
 *  - Cada pedido leva um request_id único: repetir reservar/confirmar/devolver nunca gasta duas vezes.
 *  - Banco ainda sem a migração 013680 (a função não existe): cai no caminho antigo, idêntico ao de antes ("legado").
 *
 * PONTOS DE LIGAÇÃO (o que cada recurso usa):
 *  - Tutor por texto: server/tutor/engine.ts (tutorTurn) e server/tutor/tools.ts (avaliar raciocínio, pela voz): recurso "tutor_texto".
 *  - Janelinha do Tutor (mini tutor, ramo tutor-personagens): ela já chama POST /api/tutor/turn; basta mandar "origem": "janela" no
 *    corpo (useMiniTutor.js → tutorTurn). O router repassa e o engine reserva o recurso "tutor_janela" (mesma conta de créditos;
 *    na Administração aparece separado). Sem o campo, conta como Tutor por texto.
 *  - Dica do Tutor na questão: server/tutor/questionHint.ts: recurso "dica_questao".
 *  - Abertura do Tutor escrita pela IA (decisão do dono de 17/10; migração 013807): server/tutor/opening.ts, recurso "tutor_abertura".
 *    Só cobra quando a conversa usa a fala da IA; a preparada e não usada segue custo da casa.
 *  - Correção de estação por IA (ramo dupla-sozinho-ia / stazia-match, server/dupla/soloEval.ts → evaluateSolo): DEPOIS de
 *    ch_worker_solo_prepare dar certo e ANTES de runFunction(maestro, "treino_avaliacao", …), chamar
 *      const w = await reservarCarteira(deps.db, { user: uid, recurso: "correcao_estacao_ia", requestId: `solo:${attemptId}` });
 *      if (!w.ok) → giveUp(w.mensagem) (sem chamar a IA);
 *    no sucesso: await w.confirmar(<custo em US$ da avaliação, somado de todos os membros>); em qualquer falha (giveUp):
 *    await w.devolver(). No modo sombra a cota própria do treino sozinho continua decidindo (a carteira só anota).
 */
import crypto from "node:crypto";
import type { ContentDb } from "../contentHub/infra";

export type RecursoCarteira = "tutor_texto" | "tutor_janela" | "dica_questao" | "correcao_estacao_ia" | "tutor_abertura";

export interface ReservaCarteira {
  ok: boolean;
  /** sombra: a regra de hoje decidiu; ligado: a carteira decidiu; legado: banco sem a carteira (caminho antigo). */
  modo: "sombra" | "ligado" | "legado";
  reason?: string;
  /** Frase para o aluno quando a carteira recusa (chave ligada). */
  mensagem?: string;
  /** Resposta do tutor_entitlement que veio junto da recusa (mesmo formato de antes). */
  entitlement?: any;
  requestId: string;
  /** Reserva antiga do Tutor (ai_usage_ledger), quando houver. */
  reservation?: number | null;
  /** Acerta pelo custo real (US$). Nunca lança: falha só vai para o registro. */
  confirmar(custoUsd: number | null): Promise<ConfirmacaoCarteira | null>;
  /** A IA falhou: devolve a reserva (e a antiga). Nunca lança. */
  devolver(): Promise<void>;
}

export interface ConfirmacaoCarteira {
  ok: boolean;
  modo?: string;
  creditos?: number;
  usado_hoje?: number;
  limite_hoje?: number;
  disponivel?: number;
}

/** O banco ainda não tem a função (migração não aplicada): PostgREST (PGRST202/schema cache) ou Postgres local (42883). */
export const funcaoAusente = (error: unknown) =>
  /could not find the function|schema cache|PGRST202|42883|function .* does not exist/i.test(String((error as Error)?.message ?? error));

export const novoPedido = (prefixo = "ia") => `${prefixo}:${crypto.randomUUID()}`;

interface Opcoes {
  user: string;
  recurso: RecursoCarteira;
  requestId?: string;
  sessionId?: string | null;
  /** Só a dica, no modo sombra: o teto por dia de hoje (vem do servidor). */
  limiteAntigo?: number | null;
  log?: (m: string) => void;
}

/**
 * Reserva na carteira. Banco sem a carteira: para o Tutor faz a reserva antiga (igual a antes); para os outros recursos devolve
 * modo "legado" e ok = true (quem chama aplica a regra antiga dele).
 */
export async function reservarCarteira(db: ContentDb, o: Opcoes): Promise<ReservaCarteira> {
  const requestId = o.requestId ?? novoPedido(o.recurso);
  let r: Record<string, any> | null = null;
  try {
    r = await db.service<Record<string, any> | null>("ch_worker_carteira_reservar", {
      p_user: o.user, p_recurso: o.recurso, p_request_id: requestId, p_session_id: o.sessionId ?? null, p_limite_antigo: o.limiteAntigo ?? null,
    });
  } catch (error) {
    if (!funcaoAusente(error)) throw error;
    r = null;
  }
  if (!r || typeof r !== "object") return legado(db, o, requestId);
  const modo = r.modo === "ligado" ? "ligado" : "sombra";
  return {
    ok: Boolean(r.ok), modo, reason: r.reason, mensagem: r.mensagem, entitlement: r.entitlement, requestId, reservation: r.reservation ?? null,
    confirmar: async (custoUsd) => {
      if (!r!.ok) return null;
      try {
        return await db.service<ConfirmacaoCarteira>("ch_worker_carteira_confirmar", {
          p_user: o.user, p_request_id: requestId, p_custo_usd: custoUsd == null || !Number.isFinite(custoUsd) ? null : Math.max(0, custoUsd), p_meta: {},
        });
      } catch (error) {
        o.log?.(`[carteira] confirmação não gravada: ${(error as Error).message.slice(0, 160)}`);
        return null;
      }
    },
    devolver: async () => {
      if (!r!.ok) return;
      try {
        await db.service("ch_worker_carteira_devolver", { p_user: o.user, p_request_id: requestId });
      } catch (error) {
        o.log?.(`[carteira] devolução não gravada: ${(error as Error).message.slice(0, 160)}`);
      }
    },
  };
}

/** Caminho antigo, idêntico ao de antes da carteira (banco sem a migração 013680). */
async function legado(db: ContentDb, o: Opcoes, requestId: string): Promise<ReservaCarteira> {
  const nada = { confirmar: async () => null, devolver: async () => undefined };
  if (o.recurso !== "tutor_texto" && o.recurso !== "tutor_janela") return { ok: true, modo: "legado", requestId, ...nada };
  const r = await db.service<{ ok: boolean; reason?: string; reservation?: number; entitlement?: any }>("ch_worker_tutor_text_reserve", {
    p_user: o.user, p_session_id: o.sessionId ?? null,
  });
  if (!r?.ok) return { ok: false, modo: "legado", reason: r?.reason, entitlement: r?.entitlement, requestId, ...nada };
  return {
    ok: true, modo: "legado", requestId, reservation: r.reservation ?? null,
    confirmar: async () => null,
    devolver: async () => {
      await db.service("ch_worker_tutor_text_release", { p_user: o.user, p_reservation: r.reservation }).catch(() => undefined);
    },
  };
}
