// Parágrafo da aula: usa o documento rico só quando ele bate com o texto guardado (regra da projeção); senão, o texto com marcas.
import React from "react";
import { ricoValido } from "../../../../shared/docRico";
import { TextoRico } from "../../textoRico/TextoRico.jsx";
import LeitorDoc from "./LeitorDoc.jsx";

export default function ParagrafoRico({ texto, rico, como = "p", className, style }) {
  const r = ricoValido(texto, rico);
  if (r) {
    return (
      <div className={className} style={style}>
        <LeitorDoc rico={r} />
      </div>
    );
  }

  const Tag = como;
  return (
    <Tag className={className} style={style}>
      <TextoRico texto={texto} />
    </Tag>
  );
}
