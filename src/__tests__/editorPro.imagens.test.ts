// @vitest-environment node
import fs from "fs";
import http from "http";
import zlib from "zlib";
import express from "express";
import { chromium } from "playwright";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { ContentDb, Identity, Storage } from "../../server/contentHub/infra";
import type { PipelineDeps } from "../../server/contentHub/pipeline";
import {
  detectarImagem,
  removerMetadados,
  chaveDoArquivo,
} from "../../server/contentHub/docImagens/formato";
import { prepararImagem } from "../../server/contentHub/docImagens/servico";
import { createDocImagensRouter } from "../../server/contentHub/docImagens/router";
import { criarProcessadorChromium, type ProcessadorImagem } from "../../server/contentHub/docImagens/processador";
import { type DocImagem } from "../shared/docImagens";

// ── Utilitários para gerar imagens válidas em memória ────────────────────────

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    for (let j = 0; j < 8; j++) {
      const bit = (crc ^ (byte >> j)) & 1;
      crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function criarChunkPng(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "latin1");
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function gerarPng(w = 100, h = 80, textoExtra?: string): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = criarChunkPng("IHDR", ihdr);

  const rawLine = Buffer.alloc(1 + w * 3);
  const rawData = Buffer.concat(Array(h).fill(rawLine));
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = criarChunkPng("IDAT", compressed);

  let textChunk: Buffer | null = null;
  if (textoExtra) {
    const tData = Buffer.concat([
      Buffer.from("Author\0", "latin1"),
      Buffer.from(textoExtra, "latin1"),
    ]);
    textChunk = criarChunkPng("tEXt", tData);
  }

  const iendChunk = criarChunkPng("IEND", Buffer.alloc(0));
  return Buffer.concat([
    sig,
    ihdrChunk,
    ...(textChunk ? [textChunk] : []),
    idatChunk,
    iendChunk,
  ]);
}

function gerarJpeg(w = 300, h = 200, orientacao = 6, comGps = true): Buffer {
  const chunks: Buffer[] = [];
  // SOI
  chunks.push(Buffer.from([0xff, 0xd8]));

  // APP0 (JFIF): 2 bytes marcador + 16 bytes len e dados = 18 bytes
  const app0 = Buffer.alloc(18);
  app0[0] = 0xff;
  app0[1] = 0xe0;
  app0.writeUInt16BE(16, 2);
  app0.write("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", 4, "latin1");
  chunks.push(app0);

  // APP1 Exif com orientação e GPS opcional
  if (orientacao || comGps) {
    const tiffBuf = Buffer.alloc(100);
    tiffBuf.write("MM", 0, "latin1"); // Big Endian
    tiffBuf.writeUInt16BE(42, 2);
    tiffBuf.writeUInt32BE(8, 4); // IFD0 offset

    let numEntries = 0;
    if (orientacao) numEntries++;
    if (comGps) numEntries++;

    tiffBuf.writeUInt16BE(numEntries, 8);
    let curOffset = 10;

    if (orientacao) {
      tiffBuf.writeUInt16BE(0x0112, curOffset); // Orientation
      tiffBuf.writeUInt16BE(3, curOffset + 2); // SHORT
      tiffBuf.writeUInt32BE(1, curOffset + 4);
      tiffBuf.writeUInt16BE(orientacao, curOffset + 8);
      curOffset += 12;
    }

    if (comGps) {
      tiffBuf.writeUInt16BE(0x8825, curOffset); // GPSInfo
      tiffBuf.writeUInt16BE(4, curOffset + 2); // LONG
      tiffBuf.writeUInt32BE(1, curOffset + 4);
      tiffBuf.writeUInt32BE(curOffset + 16, curOffset + 8); // deslocamento do bloco GPS
      curOffset += 12;

      tiffBuf.writeUInt32BE(0, curOffset); // next IFD
      curOffset += 4;

      // Bloco com texto GPS
      tiffBuf.write("GPS LOCATION SENSITIVE DATA", curOffset, "latin1");
      curOffset += 28;
    } else {
      tiffBuf.writeUInt32BE(0, curOffset);
      curOffset += 4;
    }

    const tiffUsed = tiffBuf.subarray(0, curOffset);
    const segLen = 2 + 6 + tiffUsed.length;
    const app1 = Buffer.alloc(2 + segLen);
    app1[0] = 0xff;
    app1[1] = 0xe1;
    app1.writeUInt16BE(segLen, 2);
    app1.write("Exif\0\0", 4, "latin1");
    tiffUsed.copy(app1, 10);
    chunks.push(app1);
  }

  // SOF0 (Baseline): 2 bytes marcador + 11 bytes len e dados = 13 bytes
  const sof0 = Buffer.alloc(13);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(11, 2);
  sof0[4] = 8; // precision
  sof0.writeUInt16BE(h, 5);
  sof0.writeUInt16BE(w, 7);
  sof0[9] = 1; // 1 componente
  sof0[10] = 1; // comp ID
  sof0[11] = 0x11; // sampling
  sof0[12] = 0; // quant table
  chunks.push(sof0);

  // SOS: 2 bytes marcador + 8 bytes len e dados = 10 bytes
  const sos = Buffer.alloc(10);
  sos[0] = 0xff;
  sos[1] = 0xda;
  sos.writeUInt16BE(8, 2);
  sos[4] = 1;
  sos[5] = 1;
  sos[6] = 0;
  sos[7] = 0;
  sos[8] = 63;
  sos[9] = 0;
  chunks.push(sos);

  // Bytes comprimidos simulados
  chunks.push(Buffer.from([0x00, 0x12, 0x34]));

  // EOI
  chunks.push(Buffer.from([0xff, 0xd9]));
  return Buffer.concat(chunks);
}

