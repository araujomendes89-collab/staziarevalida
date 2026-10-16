/**
 * Detecção de formato, remoção de metadados e geração de chave de armazenamento
 * para o módulo de guarda de imagens da Central de Conteúdo.
 * Módulo puro: sem chamadas de rede e sem dependência do Chromium.
 */

export interface ImagemInfo {
  mime: string;
  ext: "png" | "jpg" | "webp" | "gif" | "svg";
  width: number;
  height: number;
  orientacao?: number;
  animada?: boolean;
}

/**
 * Lê a orientação EXIF de um segmento APP1 JPEG a partir da posição do comprimento do segmento.
 * lenPos aponta para o primeiro byte do UInt16BE de comprimento (após o marcador 0xFF 0xE1).
 */
function extrairOrientacaoExif(buf: Buffer, lenPos: number, len: number): number | undefined {
  // Bytes: [lenPos, lenPos+1] = len, [lenPos+2 .. lenPos+7] = "Exif\0\0", [lenPos+8 ..] = TIFF
  if (lenPos + 8 > buf.length) return undefined;
  const exifHeader = buf.subarray(lenPos + 2, lenPos + 8).toString("latin1");
  if (exifHeader !== "Exif\0\0") return undefined;

  const tiffStart = lenPos + 8;
  if (tiffStart + 8 > lenPos + len || tiffStart + 8 > buf.length) return undefined;

  const endian = buf.subarray(tiffStart, tiffStart + 2).toString("latin1");
  const isLE = endian === "II";
  const isBE = endian === "MM";
  if (!isLE && !isBE) return undefined;

  const magic = isLE ? buf.readUInt16LE(tiffStart + 2) : buf.readUInt16BE(tiffStart + 2);
  if (magic !== 42) return undefined;

  const ifd0Offset = isLE ? buf.readUInt32LE(tiffStart + 4) : buf.readUInt32BE(tiffStart + 4);
  const ifdPos = tiffStart + ifd0Offset;
  if (ifdPos + 2 > buf.length) return undefined;

  const entries = isLE ? buf.readUInt16LE(ifdPos) : buf.readUInt16BE(ifdPos);
  let entryPos = ifdPos + 2;

  for (let e = 0; e < entries; e++) {
    if (entryPos + 12 > buf.length) break;
    const tag = isLE ? buf.readUInt16LE(entryPos) : buf.readUInt16BE(entryPos);
    if (tag === 0x0112) {
      const val = isLE ? buf.readUInt16LE(entryPos + 8) : buf.readUInt16BE(entryPos + 8);
      if (val >= 1 && val <= 8) return val;
      break;
    }
    entryPos += 12;
  }
  return undefined;
}

/**
 * Identifica o tipo e as dimensões da imagem pela assinatura do arquivo.
 */
export function detectarImagem(buf: Buffer): ImagemInfo | null {
  try {
    return detectar(buf);
  } catch {
    // arquivo truncado ou malformado: não é imagem aceita
    return null;
  }
}

