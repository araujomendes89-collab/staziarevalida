// @vitest-environment node
/**
 * Editor profissional no celular, no NAVEGADOR de verdade (Chromium do Playwright), nas telas reais da Administração com banco
 * simulado (scripts/previa-editor-celular): em 375 e 390 px a barra cabe (a página não alarga, nenhum botão sai da caixa, a barra
 * curta cabe inteira), os botões da barra curta têm 44 px, o "Mais" abre e fecha (botão, Esc e toque fora) e comandos de dentro
 * do "Mais" (Desfazer, Título 2) funcionam. Questões, Aulas, Comunicados, Atualizações e Podcasts.
 * Demora (sobe o Vite e o Chromium): só roda com EDITOR_NAVEGADOR=1.
 *   EDITOR_NAVEGADOR=1 npx vitest run src/__tests__/editorPro.celular.navegador.test.ts
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ligado = process.env.EDITOR_NAVEGADOR === "1";
const raiz = path.resolve(__dirname, "../..");
let servidor: any = null;
let base = "";

describe.skipIf(!ligado)("editor no celular, no navegador (375 e 390 px)", () => {
  beforeAll(async () => {
    const { createServer } = await import("vite");
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "editor-celular-"));
    servidor = await createServer({
      configFile: path.join(raiz, "scripts/previa-editor-celular/vite.config.mjs"),
      server: { port: 0, strictPort: false },
      cacheDir: path.join(pasta, "vite-cache"),
      logLevel: "silent",
    });
    await servidor.listen();
    const end = servidor.httpServer.address();
    base = `http://127.0.0.1:${end.port}`;
  }, 120_000);
  afterAll(async () => {
    await servidor?.close();
  });

  it("a barra cabe, o Mais abre e fecha e os comandos de dentro dele funcionam", async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "editor-celular-fotos-"));
    const saida = await new Promise<{ codigo: number; texto: string }>((ok) => {
      execFile(process.execPath, [path.join(raiz, "scripts/previa-editor-celular/capturas.mjs"), "depois", pasta], { env: { ...process.env, BASE: base }, cwd: raiz, timeout: 540_000 }, (erro, out, err) =>
        ok({ codigo: erro ? Number((erro as any).code ?? 1) : 0, texto: `${out}\n${err}` }),
      );
    });
    expect(saida.texto).toContain("ok (depois)");
    expect(saida.codigo).toBe(0);
    const medidas = JSON.parse(fs.readFileSync(path.join(pasta, "medidas-depois.json"), "utf8"));
    for (const largura of [375, 390]) {
      for (const tela of ["questoes", "aulas", "comunicados", "atualizacoes", "podcasts"]) {
        const m = medidas.find((x: any) => x.largura === largura && x.tela === tela);
        expect(m, `${largura} ${tela}`).toMatchObject({ paginaLarga: false, botoesForaDaCaixa: 0, barraCurtaRola: false, botoesCurtosMenoresQue44: 0 });
      }
    }
  }, 600_000);
});
