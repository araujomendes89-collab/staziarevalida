/**
 * Apagar do depósito os arquivos das aulas que a equipe removeu (A07, decisão do dono de 11/10/2026).
 *
 * O banco (migração 9710) guarda na fila o caminho de todo arquivo cujo material saiu e só entrega para apagar o que ninguém mais usa
 * (outro material, fonte de podcast, retenção de arquivo). Aqui o servidor apaga cada arquivo no depósito e só então confirma ao
 * banco, que tira o caminho da fila e registra a ação no Registro da Administração. NUNCA lança erro: falha ao apagar não desfaz a
 * remoção do material; o caminho continua na fila e volta na próxima limpeza.
 */
import type { ContentDb, Identity, Storage } from "../contentHub/infra";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export interface SweepResult {
  deleted: string[];
  failed: string[];
}

export async function sweepLessonFiles(db: Pick<ContentDb, "asUser">, user: Identity, storage: Pick<Storage, "remove"> | undefined, log?: (m: string) => void): Promise<SweepResult> {
  const out: SweepResult = { deleted: [], failed: [] };
  if (!storage?.remove) return out;
  let paths: string[] = [];
  try {
    const r = await db.asUser<{ paths?: string[] }>(user, "app_admin_lesson_files_purge");
    paths = Array.isArray(r?.paths) ? r.paths.filter((p): p is string => typeof p === "string" && p.length > 0) : [];
  } catch (error) {
    log?.(`aulas: não consegui listar os arquivos a apagar: ${message(error)}`);
    return out;
  }
  for (const path of paths) {
    try {
      await storage.remove([path]);
      out.deleted.push(path);
    } catch (error) {
      out.failed.push(path);
      log?.(`aulas: não consegui apagar o arquivo ${path} do depósito (a remoção do material vale; ele fica na fila): ${message(error)}`);
    }
  }
  if (out.deleted.length) {
    try {
      await db.asUser<number>(user, "app_admin_lesson_files_done", { p_paths: out.deleted });
    } catch (error) {
      log?.(`aulas: apaguei ${out.deleted.length} arquivo(s) mas não consegui confirmar no banco (o Registro ficou sem a anotação): ${message(error)}`);
    }
  }
  return out;
}