function gerarGif(w = 100, h = 80, animado = false, textoComentario?: string): Buffer {
  const parts: Buffer[] = [];
  parts.push(Buffer.from("GIF89a", "latin1"));

  // Logical Screen Descriptor
  const lsd = Buffer.alloc(7);
  lsd.writeUInt16LE(w, 0);
  lsd.writeUInt16LE(h, 2);
  lsd[4] = 0x80; // GCT presente, 2 cores
  lsd[5] = 0;
  lsd[6] = 0;
  parts.push(lsd);

  // Global Color Table (2 cores x 3 bytes)
  parts.push(Buffer.from([0x00, 0x00, 0x00, 0xff, 0xff, 0xff]));

  // Comment Extension
  if (textoComentario) {
    const cBuf = Buffer.from(textoComentario, "utf8");
    parts.push(Buffer.from([0x21, 0xfe, cBuf.length]));
    parts.push(cBuf);
    parts.push(Buffer.from([0x00]));
  }

  // Bloco 1: Image Descriptor
  const img1 = Buffer.alloc(10);
  img1[0] = 0x2c;
  img1.writeUInt16LE(w, 5);
  img1.writeUInt16LE(h, 7);
  parts.push(img1);
  parts.push(Buffer.from([0x02, 0x01, 0x00, 0x00])); // LZW min code + sub-bloco vazio

  if (animado) {
    // Bloco 2: Image Descriptor
    const img2 = Buffer.alloc(10);
    img2[0] = 0x2c;
    img2.writeUInt16LE(w, 5);
    img2.writeUInt16LE(h, 7);
    parts.push(img2);
    parts.push(Buffer.from([0x02, 0x01, 0x00, 0x00]));
  }

  // Trailer
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

function gerarWebp(w = 120, h = 90, comExif = true): Buffer {
  const chunks: Buffer[] = [];

  // VP8X
  const vp8x = Buffer.alloc(18);
  vp8x.write("VP8X", 0, "latin1");
  vp8x.writeUInt32LE(10, 4);
  vp8x[8] = comExif ? 0x08 | 0x04 : 0x00; // EXIF e XMP flags
  vp8x.writeUIntLE(w - 1, 12, 3);
  vp8x.writeUIntLE(h - 1, 15, 3);
  chunks.push(vp8x);

  if (comExif) {
    const exifData = Buffer.from("EXIF_SECRET_META", "latin1");
    const exifChunk = Buffer.alloc(8 + exifData.length);
    exifChunk.write("EXIF", 0, "latin1");
    exifChunk.writeUInt32LE(exifData.length, 4);
    exifData.copy(exifChunk, 8);
    chunks.push(exifChunk);
  }

  // VP8 chunk dummy
  const vp8Data = Buffer.alloc(10);
  const vp8Chunk = Buffer.alloc(8 + vp8Data.length);
  vp8Chunk.write("VP8 ", 0, "latin1");
  vp8Chunk.writeUInt32LE(vp8Data.length, 4);
  chunks.push(vp8Chunk);

  const body = Buffer.concat(chunks);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "latin1");
  riff.writeUInt32LE(4 + body.length, 4);
  riff.write("WEBP", 8, "latin1");

  return Buffer.concat([riff, body]);
}

