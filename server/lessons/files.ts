/**
 * Apagar do depósito os arquivos das aulas que a equipe removeu (A07, decisão do dono de 11/10/2026).
 *
 * O banco (migração 9710) guarda na fila o caminho de todo arquivo cujo material saiu. O servidor, como SERVIÇO (ch_worker_*; a
 * equipe não chama estas funções direto), faz assim:
 *   1. RESERVA: o banco confere que ninguém mais usa o caminho e o marca "apagando"; só o reservado é devolvido. Enquanto
 *      reservado, ninguém consegue criar material, fonte de podcast ou retenção para esse caminho (fecha a corrida entre "conferir
 *      se está em uso" e "apagar");
 *   2. APAGA no depósito, um por um;
 *   3. CONFIRMA ao banco o que foi apagado (tira da fila e escreve no Registro da Administração). Se a confirmação falhar, tenta
 *      de novo; se ainda assim falhar, a reserva vence sozinha em 10 minutos e a próxima limpeza refaz (apagar é idempotente) e
 *      registra;
 *   4. DEVOLVE a reserva do que o depósito não conseguiu apagar (volta para a fila).
 * Repete em lotes (até MAX_ROUNDS) para alcançar a fila inteira. NUNCA lança erro: falha ao apagar não desfaz a remoção do
 * material. Quem chama é responsável por já ter conferido que quem pediu é da equipe.
 */
import type { ContentDb, Identity, Storage } from "../contentHub/infra";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const MAX_ROUNDS = 10;
const MISSING_SQL = /could not find the function|does not exist|schema cache|PGRST202|42883/i;

export interface SweepResult {
  deleted: string[];
  failed: string[];
}

export async function sweepLessonFiles(db: Pick<ContentDb, "service">, user: Identity, storage: Pick<Storage, "remove"> | undefined, log?: (m: string) => void): Promise<SweepResult> {
  const out: SweepResult = { deleted: [], failed: [] };
  if (!storage?.remove) return out;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let paths: string[] = [];
    try {
      const r = await db.service<{ paths?: string[] }>("ch_worker_lesson_files_reserve", { p_actor: user.id });
      paths = Array.isArray(r?.paths) ? r.paths.filter((p): p is string => typeof p === "string" && p.length > 0) : [];
    } catch (error) {
      log?.(
        MISSING_SQL.test(message(error))
          ? `aulas: o SQL da limpeza de arquivos (9710) ainda não foi aplicado no banco; nada foi apagado do depósito (como antes): ${message(error)}`
          : `aulas: não consegui reservar os arquivos a apagar: ${message(error)}`,
      );
      break;
    }
    if (!paths.length) break;
    const done: string[] = [];
    for (const path of paths) {
      try {
        await storage.remove([path]);
        done.push(path);
      } catch (error) {
        out.failed.push(path);
        log?.(`aulas: não consegui apagar o arquivo ${path} do depósito (a remoção do material vale; ele volta para a fila): ${message(error)}`);
      }
    }
    if (done.length) {
      out.deleted.push(...done);
      let confirmed = false;
      for (let attempt = 1; attempt <= 2 && !confirmed; attempt++) {
        try {
          await db.service<number>("ch_worker_lesson_files_done", { p_paths: done, p_actor: user.id });
          confirmed = true;
        } catch (error) {
          if (attempt === 2) log?.(`aulas: apaguei ${done.length} arquivo(s) mas não consegui confirmar no banco; a reserva vence em 10 minutos e a próxima limpeza registra: ${message(error)}`);
        }
      }
    }
  }
  if (out.failed.length) {
    try {
      await db.service<number>("ch_worker_lesson_files_release", { p_paths: out.failed });
    } catch (error) {
      log?.(`aulas: não consegui devolver a reserva de ${out.failed.length} arquivo(s) (volta sozinha em 10 minutos): ${message(error)}`);
    }
  }
  return out;
}
