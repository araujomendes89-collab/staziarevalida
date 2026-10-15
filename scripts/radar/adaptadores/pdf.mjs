// Texto de PDF por página, para o Radar comparar o conteúdo (e não os bytes, que mudam por metadado). Usa o PyMuPDF do ambiente
// (pdfpython no Mac; /opt/pdf/bin/python na imagem do Cloud Run). Sem Python ou sem camada de texto: devolve null e o adaptador
// cai para o hash do arquivo, avisando. O Radar NÃO faz OCR.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "extrair-pdf.py");

export function ehPdf(resposta) {
  return /pdf/i.test(resposta?.tipo ?? "") || resposta?.buf?.subarray(0, 5).toString() === "%PDF-";
}

/** buf (Buffer) → [{pagina, texto}] ou null. */
export function extrairPdfComPython(buf, { python = process.env.RADAR_PYTHON || "pdfpython" } = {}) {
  const dir = fs.mkdtempSync(path.join(process.env.RADAR_TMP || os.tmpdir(), "radar-pdf-"));
  const arq = path.join(dir, "arquivo.pdf");
  try {
    fs.writeFileSync(arq, buf);
    const r = spawnSync(python, ["-I", SCRIPT, arq], { maxBuffer: 1 << 29, encoding: "utf8", timeout: 120000 });
    if (r.status !== 0 || !r.stdout) return null;
    const paginas = JSON.parse(r.stdout).paginas;
    const total = paginas.reduce((n, p) => n + p.texto.trim().length, 0);
    return total > 200 ? paginas : null; // sem camada de texto utilizável
  } catch { return null; } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** Texto único com as páginas separadas por \f (formato guardado na linha de base). */
export const juntarPaginas = (paginas) => paginas.map((p) => p.texto).join("\f");
export const separarPaginas = (texto) => String(texto ?? "").split("\f").map((t, i) => ({ pagina: i + 1, texto: t }));
