/**
 * Serviço de preparação, validação e persistência de imagens da Central de Conteúdo.
 */
import crypto from "crypto";
import type { ContentDb, Identity, Storage } from "../infra";
import {
  ALT_MAXIMO,
  ID_IMAGEM,
  LADO_MAXIMO,
  LADO_MAXIMO_ENTRADA,
  LADO_MINIMO,
  MAX_GUARDADO_BYTES,
  MAX_SVG_BYTES,
  PIXELS_MAXIMO_ENTRADA,
  TIPOS_GUARDADOS,
  type DocImagem,
} from "../../../src/shared/docImagens";
import { chaveDoArquivo, detectarImagem, removerMetadados } from "./formato";
import type { ProcessadorImagem } from "./processador";

export class ErroImagem extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ErroImagem";
  }
}

export interface ImagemPreparada {
  data: Buffer;
  mime: string;
  ext: "png" | "jpg" | "webp" | "gif";
  width: number;
  height: number;
  processing: Record<string, unknown>;
  original_mime: string;
  original_bytes: number;
}

/**
 * Valida, redimensiona e limpa metadados da imagem antes de guardá-la.
 */
export async function prepararImagem(
  buf: Buffer,
  opts: { processador: ProcessadorImagem | null }
): Promise<ImagemPreparada> {
  // 1. Validação básica de presença e formato
  if (!Buffer.isBuffer(buf) || !buf.length) {
    throw new ErroImagem(400, "Envie a imagem.");
  }
  const info = detectarImagem(buf);
  if (!info) {
    throw new ErroImagem(415, "Tipo de arquivo não aceito: envie PNG, JPEG, WebP, GIF ou SVG.");
  }

  // 2. Limites máximos e mínimos de dimensão da entrada
  const ladoMaiorEntrada = Math.max(info.width, info.height);
  const ladoMenorEntrada = Math.min(info.width, info.height);
  const pixelsEntrada = info.width * info.height;

  // SVG é vetor: o tamanho declarado só define a proporção (a conversão já sai com no máximo LADO_MAXIMO)
  if (info.ext !== "svg" && (ladoMaiorEntrada > LADO_MAXIMO_ENTRADA || pixelsEntrada > PIXELS_MAXIMO_ENTRADA)) {
    throw new ErroImagem(400, `Imagem grande demais (${info.width}×${info.height} px).`);
  }
  if (ladoMenorEntrada < LADO_MINIMO) {
    throw new ErroImagem(400, `Imagem com ${info.width}×${info.height} px: o mínimo é ${LADO_MINIMO} px de cada lado.`);
  }

  let currBuf = buf;
  let currMime = info.mime;
  let currWidth = info.width;
  let currHeight = info.height;
  const processing: Record<string, unknown> = {};

  // 3. SVG: conversão obrigatória em PNG
  if (info.ext === "svg") {
    if (buf.length > MAX_SVG_BYTES) {
      throw new ErroImagem(413, "SVG acima de 1 MB.");
    }
    if (!opts.processador) {
      throw new ErroImagem(
        415,
        "Este servidor não converte SVG: o editor converte em PNG antes de enviar. Tente de novo pelo editor."
      );
    }
    const res = await opts.processador.svgParaPng(buf, info, LADO_MAXIMO);
    processing.convertida = "svg->png";
    currBuf = res.data;
    currMime = "image/png";
    currWidth = res.width;
    currHeight = res.height;
  } else if (info.ext === "gif") {
    // 4. GIF: nunca é recompactado para preservar a animação
    if (ladoMaiorEntrada > LADO_MAXIMO) {
      throw new ErroImagem(400, `GIF com ${info.width}×${info.height} px: o máximo é ${LADO_MAXIMO} px no lado maior.`);
    }
  } else {
    // 5. PNG/JPEG/WebP: redimensionamento se ultrapassar o lado máximo
    if (ladoMaiorEntrada > LADO_MAXIMO) {
      if (opts.processador) {
        const res = await opts.processador.reduzir(
          currBuf,
          { mime: currMime, width: currWidth, height: currHeight },
          LADO_MAXIMO
        );
        processing.redimensionada = true;
        processing.largura_original = currWidth;
        processing.altura_original = currHeight;
        currBuf = res.data;
        currMime = res.mime;
        currWidth = res.width;
        currHeight = res.height;
      } else {
        throw new ErroImagem(
          400,
          `Imagem com ${currWidth}×${currHeight} px: o máximo é ${LADO_MAXIMO} px no lado maior. O editor reduz antes de enviar; tente de novo pelo editor.`
        );
      }
    }
  }

  // 6. Remoção de metadados e validação estrita final
  const semMeta = removerMetadados(currBuf, currMime);
  if (!semMeta.equals(currBuf)) {
    processing.metadados_removidos = true;
    currBuf = semMeta;
  }

  const finalInfo = detectarImagem(currBuf);
  if (!finalInfo || !(TIPOS_GUARDADOS as readonly string[]).includes(finalInfo.mime)) {
    throw new ErroImagem(400, "Arquivo final inválido.");
  }

  if (
    finalInfo.width < LADO_MINIMO ||
    finalInfo.height < LADO_MINIMO ||
    finalInfo.width > LADO_MAXIMO ||
    finalInfo.height > LADO_MAXIMO
  ) {
    throw new ErroImagem(400, `Imagem fora das dimensões permitidas (${finalInfo.width}×${finalInfo.height} px).`);
  }

  if (currBuf.length > MAX_GUARDADO_BYTES) {
    throw new ErroImagem(413, "Imagem acima do limite de 5 MB.");
  }

  return {
    data: currBuf,
    mime: finalInfo.mime,
    ext: finalInfo.ext as "png" | "jpg" | "webp" | "gif",
    width: finalInfo.width,
    height: finalInfo.height,
    processing,
    original_mime: info.mime,
    original_bytes: buf.length,
  };
}