function gerarSvg(w = 500, h = 400, script = true): Buffer {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
      (script ? `<script>alert("hack")</script>` : "") +
      `<rect width="${w}" height="${h}" fill="blue"/>` +
      `</svg>`,
    "utf8"
  );
}

// ── Banco de dados e armazenamento em memória para testes ─────────────────────

function criarFakeContentDb(publicadas = new Set<string>()): {
  db: ContentDb;
  assets: DocImagem[];
  publicadas: Set<string>;
} {
  const assets: DocImagem[] = [];
  const paths = new Map<string, string>();

  const db: ContentDb = {
    mode: "dev",
    async authenticate(req) {
      const auth = req.headers.authorization || "";
      if (auth === "Bearer editor") {
        return {
          id: "00000000-0000-0000-0000-000000000001",
          email: "editor@staziamed.com",
          jwt: "editor",
        };
      }
      if (auth === "Bearer admin") {
        return {
          id: "00000000-0000-0000-0000-000000000002",
          email: "admin@staziamed.com",
          jwt: "admin",
        };
      }
      if (auth === "Bearer revisor") {
        return {
          id: "00000000-0000-0000-0000-000000000003",
          email: "revisor@staziamed.com",
          jwt: "revisor",
        };
      }
      if (auth === "Bearer aluno") {
        return {
          id: "00000000-0000-0000-0000-000000000004",
          email: "aluno@staziamed.com",
          jwt: "aluno",
        };
      }
      return null;
    },

    async asUser<T>(user: Identity, fn: string, args: Record<string, any> = {}): Promise<T> {
      if (fn === "app_ch_whoami") {
        if (user.id.endsWith("1") || user.id.endsWith("2")) {
          return { staff: true, reviewer_areas: [] } as T;
        }
        if (user.id.endsWith("3")) {
          return { staff: false, reviewer_areas: ["clinica"] } as T;
        }
        return { staff: false, reviewer_areas: [] } as T;
      }

      if (fn === "app_ch_doc_imagens") {
        if (user.id.endsWith("4")) {
          throw new Error("Imagens do editor: acesso restrito à equipe. (42501)");
        }
        const f = args.p_filtro || {};
        const filtradas = assets.filter((a) => {
          if (f.unit_id && a.unit_id !== f.unit_id) return false;
          if (f.lesson_id && a.lesson_id !== f.lesson_id) return false;
          if (!f.arquivadas && a.retired_at) return false;
          if (f.busca) {
            const b = String(f.busca).toLowerCase();
            const alt = (a.alt_text || "").toLowerCase();
            const nome = (a.original_name || "").toLowerCase();
            if (!alt.includes(b) && !nome.includes(b)) return false;
          }
          return true;
        });
        return { itens: filtradas, total: filtradas.length } as T;
      }

      if (fn === "app_ch_doc_imagem") {
        if (user.id.endsWith("4")) {
          throw new Error("Imagens do editor: acesso restrito à equipe. (42501)");
        }
        const achada = assets.find((a) => a.id === args.p_id);
        if (!achada) throw new Error("Imagem não encontrada. (P0002)");
        return { imagem: achada, versoes: [achada], historico: [] } as T;
      }

      if (fn === "app_ch_doc_imagem_texto_alternativo") {
        if (user.id.endsWith("4")) {
          throw new Error("Imagens do editor: acesso restrito à equipe. (42501)");
        }
        const achada = assets.find((a) => a.id === args.p_id);
        if (!achada) throw new Error("Imagem não encontrada. (P0002)");
        achada.alt_text = args.p_texto || "";
        return achada as T;
      }

      if (fn === "app_ch_doc_imagem_arquivar") {
        if (user.id.endsWith("4")) {
          throw new Error("Imagens do editor: acesso restrito à equipe. (42501)");
        }
        const achada = assets.find((a) => a.id === args.p_id);
        if (!achada) throw new Error("Imagem não encontrada. (P0002)");
        achada.retired_at = args.p_arquivar ? new Date().toISOString() : null;
        return achada as T;
      }

      throw new Error(`Função asUser não implementada no mock: ${fn}`);
    },

    async service<T>(fn: string, args: Record<string, any> = {}): Promise<T> {
      if (fn === "ch_worker_doc_imagem_registrar") {
        const actor = args.p_actor as string;
        if (actor.endsWith("4")) {
          throw new Error("Imagens do editor: acesso restrito à equipe. (42501)");
        }
        const p = args.p_asset;
        if (!p.substitui) {
          const dup = assets.find(
            (a) =>
              a.sha256 === p.sha256 &&
              a.unit_id === (p.unit_id || null) &&
              a.lesson_id === (p.lesson_id || null) &&
              !a.retired_at
          );
          if (dup) {
            return { ...dup, repetida: true } as T;
          }
        }

        const id = crypto.randomUUID();
        const nova: DocImagem = {
          id,
          family_id: p.substitui
            ? assets.find((a) => a.id === p.substitui)?.family_id || id
            : id,
          version: p.substitui
            ? (assets.find((a) => a.id === p.substitui)?.version || 1) + 1
            : 1,
          previous_id: p.substitui || null,
          unit_id: p.unit_id || null,
          lesson_id: p.lesson_id || null,
          mime: p.mime,
          width: p.width,
          height: p.height,
          bytes: p.bytes,
          sha256: p.sha256,
          alt_text: p.alt_text || "",
          original_name: p.original_name || null,
          original_mime: p.original_mime || null,
          processing: p.processing || {},
          uploaded_by: actor,
          enviada_por: "editor@staziamed.com",
          created_at: new Date().toISOString(),
          retired_at: null,
          repetida: false,
        };
        paths.set(id, p.storage_path);
        assets.push(nova);
        return nova as T;
      }

      if (fn === "ch_worker_doc_imagem_arquivo") {
        const actor = args.p_actor as string;
        if (actor.endsWith("4")) {
          throw new Error("Imagens do editor: acesso restrito à equipe. (42501)");
        }
        const achada = assets.find((a) => a.id === args.p_id);
        if (!achada) throw new Error("Imagem não encontrada. (P0002)");
        const caminho = paths.get(achada.id)!;
        return { caminho, tipo: achada.mime } as T;
      }

      if (fn === "ch_worker_doc_imagem_links") {
        const actor = args.p_actor as string;
        if (actor.endsWith("4")) {
          throw new Error("Imagens do editor: acesso restrito à equipe. (42501)");
        }
        const ids = args.p_ids as string[];
        const encontrados = assets
          .filter((a) => ids.includes(a.id))
          .map((a) => ({
            id: a.id,
            caminho: paths.get(a.id)!,
            tipo: a.mime,
          }));
        return encontrados as T;
      }

      if (fn === "ch_worker_doc_imagem_aluno") {
        if (!publicadas.has(args.p_id)) {
          throw new Error("Imagem não encontrada. (P0002)");
        }
        const achada = assets.find((a) => a.id === args.p_id);
        if (!achada) throw new Error("Imagem não encontrada. (P0002)");
        const caminho = paths.get(achada.id)!;
        return { caminho, tipo: achada.mime } as T;
      }

      throw new Error(`Função service não implementada no mock: ${fn}`);
    },
  };

  return { db, assets, publicadas };
}

