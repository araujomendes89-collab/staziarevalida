/**
 * Leitura dos bytes das figuras de uma versão de aula para geração do PDF.
 */
import type { ContentDb, Storage } from "../infra";
import { ID_IMAGEM, TIPOS_GUARDADOS } from "../../../src/shared/docImagens";
import { ErroImagem } from "./servico";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 15 * 1024 * 1024;
const TIPOS_PDF = ["image/png", "image/jpeg", "image/webp"] as const;

/**
 * Lê os bytes de uma figura referenciada no conteúdo de uma versão de aula para o PDF.
 */
export async function lerBytesFiguraVersao(
  deps: { db: ContentDb; storage: Storage },
  versionId: string,
  id: string
): Promise<{ data: Buffer; mime: string }> {
  if (!id || !ID_IMAGEM.test(id) || !versionId || !RE_UUID.test(versionId)) {
    throw new ErroImagem(400, "Imagem inválida.");
  }

  const res = await deps.db.service<{ caminho: string; tipo: string }>("ch_worker_doc_imagem_versao", {
    p_version_id: versionId,
    p_id: id,
  });

  if (
    !res?.caminho ||
    !/^[0-9a-f]{2}\/[0-9a-f]{64}\.(png|jpg|webp|gif)$/.test(res.caminho) ||
    !(TIPOS_GUARDADOS as readonly string[]).includes(res.tipo) ||
    !(TIPOS_PDF as readonly string[]).includes(res.tipo as any)
  ) {
    throw new ErroImagem(404, "Imagem indisponível.");
  }

  const data = await deps.storage.get(res.caminho);
  if (data.length > MAX_BYTES) {
    throw new ErroImagem(413, "Imagem acima de 15 MB.");
  }

  return { data, mime: res.tipo };
}

/**
 * Cria a função de carregamento das figuras vinculadas a uma versão específica para o renderizador de PDF.
 */
export function carregadorDeFiguras(
  deps: { db: ContentDb; storage: Storage },
  versionId: string
): (id: string) => Promise<{ data: Buffer; mime: string }> {
  return (id: string) => lerBytesFiguraVersao(deps, versionId, id);
}
