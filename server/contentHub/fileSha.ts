/**
 * SHA-256 do arquivo enviado (aula ou podcast), FECHANDO POR SEGURANÇA.
 *
 * O SHA-256 reconhece a apostila (fonte complementar) mesmo com nome de arquivo neutro. Para que um erro ao gravá-lo nunca deixe
 * um arquivo liberável ao aluno:
 *   1. ANTES de registrar o arquivo, o servidor pede a retenção do caminho (ch_worker_file_hold). Se isso falhar, o envio é
 *      recusado e nada é registrado.
 *   2. Registrado o arquivo, o servidor calcula e grava o SHA-256 (ch_worker_file_sha, que solta a retenção). Uma falha é refeita
 *      UMA vez. Se continuar falhando, a retenção fica: o arquivo continua ESCONDIDO do aluno e a equipe recebe o aviso em português.
 */
import crypto from "crypto";
import type { ContentDb } from "./infra";

export const SHA_WARNING =
  "Não foi possível conferir a impressão digital do arquivo; confira antes de liberar. Por segurança, o arquivo ficou escondido do aluno até essa conferência.";
export const HOLD_ERROR = "Não foi possível registrar o arquivo com segurança agora. Tente enviar de novo em instantes.";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Pede a retenção do caminho. Lança erro em português se não conseguir (nada foi registrado ainda). */
export async function holdFile(db: Pick<ContentDb, "service">, key: string, log?: (m: string) => void, where = "arquivo"): Promise<void> {
  try {
    await db.service("ch_worker_file_hold", { p_path: key });
  } catch (error) {
    log?.(`[${where}] retenção do arquivo não pedida (envio recusado): ${message(error)}`);
    throw Object.assign(new Error(HOLD_ERROR), { status: 500 });
  }
}

/**
 * Calcula e grava o SHA-256 (com 1 nova tentativa). Devolve true se gravou; false se não conseguiu (a retenção continua, o arquivo
 * segue escondido do aluno). `load` entrega os bytes: é chamado de novo na nova tentativa se a leitura falhar.
 */
export async function recordFileSha(db: Pick<ContentDb, "service">, key: string, load: () => Promise<Buffer>, log?: (m: string) => void, where = "arquivo"): Promise<boolean> {
  let last: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const sha = crypto.createHash("sha256").update(await load()).digest("hex");
      const n = await db.service<number>("ch_worker_file_sha", { p_path: key, p_sha: sha });
      if (typeof n === "number" && n < 1) throw new Error("nenhum registro encontrado para este caminho");
      return true;
    } catch (error) {
      last = error;
    }
  }
  log?.(`[${where}] SHA-256 do arquivo não gravado (o arquivo ficou escondido do aluno): ${message(last)}`);
  return false;
}

/**
 * Solta a retenção quando o REGISTRO do arquivo foi recusado (nenhuma linha criada). O banco nunca solta a retenção de um arquivo que já
 * tem material ou fonte registrados. Erro aqui só vai para o log: a retenção que sobrar só esconde um caminho que não existe.
 */
export async function releaseFile(db: Pick<ContentDb, "service">, key: string, log?: (m: string) => void, where = "arquivo"): Promise<void> {
  try {
    await db.service("ch_worker_file_release", { p_path: key });
  } catch (error) {
    log?.(`[${where}] retenção do arquivo recusado não foi solta (sem efeito para o aluno): ${message(error)}`);
  }
}
