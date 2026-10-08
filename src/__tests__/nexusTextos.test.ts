// @vitest-environment node
/**
 * Textos do Tutor do aluno (spec do Tutor Nexus, decisões de 2026-10-08): a voz do aparelho saiu (o professor fala pela voz dele,
 * pela voz reserva ou por escrito) e nenhum texto que o aluno vê nomeia fornecedor. O painel de administração pode nomear e não
 * entra aqui (fica em src/novo/app/admin).
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../novo/app/tutor");
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.(jsx?|tsx?)$/.test(e.name) ? [path.join(dir, e.name)] : []));
/** O código sem os comentários (de linha e de bloco) e sem endereços. */
const code = (file: string) =>
  fs.readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1")
    .replace(/https?:\/\/[^\s"'`]+/g, "");

describe("Textos do Tutor do aluno", () => {
  it("a voz do aparelho nunca é usada no Tutor", () => {
    const hits = files(ROOT).filter((f) => /speechSynthesis|SpeechSynthesisUtterance|voz do aparelho/i.test(fs.readFileSync(f, "utf8")));
    expect(hits.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("nenhum texto do aluno nomeia fornecedor", () => {
    const hits: string[] = [];
    for (const f of files(ROOT)) {
      for (const m of code(f).matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
        if (/OpenAI|Google|Gemini|ElevenLabs/.test(m[2])) hits.push(`${path.relative(ROOT, f)}: ${m[2].slice(0, 80)}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
