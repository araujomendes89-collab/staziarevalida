// @vitest-environment node
// O monitor de fontes lê pelo https.request, que não descomprime sozinho: decodedBody devolve o conteúdo já descomprimido,
// para o hash da publicação não mudar só porque o servidor mandou gzip.
import zlib from "zlib";
import { Readable } from "stream";
import { describe, expect, it } from "vitest";
import { decodedBody } from "../../server/podcasts/extract";

const TEXTO = "<html><body>Protocolo clínico, versão 2026: conduta atual.</body></html>";
const lerTudo = async (r: Readable) => {
  const partes: Buffer[] = [];
  for await (const p of r) partes.push(Buffer.from(p));
  return Buffer.concat(partes).toString("utf8");
};

describe("decodedBody", () => {
  it("gzip, deflate e br voltam ao texto original", async () => {
    for (const [enc, bytes] of [["gzip", zlib.gzipSync(TEXTO)], ["deflate", zlib.deflateSync(TEXTO)], ["br", zlib.brotliCompressSync(TEXTO)], ["GZIP", zlib.gzipSync(TEXTO)], ["x-gzip", zlib.gzipSync(TEXTO)]] as const) {
      const r = decodedBody(enc, Readable.from([bytes]));
      expect(r.decoded).toBe(true);
      expect(await lerTudo(r.stream)).toBe(TEXTO);
    }
  });
  it("sem codificação, identity ou desconhecida passa como veio", async () => {
    for (const enc of [undefined, "", "identity", "zstd"]) {
      const r = decodedBody(enc, Readable.from([Buffer.from(TEXTO)]));
      expect(r.decoded).toBe(false);
      expect(await lerTudo(r.stream)).toBe(TEXTO);
    }
  });
  it("cabeçalho repetido usa o primeiro valor", async () => {
    const r = decodedBody(["gzip", "identity"], Readable.from([zlib.gzipSync(TEXTO)]));
    expect(r.decoded).toBe(true);
    expect(await lerTudo(r.stream)).toBe(TEXTO);
  });
  it("o mesmo texto gera o mesmo conteúdo comprimido ou não (o hash da publicação não muda)", async () => {
    const a = await lerTudo(decodedBody("gzip", Readable.from([zlib.gzipSync(TEXTO)])).stream);
    const b = await lerTudo(decodedBody(undefined, Readable.from([Buffer.from(TEXTO)])).stream);
    expect(a).toBe(b);
  });
  it("corpo comprimido corrompido vira erro, não texto torto", async () => {
    const r = decodedBody("gzip", Readable.from([Buffer.from("isto não é gzip")]));
    await expect(lerTudo(r.stream)).rejects.toThrow();
  });
});
