// Lê o "para-o-revisor-medico.md" de uma aula (a lógica é a mesma da tela: src/shared/aulas/fichaRevisor.js).
import fs from "node:fs";
import { lerFicha } from "../../src/shared/aulas/fichaRevisor.js";

export { lerFicha };
export const lerFichaDoArquivo = (p) => lerFicha(fs.readFileSync(p, "utf8"));
