// Módulo M13: o resumo da aula para o ALUNO. Usa o documento rico só quando a projeção dele bate com o texto guardado (summary);
// senão, o texto com marcas como sempre (aula antiga sem rico = igual a antes). Sem TipTap e sem HTML cru: só elementos React.
import React from "react";
import { resumoRicoValido } from "../../../../shared/docRico/modulos/editarAula";
import { TextoRico } from "../../textoRico/TextoRico.jsx";
import LeitorDoc from "../leitor/LeitorDoc.jsx";

export default function ResumoRico({ texto, rico, className = undefined, style = undefined }) {
  const r = resumoRicoValido(texto, rico);
  if (r) return <LeitorDoc rico={r} className={className} style={style} />;
  return <TextoRico modo="documento" texto={texto} className={className} style={style} />;
}
