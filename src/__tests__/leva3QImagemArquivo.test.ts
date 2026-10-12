// @vitest-environment node
/**
 * Leva 3, aba Questões, achado 6 da revisão: a conferência do arquivo da figura confere a estrutura inteira (PNG ou JPG), não só
 * os primeiros bytes. Imagens reais (geradas pelo PyMuPDF) passam; assinatura sozinha, arquivo cortado, soma de conferência errada,
 * largura zero e lixo depois do fim não passam.
 */
import { describe, expect, it } from "vitest";
import { imageProblem, jpegProblem, pngProblem } from "../../server/questions/imageFiles";
import { makePng, pngChunk, PNG_SIGNATURE, REAL_JPG, REAL_JPG_GRAY, REAL_PNG } from "./helpers/imagensReais";

describe("conferência do arquivo da figura", () => {
  it("imagens completas passam", () => {
    expect(pngProblem(REAL_PNG)).toBeNull();
    expect(pngProblem(makePng(4, 4))).toBeNull();
    expect(jpegProblem(REAL_JPG)).toBeNull();
    expect(jpegProblem(REAL_JPG_GRAY)).toBeNull();
    expect(imageProblem(REAL_PNG, "image/png")).toBeNull();
    expect(imageProblem(REAL_JPG, "image/jpeg")).toBeNull();
  });

  it("PNG: só a assinatura, cortado, soma errada, largura zero, sem pontos, lixo no fim e tipo trocado não passam", () => {
    expect(pngProblem(PNG_SIGNATURE)).toMatch(/cortado|cabeçalho|termina/);
    expect(pngProblem(REAL_PNG.subarray(0, REAL_PNG.length - 1))).not.toBeNull();
    expect(pngProblem(REAL_PNG.subarray(0, 40))).not.toBeNull();
    const wrongSum = Buffer.from(REAL_PNG);
    wrongSum[wrongSum.length - 20] ^= 0xff; // dentro do IDAT
    expect(pngProblem(wrongSum)).toMatch(/soma/);
    expect(pngProblem(Buffer.concat([REAL_PNG, Buffer.from("x")]))).toMatch(/depois do fim/);
    const zero = Buffer.alloc(13);
    zero[8] = 8;
    zero[9] = 2;
    expect(pngProblem(Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", zero), pngChunk("IEND")]))).toMatch(/zero/);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(2, 0);
    ihdr.writeUInt32BE(2, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    expect(pngProblem(Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", ihdr), pngChunk("IEND")]))).toMatch(/pontos de imagem/);
    expect(imageProblem(REAL_JPG, "image/png")).not.toBeNull();
    expect(imageProblem(REAL_PNG, "image/jpeg")).not.toBeNull();
    expect(imageProblem(REAL_PNG, "image/gif")).not.toBeNull();
  });

  it("JPG: só a assinatura, cortado, sem fim e sem cabeçalho de quadro não passam", () => {
    expect(jpegProblem(Buffer.from([0xff, 0xd8, 0xff]))).not.toBeNull();
    expect(jpegProblem(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).not.toBeNull();
    expect(jpegProblem(REAL_JPG.subarray(0, REAL_JPG.length - 2))).toMatch(/termina/);
    expect(jpegProblem(REAL_JPG.subarray(0, 60))).not.toBeNull();
    expect(jpegProblem(Buffer.concat([REAL_JPG, Buffer.from("lixo")]))).toMatch(/termina/);
  });
});
