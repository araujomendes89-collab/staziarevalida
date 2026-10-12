/**
 * Conferência do arquivo da figura da questão (PNG ou JPG) antes de o servidor confirmá-lo ao banco. Não basta a assinatura dos
 * primeiros bytes: um arquivo só com o cabeçalho passaria e o navegador não conseguiria mostrá-lo. Aqui se confere a estrutura mínima
 * de uma imagem completa, sem decodificar os pontos:
 *   PNG: assinatura, bloco IHDR no começo (largura e altura maiores que zero, profundidade e tipo de cor válidos), CRC dos blocos
 *        essenciais (IHDR, PLTE, IDAT, IEND) certo, pelo menos um IDAT, paleta quando o tipo de cor pede, IEND no fim e nada depois dele.
 *   JPG: início FF D8, segmentos com tamanho que cabe no arquivo, cabeçalho de quadro (SOF) com largura e altura maiores que zero
 *        antes do início da varredura (SOS), e fim FF D9.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let crcTable: Uint32Array | null = null;
/** CRC-32 (o do PNG). */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const COLOR_DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

/** Devolve o defeito do PNG em palavras simples, ou null se a estrutura está completa. */
export function pngProblem(b: Buffer): string | null {
  if (b.length < 8 || !b.subarray(0, 8).equals(PNG_SIGNATURE)) return "não começa como um PNG";
  let pos = 8;
  let first = true;
  let colorType = -1;
  let hasPlte = false;
  let idat = 0;
  while (pos < b.length) {
    if (pos + 12 > b.length) return "o PNG está cortado";
    const length = b.readUInt32BE(pos);
    const type = b.toString("latin1", pos + 4, pos + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) return "bloco do PNG com nome inválido";
    if (length > b.length - pos - 12) return "o PNG está cortado";
    const data = b.subarray(pos + 8, pos + 8 + length);
    const critical = type === "IHDR" || type === "PLTE" || type === "IDAT" || type === "IEND";
    if (first && type !== "IHDR") return "o PNG não começa pelo cabeçalho da imagem";
    if (critical && crc32(b.subarray(pos + 4, pos + 8 + length)) !== b.readUInt32BE(pos + 8 + length)) return "bloco do PNG com soma de conferência errada";
    if (type === "IHDR") {
      if (!first || length !== 13) return "cabeçalho do PNG inválido";
      const width = data.readUInt32BE(0);
      const height = data.readUInt32BE(4);
      colorType = data[9];
      if (width < 1 || height < 1 || width > 0x7fffffff || height > 0x7fffffff) return "o PNG tem largura ou altura zero";
      if (!(COLOR_DEPTHS[colorType] ?? []).includes(data[8])) return "profundidade de cor do PNG inválida";
      if (data[10] !== 0 || data[11] !== 0 || data[12] > 1) return "cabeçalho do PNG inválido";
    } else if (type === "PLTE") {
      if (length === 0 || length % 3 !== 0 || length > 768) return "paleta do PNG inválida";
      hasPlte = true;
    } else if (type === "IDAT") {
      idat += length; // só conta bloco com pontos de imagem de verdade (tamanho maior que zero)
    } else if (type === "IEND") {
      if (length !== 0) return "fim do PNG inválido";
      if (pos + 12 !== b.length) return "há bytes depois do fim do PNG";
      if (idat === 0) return "o PNG não tem pontos de imagem";
      if (colorType === 3 && !hasPlte) return "o PNG indexado não tem paleta";
      return null;
    }
    first = false;
    pos += 12 + length;
  }
  return "o PNG não termina como deveria";
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Devolve o defeito do JPG em palavras simples, ou null se a estrutura está completa. */
export function jpegProblem(b: Buffer): string | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return "não começa como um JPG";
  let pos = 2;
  let frame = false;
  for (;;) {
    while (pos < b.length && b[pos] === 0xff && b[pos + 1] === 0xff) pos++; // bytes de preenchimento
    if (pos + 1 >= b.length || b[pos] !== 0xff) return "o JPG está cortado ou fora do formato";
    const marker = b[pos + 1];
    pos += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // sem tamanho
    if (marker === 0xd9) return "o JPG termina antes dos pontos de imagem";
    if (pos + 2 > b.length) return "o JPG está cortado";
    const length = b.readUInt16BE(pos);
    if (length < 2 || pos + length > b.length) return "o JPG está cortado";
    if (SOF.has(marker)) {
      if (length < 8) return "cabeçalho do JPG inválido";
      const height = b.readUInt16BE(pos + 3);
      const width = b.readUInt16BE(pos + 5);
      if (width < 1 || height < 1) return "o JPG tem largura ou altura zero";
      frame = true;
    }
    if (marker === 0xda) {
      if (!frame) return "o JPG não tem o cabeçalho da imagem";
      let end = b.length;
      while (end > 2 && b[end - 1] === 0x00) end--; // zeros de enchimento depois do fim são tolerados
      if (end < pos + length + 2 || b[end - 2] !== 0xff || b[end - 1] !== 0xd9) return "o JPG não termina como deveria";
      return null;
    }
    pos += length;
  }
}

/** Defeito do arquivo para o tipo informado, ou null. */
export function imageProblem(b: Buffer, contentType: string): string | null {
  return contentType === "image/png" ? pngProblem(b) : contentType === "image/jpeg" ? jpegProblem(b) : "tipo de arquivo não aceito";
}
