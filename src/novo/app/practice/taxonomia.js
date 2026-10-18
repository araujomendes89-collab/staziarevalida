// Subárea e competência das questões em português para as telas do aluno (o mapa fica em shared/questions/taxonomia).
// Código sem nome nunca aparece cru: vira um texto genérico e, em desenvolvimento, fica registrado no console.
import { competencyLabel, subareaLabel } from "../../../shared/questions/taxonomia";

const avisados = new Set();
function avisar(tipo, codigo) {
  if (!import.meta.env?.DEV) return;
  const chave = `${tipo}:${codigo}`;
  if (avisados.has(chave)) return;
  avisados.add(chave);
  console.warn(`[taxonomia] ${tipo === "subarea" ? "subárea" : "competência"} sem nome em português: ${codigo} (acrescente em src/shared/questions/taxonomia.ts)`);
}

export const nomeSubarea = (codigo) => subareaLabel(codigo, avisar);
export const nomeCompetencia = (codigo) => competencyLabel(codigo, avisar);

/** Para virar filtro de busca (ex.: "10 questões de …"): o nome, ou null quando o código não tem nome (também avisa no console). */
export function nomeSubareaOuNada(codigo) {
  let desconhecido = false;
  const nome = subareaLabel(codigo, (tipo, c) => {
    desconhecido = true;
    avisar(tipo, c);
  });
  return desconhecido ? null : nome;
}