function criarFakeStorage(comSignedUrl = true): Storage & { map: Map<string, Buffer> } {
  const map = new Map<string, Buffer>();
  return {
    map,
    async put(key, data) {
      map.set(key, Buffer.from(data));
      return key;
    },
    async get(key) {
      const d = map.get(key);
      if (!d) throw new Error("Arquivo não encontrado no depósito.");
      return d;
    },
    async exists(key) {
      return map.has(key);
    },
    signedUrl: comSignedUrl
      ? async (key, sec) => `https://mock.storage.local/signed/${key}?expira=${sec}`
      : undefined,
  };
}

describe("Módulo de Imagens da Central de Conteúdo (ed-imagens-guarda)", () => {
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. detectarImagem", () => {
    it("detecta PNG, JPEG, WebP, GIF e SVG com precisão", () => {
      const png = gerarPng(120, 90);
      const infoPng = detectarImagem(png);
      expect(infoPng).toEqual({ mime: "image/png", ext: "png", width: 120, height: 90 });

      const jpeg = gerarJpeg(300, 200, 1);
      const infoJpeg = detectarImagem(jpeg);
      expect(infoJpeg).toEqual({ mime: "image/jpeg", ext: "jpg", width: 300, height: 200, orientacao: 1 });

      const webp = gerarWebp(150, 100);
      const infoWebp = detectarImagem(webp);
      expect(infoWebp?.mime).toBe("image/webp");
      expect(infoWebp?.ext).toBe("webp");
      expect(infoWebp?.width).toBe(150);
      expect(infoWebp?.height).toBe(100);

      const gif = gerarGif(80, 60);
      const infoGif = detectarImagem(gif);
      expect(infoGif).toEqual({ mime: "image/gif", ext: "gif", width: 80, height: 60 });

      const gifAnimado = gerarGif(80, 60, true);
      const infoGifAnimado = detectarImagem(gifAnimado);
      expect(infoGifAnimado?.animada).toBe(true);

      const svg = gerarSvg(500, 400);
      const infoSvg = detectarImagem(svg);
      expect(infoSvg).toEqual({ mime: "image/svg+xml", ext: "svg", width: 500, height: 400 });
    });

    it("JPEG com orientação 6 troca W e H (tamanho real na tela)", () => {
      const jpeg = gerarJpeg(300, 200, 6);
      const info = detectarImagem(jpeg);
      expect(info?.orientacao).toBe(6);
      expect(info?.width).toBe(200); // invertido
      expect(info?.height).toBe(300); // invertido
    });

    it("devolve null para lixo binário e para HTML", () => {
      expect(detectarImagem(Buffer.from([0x01, 0x02, 0x03, 0x04]))).toBeNull();
      expect(detectarImagem(Buffer.from("<!DOCTYPE html><html><body>Texto</body></html>", "utf8"))).toBeNull();
      expect(detectarImagem(Buffer.from("<html><head></head><body><h1>Não é SVG</h1></body></html>", "utf8"))).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe("2. removerMetadados", () => {
    it("PNG: remove chunks de texto (tEXt) e mantém estrutura", () => {
      const pngComMeta = gerarPng(100, 80, "Segredo");
      expect(pngComMeta.includes(Buffer.from("Author"))).toBe(true);
      const limpo = removerMetadados(pngComMeta, "image/png");
      expect(limpo.includes(Buffer.from("Author"))).toBe(false);
      const info = detectarImagem(limpo);
      expect(info?.width).toBe(100);
      expect(info?.height).toBe(80);
    });

    it("JPEG: remove texto de GPS e preserva orientação mínima", () => {
      const jpegComGps = gerarJpeg(300, 200, 6, true);
      expect(jpegComGps.includes(Buffer.from("GPS LOCATION"))).toBe(true);
      const limpo = removerMetadados(jpegComGps, "image/jpeg");
      expect(limpo.includes(Buffer.from("GPS LOCATION"))).toBe(false);

      const info = detectarImagem(limpo);
      expect(info?.orientacao).toBe(6);
      expect(info?.width).toBe(200);
      expect(info?.height).toBe(300);
    });

    it("WebP: remove EXIF e limpa flags no VP8X", () => {
      const webpComExif = gerarWebp(120, 90, true);
      expect(webpComExif.includes(Buffer.from("EXIF_SECRET_META"))).toBe(true);
      const limpo = removerMetadados(webpComExif, "image/webp");
      expect(limpo.includes(Buffer.from("EXIF_SECRET_META"))).toBe(false);

      const info = detectarImagem(limpo);
      expect(info?.width).toBe(120);
      expect(info?.height).toBe(90);
    });

    it("GIF: remove blocos de comentário", () => {
      const gifComComentario = gerarGif(100, 80, false, "Comentário secreto");
      expect(gifComComentario.includes(Buffer.from("Comentário secreto"))).toBe(true);
      const limpo = removerMetadados(gifComComentario, "image/gif");
      expect(limpo.includes(Buffer.from("Comentário secreto"))).toBe(false);

      const info = detectarImagem(limpo);
      expect(info?.width).toBe(100);
      expect(info?.height).toBe(80);
    });

    it("buffer inválido ou malformado é devolvido intacto sem falhar", () => {
      const invalido = Buffer.from("lixo que não é imagem");
      expect(removerMetadados(invalido, "image/png")).toBe(invalido);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe("3. prepararImagem", () => {
    it("sem processador: recusa imagem > 2400 com a mensagem esperada", async () => {
      const grande = gerarPng(2500, 1000);
      await expect(prepararImagem(grande, { processador: null })).rejects.toThrow(
        /o máximo é 2400 px no lado maior/
      );
    });

    it("sem processador: recusa SVG com código 415", async () => {
      const svg = gerarSvg(400, 300);
      await expect(prepararImagem(svg, { processador: null })).rejects.toMatchObject({
        status: 415,
      });
    });

    it("recusa GIF grande mesmo sem processador", async () => {
      const gifGrande = gerarGif(2500, 800);
      await expect(prepararImagem(gifGrande, { processador: null })).rejects.toThrow(
        /GIF com 2500×800 px: o máximo é 2400 px no lado maior/
      );
    });

    it("com processador falso: reduz imagem e marca processing", async () => {
      const processadorFalso: ProcessadorImagem = {
        async reduzir(buf, info, ladoMaximo) {
          const reduzida = gerarPng(2400, 1200);
          return { data: reduzida, mime: "image/png", width: 2400, height: 1200 };
        },
        async svgParaPng() {
          throw new Error("Não chamado");
        },
        async fechar() {},
      };

      const grande = gerarPng(3000, 1500);
      const res = await prepararImagem(grande, { processador: processadorFalso });
      expect(res.width).toBe(2400);
      expect(res.height).toBe(1200);
      expect(res.processing.redimensionada).toBe(true);
      expect(res.processing.largura_original).toBe(3000);
      expect(res.processing.altura_original).toBe(1500);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Rotas HTTP do servidor Express", () => {
    let server: http.Server;
    let baseUrl: string;
    let fakeDbObj: ReturnType<typeof criarFakeContentDb>;
    let fakeStorage: ReturnType<typeof criarFakeStorage>;
    let storageSemSigned: ReturnType<typeof criarFakeStorage>;

    beforeAll(async () => {
      fakeDbObj = criarFakeContentDb();
      fakeStorage = criarFakeStorage(true);
      storageSemSigned = criarFakeStorage(false);

      const app = express();
      const deps: PipelineDeps = {
        db: fakeDbObj.db,
        storage: fakeStorage,
        ai: { provider: null, status: { ready: false } } as unknown as PipelineDeps["ai"],
      };

      const router = createDocImagensRouter(deps, {
        storage: fakeStorage,
        processador: null,
      });
      app.use("/api/content-hub/doc-imagens", router);

      await new Promise<void>((resolve) => {
        server = app.listen(0, "127.0.0.1", () => {
          const addr = server.address() as any;
          baseUrl = `http://127.0.0.1:${addr.port}/api/content-hub/doc-imagens`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("401 sem autenticação", async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(401);
    });

    it("aluno não envia nem lista galeria (403)", async () => {
      const resList = await fetch(`${baseUrl}/`, {
        headers: { Authorization: "Bearer aluno" },
      });
      expect(resList.status).toBe(403);

      const resUpload = await fetch(`${baseUrl}/`, {
        method: "POST",
        headers: {
          Authorization: "Bearer aluno",
          "Content-Type": "image/png",
        },
        body: gerarPng(100, 80),
      });
      expect(resUpload.status).toBe(403);
    });

    let idCriado: string;
    let shaCriado: string;

    it("editor envia PNG → 201 com id e sem caminho interno no JSON", async () => {
      const png = gerarPng(200, 150);
      const res = await fetch(`${baseUrl}/?unidade=&aula=`, {
        method: "POST",
        headers: {
          Authorization: "Bearer editor",
          "Content-Type": "image/png",
          "X-File-Name": encodeURIComponent("figura1.png"),
          "X-Texto-Alternativo": encodeURIComponent("Uma descrição da figura"),
        },
        body: png,
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.imagem).toBeDefined();
      expect(json.imagem.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(json.imagem.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(json.imagem.alt_text).toBe("Uma descrição da figura");
      expect(json.imagem.original_name).toBe("figura1.png");

      // Confere que NÃO há caminho físico exposto no JSON
      const jsonStr = JSON.stringify(json);
      expect(jsonStr).not.toContain(`/${json.imagem.sha256}.png`);
      expect(jsonStr).not.toMatch(/[0-9a-f]{2}\/[0-9a-f]{64}\.(png|jpg)/);

      idCriado = json.imagem.id;
      shaCriado = json.imagem.sha256;
    });

    it("envio repetido da mesma imagem na mesma unidade/aula → 200 com repetida: true", async () => {
      const png = gerarPng(200, 150);
      const res = await fetch(`${baseUrl}/`, {
        method: "POST",
        headers: {
          Authorization: "Bearer editor",
          "Content-Type": "image/png",
        },
        body: png,
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.imagem.repetida).toBe(true);
      expect(json.imagem.id).toBe(idCriado);
    });

    it("recusa tipo inválido (.exe / HTML) com 415", async () => {
      const resExe = await fetch(`${baseUrl}/`, {
        method: "POST",
        headers: {
          Authorization: "Bearer editor",
          "Content-Type": "application/octet-stream",
        },
        body: Buffer.from("MZ programa executavel windows"),
      });
      expect(resExe.status).toBe(415);
    });

    it("recusa corpo maior que 4 MB com 413", async () => {
      const grande = Buffer.alloc(4.2 * 1024 * 1024);
      const res = await fetch(`${baseUrl}/`, {
        method: "POST",
        headers: {
          Authorization: "Bearer editor",
          "Content-Type": "image/png",
        },
        body: grande,
      });
      expect(res.status).toBe(413);
    });

    it("galeria e detalhe", async () => {
      const resGaleria = await fetch(`${baseUrl}/?busca=figura`, {
        headers: { Authorization: "Bearer editor" },
      });
      expect(resGaleria.status).toBe(200);
      const dados = await resGaleria.json();
      expect(dados.itens.length).toBeGreaterThanOrEqual(1);

      const resDetalhe = await fetch(`${baseUrl}/${idCriado}`, {
        headers: { Authorization: "Bearer editor" },
      });
      expect(resDetalhe.status).toBe(200);
      const detalhe = await resDetalhe.json();
      expect(detalhe.imagem.id).toBe(idCriado);
    });

    it("atualiza texto alternativo", async () => {
      const res = await fetch(`${baseUrl}/${idCriado}/texto-alternativo`, {
        method: "PUT",
        headers: {
          Authorization: "Bearer editor",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ texto: "Novo alt text atualizado" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.alt_text).toBe("Novo alt text atualizado");
    });

    it("arquiva e desarquiva imagem", async () => {
      const resArq = await fetch(`${baseUrl}/${idCriado}/arquivar`, {
        method: "POST",
        headers: {
          Authorization: "Bearer editor",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ arquivar: true }),
      });
      expect(resArq.status).toBe(200);
      const jsonArq = await resArq.json();
      expect(jsonArq.retired_at).not.toBeNull();

      const resDesarq = await fetch(`${baseUrl}/${idCriado}/arquivar`, {
        method: "POST",
        headers: {
          Authorization: "Bearer editor",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ arquivar: false }),
      });
      expect(resDesarq.status).toBe(200);
      const jsonDesarq = await resDesarq.json();
      expect(jsonDesarq.retired_at).toBeNull();
    });

    it("/links devolve url assinada; e com depósito sem signedUrl devolve null", async () => {
      const res = await fetch(`${baseUrl}/links`, {
        method: "POST",
        headers: {
          Authorization: "Bearer revisor",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: [idCriado] }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.links[idCriado]).toContain("https://mock.storage.local/signed/");
      expect(json.expira_em_segundos).toBe(300);

      // Agora teste com roteador conectado a storage sem signedUrl
      const appSemSigned = express();
      const depsSemSigned: PipelineDeps = {
        db: fakeDbObj.db,
        storage: storageSemSigned,
        ai: { provider: null, status: { ready: false } } as unknown as PipelineDeps["ai"],
      };
      appSemSigned.use(
        "/api/content-hub/doc-imagens",
        createDocImagensRouter(depsSemSigned, {
          storage: storageSemSigned,
          processador: null,
        })
      );
      const serverSemSigned = appSemSigned.listen(0);
      const portSem = (serverSemSigned.address() as any).port;
      try {
        const resSem = await fetch(`http://127.0.0.1:${portSem}/api/content-hub/doc-imagens/links`, {
          method: "POST",
          headers: {
            Authorization: "Bearer revisor",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: [idCriado] }),
        });
        const jsonSem = await resSem.json();
        expect(jsonSem.links[idCriado]).toBeNull();
      } finally {
        serverSemSigned.close();
      }
    });

    it("/:id/arquivo para revisor entrega bytes com cabeçalhos seguros", async () => {
      const res = await fetch(`${baseUrl}/${idCriado}/arquivo`, {
        headers: { Authorization: "Bearer revisor" },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
      const bytes = await res.arrayBuffer();
      expect(bytes.byteLength).toBeGreaterThan(0);
    });

    it("aluno em /:id/arquivo recebe 403", async () => {
      const res = await fetch(`${baseUrl}/${idCriado}/arquivo`, {
        headers: { Authorization: "Bearer aluno" },
      });
      expect(res.status).toBe(403);
    });

    it("/aluno/:id: imagem não publicada dá 404 genérico", async () => {
      const res = await fetch(`${baseUrl}/aluno/${idCriado}`, {
        headers: { Authorization: "Bearer aluno" },
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Imagem indisponível.");
    });

    it("/aluno/:id: imagem publicada entrega bytes com cabeçalhos corretos", async () => {
      fakeDbObj.publicadas.add(idCriado);
      const res = await fetch(`${baseUrl}/aluno/${idCriado}`, {
        headers: { Authorization: "Bearer aluno" },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-type")).toBe("image/png");
      const bytes = await res.arrayBuffer();
      expect(bytes.byteLength).toBeGreaterThan(0);
    });

    it("validação de id inválido retorna 400", async () => {
      const res = await fetch(`${baseUrl}/aluno/nao-e-uuid`, {
        headers: { Authorization: "Bearer aluno" },
      });
      expect(res.status).toBe(400);

      const resArq = await fetch(`${baseUrl}/nao-e-uuid/arquivo`, {
        headers: { Authorization: "Bearer editor" },
      });
      expect(resArq.status).toBe(400);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe("5. Processador Chromium Real (opcional)", () => {
    let procReal: ProcessadorImagem | null = null;
    // decidido ao carregar o arquivo (o skipIf é avaliado antes do beforeAll)
    const chromiumInstalado = (() => {
      try {
        return fs.existsSync(chromium.executablePath());
      } catch {
        return false;
      }
    })();

    beforeAll(async () => {
      if (chromiumInstalado) procReal = await criarProcessadorChromium();
    }, 60_000);

    afterAll(async () => {
      if (procReal) {
        await procReal.fechar();
      }
    });

    it.skipIf(!chromiumInstalado)("reduz PNG 3000x1000 para 2400x800", async () => {
      const pngGrande = gerarPng(3000, 1000);
      const info = detectarImagem(pngGrande)!;
      const res = await procReal!.reduzir(pngGrande, info, 2400);
      expect(res.width).toBe(2400);
      expect(res.height).toBe(800);
      expect(res.mime).toBe("image/png");
    });

    it.skipIf(!chromiumInstalado)("converte SVG com <script> para PNG sem executar script", async () => {
      const svg = gerarSvg(600, 300, true);
      const info = detectarImagem(svg)!;
      const res = await procReal!.svgParaPng(svg, info, 2400);
      expect(res.width).toBe(600);
      expect(res.height).toBe(300);
      const finalInfo = detectarImagem(res.data);
      expect(finalInfo?.mime).toBe("image/png");
    }, 60_000);

    it.skipIf(!chromiumInstalado)("SVG com <script> enviado pela rota vira PNG guardado (o SVG nunca é guardado)", async () => {
      const prep = await prepararImagem(gerarSvg(3000, 1500, true), { processador: procReal });
      expect(prep.mime).toBe("image/png");
      expect([prep.width, prep.height]).toEqual([2400, 1200]);
      expect(prep.processing.convertida).toBe("svg->png");
      expect(prep.data.toString("latin1")).not.toMatch(/<script|<svg/i);
    }, 60_000);
  });
});