function detectar(buf: Buffer): ImagemInfo | null {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length > 24 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
    buf.subarray(12, 16).toString("latin1") === "IHDR"
  ) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    let animada = false;
    let pos = 8;
    while (pos + 8 <= buf.length) {
      const chunkLen = buf.readUInt32BE(pos);
      const chunkType = buf.subarray(pos + 4, pos + 8).toString("latin1");
      if (chunkType === "acTL") {
        animada = true;
        break;
      }
      pos += 12 + chunkLen;
    }
    return { mime: "image/png", ext: "png", width, height, animada: animada || undefined };
  }

  // 2. JPEG: FF D8 FF
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let i = 2;
    let orientacao: number | undefined;
    let dims: { width: number; height: number } | null = null;

    while (i + 4 <= buf.length) {
      if (buf[i] !== 0xff) break;
      while (i < buf.length && buf[i] === 0xff) i++;
      if (i >= buf.length) break;

      const marker = buf[i];
      i++;

      // Marcadores sem tamanho de segmento
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue;
      }
      if (i + 2 > buf.length) break;
      const len = buf.readUInt16BE(i);

      if (marker === 0xe1 && !orientacao) {
        orientacao = extrairOrientacaoExif(buf, i, len);
      }

      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (i + 7 <= buf.length) {
          dims = {
            height: buf.readUInt16BE(i + 3),
            width: buf.readUInt16BE(i + 5),
          };
        }
      }

      if (marker === 0xda) {
        // Start of Scan: cabeçalhos terminaram
        break;
      }

      i += len;
    }

    if (dims) {
      let width = dims.width;
      let height = dims.height;
      // Orientação 5..8: troca largura e altura para representar o tamanho real exibido
      if (orientacao && orientacao >= 5 && orientacao <= 8) {
        const tmp = width;
        width = height;
        height = tmp;
      }
      return { mime: "image/jpeg", ext: "jpg", width, height, orientacao };
    }
    return null;
  }

  // 3. WebP: RIFF ... WEBP
  if (buf.length > 30 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    const chunk = buf.subarray(12, 16).toString("latin1");
    if (chunk === "VP8 ") {
      return {
        mime: "image/webp",
        ext: "webp",
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return {
        mime: "image/webp",
        ext: "webp",
        width: (b & 0x3fff) + 1,
        height: ((b >> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === "VP8X") {
      const flags = buf[20];
      const animada = Boolean(flags & 0x02);
      return {
        mime: "image/webp",
        ext: "webp",
        width: 1 + buf.readUIntLE(24, 3),
        height: 1 + buf.readUIntLE(27, 3),
        animada: animada || undefined,
      };
    }
    return null;
  }

  // 4. GIF: GIF87a ou GIF89a
  if (buf.length >= 13) {
    const sig = buf.subarray(0, 6).toString("latin1");
    if (sig === "GIF87a" || sig === "GIF89a") {
      const width = buf.readUInt16LE(6);
      const height = buf.readUInt16LE(8);
      const packed = buf[10];
      const gctFlag = (packed & 0x80) !== 0;
      const gctSize = gctFlag ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
      let pos = 13 + gctSize;
      let imageCount = 0;

      while (pos < buf.length) {
        const blockType = buf[pos];
        if (blockType === 0x3b) break; // Trailer
        if (blockType === 0x2c) {
          imageCount++;
          if (imageCount > 1) break;
          if (pos + 10 > buf.length) break;
          const lctFlag = (buf[pos + 9] & 0x80) !== 0;
          const lctSize = lctFlag ? 3 * (1 << ((buf[pos + 9] & 0x07) + 1)) : 0;
          pos += 10 + lctSize;
          if (pos >= buf.length) break;
          pos += 1; // LZW min code size
          while (pos < buf.length) {
            const subLen = buf[pos++];
            if (subLen === 0) break;
            pos += subLen;
          }
        } else if (blockType === 0x21) {
          pos += 2; // 0x21 + label
          while (pos < buf.length) {
            const subLen = buf[pos++];
            if (subLen === 0) break;
            pos += subLen;
          }
        } else {
          break;
        }
      }
      return {
        mime: "image/gif",
        ext: "gif",
        width,
        height,
        animada: imageCount > 1 || undefined,
      };
    }
  }

  // 5. SVG: Texto UTF-8 com raiz <svg
  try {
    let str = buf.toString("utf8");
    if (str.charCodeAt(0) === 0xfeff) {
      str = str.slice(1);
    }
    // Remove cabeçalhos XML, comentários, DOCTYPE e espaços iniciais
    while (true) {
      const prev = str;
      str = str.trimStart();
      if (str.startsWith("<?xml")) {
        const end = str.indexOf("?>");
        if (end !== -1) str = str.slice(end + 2);
      } else if (str.startsWith("<!--")) {
        const end = str.indexOf("-->");
        if (end !== -1) str = str.slice(end + 3);
      } else if (/^<!doctype\b/i.test(str)) {
        // Encontra o fim do DOCTYPE (considerando possível bloco [ ... ])
        let depth = 0;
        let found = -1;
        for (let j = 0; j < str.length; j++) {
          if (str[j] === "[") depth++;
          else if (str[j] === "]") depth--;
          else if (str[j] === ">" && depth === 0) {
            found = j;
            break;
          }
        }
        if (found !== -1) str = str.slice(found + 1);
      }
      if (str === prev) break;
    }

    if (/^<svg[\s>]/i.test(str)) {
      const svgTagMatch = str.match(/<svg\b([^>]*)>/i);
      const attrs = svgTagMatch ? svgTagMatch[1] : "";
      const wMatch = attrs.match(/\bwidth=["']\s*([0-9]+(?:\.[0-9]+)?)(?:px)?\s*["']/i);
      const hMatch = attrs.match(/\bheight=["']\s*([0-9]+(?:\.[0-9]+)?)(?:px)?\s*["']/i);

      let width = wMatch ? Math.round(parseFloat(wMatch[1])) : 0;
      let height = hMatch ? Math.round(parseFloat(hMatch[1])) : 0;

      if (!width || !height) {
        const vbMatch = attrs.match(/\bviewBox=["']\s*([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)\s*["']/i);
        if (vbMatch) {
          const vbW = Math.round(parseFloat(vbMatch[3]));
          const vbH = Math.round(parseFloat(vbMatch[4]));
          if (!width && vbW > 0) width = vbW;
          if (!height && vbH > 0) height = vbH;
        }
      }

      if (!width || width <= 0) width = 1024;
      if (!height || height <= 0) height = 1024;

      return { mime: "image/svg+xml", ext: "svg", width, height };
    }
  } catch {
    // falha na decodificação de texto: não é SVG
  }

  return null;
}

/**
 * Cria um segmento APP1 EXIF mínimo com apenas a orientação especificada.
 */
function criarApp1Orientacao(orientacao: number): Buffer {
  const b = Buffer.alloc(36);
  b[0] = 0xff;
  b[1] = 0xe1;
  b.writeUInt16BE(34, 2); // tamanho do segmento (inclui os 2 bytes de tamanho)
  b.write("Exif\0\0", 4, "latin1");
  b.write("MM", 10, "latin1"); // Big Endian
  b.writeUInt16BE(42, 12);
  b.writeUInt32BE(8, 14); // deslocamento para IFD0
  b.writeUInt16BE(1, 18); // 1 entrada
  b.writeUInt16BE(0x0112, 20); // tag Orientation
  b.writeUInt16BE(3, 22); // type SHORT
  b.writeUInt32BE(1, 24); // contagem 1
  b.writeUInt16BE(orientacao, 28); // valor da orientação
  b.writeUInt16BE(0, 30); // preenchimento de 2 bytes
  b.writeUInt32BE(0, 32); // próximo IFD = 0
  return b;
}

/**
 * Remove metadados sem alterar os pixels.
 * Em caso de falha na análise, devolve o buffer original intacto.
 */
export function removerMetadados(buf: Buffer, mime: string): Buffer {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 4) return buf;

    // 1. PNG: Mantém apenas chunks essenciais e de cor/renderização
    if (mime === "image/png" && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      const permitidos = new Set([
        "IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA",
        "cHRM", "sRGB", "iCCP", "pHYs", "acTL", "fcTL", "fdAT",
      ]);
      const chunks: Buffer[] = [buf.subarray(0, 8)];
      let pos = 8;
      let removeu = false;

      while (pos + 8 <= buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.subarray(pos + 4, pos + 8).toString("latin1");
        const totalLen = 12 + len;
        if (pos + totalLen > buf.length) return buf; // PNG malformado

        if (permitidos.has(type)) {
          chunks.push(buf.subarray(pos, pos + totalLen));
        } else {
          removeu = true;
        }
        pos += totalLen;
      }
      return removeu ? Buffer.concat(chunks) : buf;
    }

    // 2. JPEG: Tira APP1..APP15 e COM; mantém APP0, APP2 (ICC), APP14 (Adobe) e recria APP1 mínimo se orientação != 1
    if (mime === "image/jpeg" && buf[0] === 0xff && buf[1] === 0xd8) {
      let orientacao: number | undefined;
      // Procura orientação original antes de montar a nova estrutura
      let scan = 2;
      while (scan + 4 <= buf.length) {
        if (buf[scan] !== 0xff) break;
        while (scan < buf.length && buf[scan] === 0xff) scan++;
        if (scan >= buf.length) break;
        const marker = buf[scan++];
        if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (scan + 2 > buf.length) break;
        const len = buf.readUInt16BE(scan);
        if (marker === 0xe1 && !orientacao) {
          orientacao = extrairOrientacaoExif(buf, scan, len);
        }
        if (marker === 0xda) break;
        scan += len;
      }

      const chunks: Buffer[] = [buf.subarray(0, 2)]; // SOI
      let i = 2;
      let app1Inserido = false;

      while (i + 4 <= buf.length) {
        if (buf[i] !== 0xff) {
          // Erro de estrutura: retorna original
          return buf;
        }
        const markerStart = i;
        while (i < buf.length && buf[i] === 0xff) i++;
        if (i >= buf.length) break;

        const marker = buf[i++];
        if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          chunks.push(buf.subarray(markerStart, i));
          continue;
        }
        if (i + 2 > buf.length) return buf;
        const len = buf.readUInt16BE(i);
        const segBuf = buf.subarray(markerStart, i + len);

        if (marker === 0xda) {
          // SOS: copia o restante inteiro da imagem
          if (!app1Inserido && orientacao && orientacao !== 1) {
            chunks.push(criarApp1Orientacao(orientacao));
            app1Inserido = true;
          }
          chunks.push(buf.subarray(markerStart));
          break;
        }

        if (marker === 0xe0) {
          // APP0 (JFIF): mantém
          chunks.push(segBuf);
          if (!app1Inserido && orientacao && orientacao !== 1) {
            chunks.push(criarApp1Orientacao(orientacao));
            app1Inserido = true;
          }
        } else if (marker === 0xe2 && buf.subarray(i + 2, i + 14).toString("latin1") === "ICC_PROFILE\0") {
          // APP2 ICC Profile: mantém
          chunks.push(segBuf);
        } else if (marker === 0xee) {
          // APP14 Adobe: mantém
          chunks.push(segBuf);
        } else if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) {
          // APP1..APP15 ou COM: descarta
        } else {
          // Outros marcadores (DQT, DHT, SOF, etc.): mantém
          chunks.push(segBuf);
        }

        i += len;
      }

      return Buffer.concat(chunks);
    }

    // 3. WebP: Tira chunks EXIF e XMP; limpa os bits correspondentes no VP8X e recalcula tamanho RIFF
    if (
      mime === "image/webp" &&
      buf.length > 30 &&
      buf.subarray(0, 4).toString("latin1") === "RIFF" &&
      buf.subarray(8, 12).toString("latin1") === "WEBP"
    ) {
      let pos = 12;
      const chunks: Buffer[] = [];
      let removeu = false;

      while (pos + 8 <= buf.length) {
        const fourCC = buf.subarray(pos, pos + 4).toString("latin1");
        const chunkLen = buf.readUInt32LE(pos + 4);
        const paddedLen = chunkLen + (chunkLen % 2);
        const totalLen = 8 + paddedLen;
        if (pos + 8 + chunkLen > buf.length) return buf;

        const chunkBuf = buf.subarray(pos, Math.min(pos + totalLen, buf.length));

        if (fourCC === "EXIF" || fourCC === "XMP ") {
          removeu = true;
        } else if (fourCC === "VP8X") {
          const vp8x = Buffer.from(chunkBuf);
          const flagsAntigas = vp8x[8];
          const flagsNovas = flagsAntigas & ~0x08 & ~0x04; // limpa bit 3 (EXIF) e bit 2 (XMP)
          if (flagsAntigas !== flagsNovas) {
            removeu = true;
            vp8x[8] = flagsNovas;
          }
          chunks.push(vp8x);
        } else {
          chunks.push(chunkBuf);
        }

        pos += totalLen;
      }

      if (!removeu) return buf;

      const body = Buffer.concat(chunks);
      const out = Buffer.alloc(12 + body.length);
      out.write("RIFF", 0, "latin1");
      out.writeUInt32LE(4 + body.length, 4);
      out.write("WEBP", 8, "latin1");
      body.copy(out, 12);
      return out;
    }

    // 4. GIF: Tira extensão de comentário (0x21 0xFE) e de aplicação que não seja de animação
    if (mime === "image/gif" && buf.length >= 13) {
      const sig = buf.subarray(0, 6).toString("latin1");
      if (sig === "GIF87a" || sig === "GIF89a") {
        const packed = buf[10];
        const gctFlag = (packed & 0x80) !== 0;
        const gctSize = gctFlag ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
        const headerEnd = 13 + gctSize;
        if (headerEnd > buf.length) return buf;

        const chunks: Buffer[] = [buf.subarray(0, headerEnd)];
        let pos = headerEnd;
        let removeu = false;

        while (pos < buf.length) {
          const blockType = buf[pos];
          if (blockType === 0x3b) {
            // Trailer
            chunks.push(buf.subarray(pos, pos + 1));
            break;
          }
          if (blockType === 0x2c) {
            // Descritor de imagem + dados
            const imgStart = pos;
            if (pos + 10 > buf.length) return buf;
            const lctFlag = (buf[pos + 9] & 0x80) !== 0;
            const lctSize = lctFlag ? 3 * (1 << ((buf[pos + 9] & 0x07) + 1)) : 0;
            pos += 10 + lctSize;
            if (pos >= buf.length) return buf;
            pos += 1; // LZW min code
            while (pos < buf.length) {
              const subLen = buf[pos++];
              if (subLen === 0) break;
              pos += subLen;
            }
            chunks.push(buf.subarray(imgStart, pos));
          } else if (blockType === 0x21) {
            const extStart = pos;
            const label = buf[pos + 1];
            pos += 2;

            if (label === 0xfe) {
              // Comentário: descarta
              removeu = true;
              while (pos < buf.length) {
                const subLen = buf[pos++];
                if (subLen === 0) break;
                pos += subLen;
              }
            } else if (label === 0xff) {
              // Aplicação: mantém se for NETSCAPE2.0 ou ANIMEXTS1.0
              const appDataStart = pos;
              const subLen = buf[pos];
              let ehLoopAnimacao = false;
              if (subLen === 11 && pos + 12 <= buf.length) {
                const appId = buf.subarray(pos + 1, pos + 12).toString("latin1");
                if (appId === "NETSCAPE2.0" || appId === "ANIMEXTS1.0") {
                  ehLoopAnimacao = true;
                }
              }
              // Avança todos os sub-blocos
              while (pos < buf.length) {
                const len = buf[pos++];
                if (len === 0) break;
                pos += len;
              }
              if (ehLoopAnimacao) {
                chunks.push(buf.subarray(extStart, pos));
              } else {
                removeu = true;
              }
            } else {
              // Graphic Control (0xF9) ou outras extensões úteis: mantém
              while (pos < buf.length) {
                const len = buf[pos++];
                if (len === 0) break;
                pos += len;
              }
              chunks.push(buf.subarray(extStart, pos));
            }
          } else {
            return buf;
          }
        }

        return removeu ? Buffer.concat(chunks) : buf;
      }
    }
  } catch {
    // Em caso de qualquer erro de parsing, não quebra o envio e devolve o original
    return buf;
  }

  return buf;
}

/**
 * Monta o caminho de armazenamento relativo no depósito: ${sha.slice(0,2)}/${sha}.${ext}
 */
export function chaveDoArquivo(sha256: string, ext: "png" | "jpg" | "webp" | "gif"): string {
  return `${sha256.slice(0, 2)}/${sha256}.${ext}`;
}
