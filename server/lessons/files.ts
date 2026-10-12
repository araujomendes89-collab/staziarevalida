/**
 * Apagar do depósito os arquivos das aulas que a equipe removeu (A07, decisão do dono de 11/10/2026).
 *
 * O banco (migração 9710) guarda na fila o caminho de todo arquivo cujo material saiu. O servidor, como SERVIÇO (ch_worker_*; a
 * equipe não chama estas funções direto), faz assim:
 *   1. RESERVA: o banco confere que ninguém mais usa o caminho, o marca "apagando" e devolve, para cada caminho, o CÓDIGO da
 *      reserva (lotes de 50). Enquanto reservado, ninguém consegue criar material, fonte de podcast ou retenção para esse caminho
 *      (fecha a corrida entre "conferir se está em uso" e "apagar");
 *   2. RENOVA, ANTES DE CADA exclusão: o banco confere de novo (uso, código, prazo) e estende o prazo. Se a resposta não for
 *      "sim" (reserva vencida, refeita por outra limpeza, arquivo voltou a ser usado, banco fora do ar), o arquivo é PULADO e
 *      não é apagado;
 *   3. APAGA no depósito, um por um;
 *   4. CONFIRMA ao banco (caminho + código) o que foi apagado (tira da fila e escreve no Registro da Administração). Só vale para a
 *      reserva vigente. Se a confirmação falhar, tenta de novo; se ainda assim falhar, a reserva vence sozinha em 10 minutos e a
 *      próxima limpeza refaz (apagar é idempotente) e registra;
 *   5. DEVOLVE (caminho + código) a reserva do que o depósito não conseguiu apagar (volta para a fila).
 * Repete em lotes (até MAX_ROUNDS) para alcançar a fila inteira. NUNCA lança erro: falha ao apagar não desfaz a remoção do
 * material. Quem chama é responsável por já ter conferido que quem pediu é da equipe.
 */
import type { ContentDb, Identity, Storage } from "../contentHub/infra";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const MAX_ROUNDS = 40; // lotes de 50 no banco: até 2000 arquivos por limpeza
const MISSING_SQL = /could not find the function|does not exist|schema cache|PGRST202|42883/i;

export interface SweepResult {
  deleted: string[];
  /** o depósito não conseguiu apagar (a reserva é devolvida) */
  failed: string[];
  /** não apagados de propósito: a reserva venceu, foi refeita por outra limpeza, o arquivo voltou a ser usado ou o banco não respondeu */
  skipped: string[];
}

interface Reserva {
  path: string;
  token: string;
}

export async function sweepLessonFiles(db: Pick<ContentDb, "service">, user: Identity, storage: Pick<Storage, "remove"> | undefined, log?: (m: string) => void): Promise<SweepResult> {
  const out: SweepResult = { deleted: [], failed: [], skipped: [] };
  const devolver: Reserva[] = [];
  if (!storage?.remove) return out;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let items: Reserva[] = [];
    try {
      const r = await db.service<{ items?: Array<{ path?: unknown; token?: unknown }> }>("ch_worker_lesson_files_reserve", { p_actor: user.id });
      items = (Array.isArray(r?.items) ? r.items : []).flatMap((i) => (typeof i?.path === "string" && i.path.length > 0 && typeof i?.token === "string" && i.token.length > 0 ? [{ path: i.path, token: i.token }] : []));
    } catch (error) {
      log?.(
        MISSING_SQL.test(message(error))
          ? `aulas: o SQL da limpeza de arquivos (9710) ainda não foi aplicado no banco; nada foi apagado do depósito (como antes): ${message(error)}`
          : `aulas: não consegui reservar os arquivos a apagar: ${message(error)}`,
      );
      break;
    }
    if (!items.length) break;
    const done: Reserva[] = [];
    for (const item of items) {
      // antes de CADA exclusão: o banco confere e renova a reserva; sem o "sim" dele, o arquivo não é apagado
      let renovada = false;
      try {
        renovada = (await db.service<boolean>("ch_worker_lesson_files_renew", { p_path: item.path, p_token: item.token })) === true;
      } catch (error) {
        out.skipped.push(item.path);
        devolver.push(item);
        log?.(`aulas: não consegui renovar a reserva do arquivo ${item.path}; ele não foi apagado e volta para a fila: ${message(error)}`);
        continue;
      }
      if (!renovada) {
        out.skipped.push(item.path);
        log?.(`aulas: a reserva do arquivo ${item.path} não vale mais (venceu, outra limpeza a refez ou o arquivo voltou a ser usado); ele não foi apagado.`);
        continue;
      }
      try {
        await storage.remove([item.path]);
        done.push(item);
      } catch (error) {
        out.failed.push(item.path);
        devolver.push(item);
        log?.(`aulas: não consegui apagar o arquivo ${item.path} do depósito (a remoção do material vale; ele volta para a fila): ${message(error)}`);
      }
    }
    if (done.length) {
      out.deleted.push(...done.map((i) => i.path));
      let confirmed = false;
      for (let attempt = 1; attempt <= 2 && !confirmed; attempt++) {
        try {
          await db.service<number>("ch_worker_lesson_files_done", { p_items: done, p_actor: user.id });
          confirmed = true;
        } catch (error) {
          if (attempt === 2) log?.(`aulas: apaguei ${done.length} arquivo(s) mas não consegui confirmar no banco; a reserva vence em 10 minutos e a próxima limpeza registra: ${message(error)}`);
        }
      }
    }
  }
  if (devolver.length) {
    try {
      await db.service<number>("ch_worker_lesson_files_release", { p_items: devolver });
    } catch (error) {
      log?.(`aulas: não consegui devolver a reserva de ${devolver.length} arquivo(s) (volta sozinha em 10 minutos): ${message(error)}`);
    }
  }
  return out;
}