/**
 * Guarda a imagem no depósito e registra seu registro e evento no banco de dados.
 */
export async function guardarImagem(
  deps: { db: ContentDb; storage: Storage },
  user: Identity,
  buf: Buffer,
  meta: {
    nome?: string | null;
    alt?: string | null;
    unidade?: string | null;
    aula?: string | null;
    substitui?: string | null;
  },
  processador: ProcessadorImagem | null
): Promise<DocImagem> {
  if (meta.unidade && !ID_IMAGEM.test(meta.unidade)) {
    throw new ErroImagem(400, "Unidade inválida.");
  }
  if (meta.aula && !ID_IMAGEM.test(meta.aula)) {
    throw new ErroImagem(400, "Aula inválida.");
  }
  if (meta.substitui && !ID_IMAGEM.test(meta.substitui)) {
    throw new ErroImagem(400, "Imagem a substituir inválida.");
  }

  const prep = await prepararImagem(buf, { processador });
  const sha256 = crypto.createHash("sha256").update(prep.data).digest("hex");
  const chave = chaveDoArquivo(sha256, prep.ext);

  if (!(await deps.storage.exists(chave))) {
    await deps.storage.put(chave, prep.data, prep.mime);
  }

  const p_asset = {
    unit_id: meta.unidade || null,
    lesson_id: meta.aula || null,
    substitui: meta.substitui || null,
    storage_path: chave,
    sha256,
    mime: prep.mime,
    width: prep.width,
    height: prep.height,
    bytes: prep.data.length,
    alt_text: meta.alt ? meta.alt.trim().slice(0, ALT_MAXIMO) : "",
    original_name: meta.nome ? meta.nome.slice(0, 200) : null,
    original_mime: prep.original_mime,
    original_bytes: prep.original_bytes,
    processing: prep.processing,
  };

  return await deps.db.service<DocImagem>("ch_worker_doc_imagem_registrar", {
    p_actor: user.id,
    p_asset,
  });
}

/**
 * Lê os bytes de uma imagem para entrega pelo servidor (equipe na prévia/editor ou aluno na aula publicada).
 */
export async function lerBytesImagem(
  deps: { db: ContentDb; storage: Storage },
  quem: { equipe: Identity } | { aluno: true },
  id: string
): Promise<{ data: Buffer; mime: string }> {
  if (!id || !ID_IMAGEM.test(id)) {
    throw new ErroImagem(400, "Imagem inválida.");
  }

  let res: { caminho: string; tipo: string };
  if ("equipe" in quem) {
    res = await deps.db.service<{ caminho: string; tipo: string }>("ch_worker_doc_imagem_arquivo", {
      p_actor: quem.equipe.id,
      p_id: id,
    });
  } else {
    res = await deps.db.service<{ caminho: string; tipo: string }>("ch_worker_doc_imagem_aluno", {
      p_id: id,
    });
  }

  if (
    !res?.caminho ||
    !/^[0-9a-f]{2}\/[0-9a-f]{64}\.(png|jpg|webp|gif)$/.test(res.caminho) ||
    !(TIPOS_GUARDADOS as readonly string[]).includes(res.tipo)
  ) {
    throw new ErroImagem(404, "Imagem indisponível.");
  }

  const data = await deps.storage.get(res.caminho);
  return { data, mime: res.tipo };
}
