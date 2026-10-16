// Leitura do aluno do módulo "tabelas": células com mesclagem (colspan/rowspan), cor de fundo e largura.
// A tabela inteira já vem dentro de um quadro que rola de lado no celular (tr-tabela-rolagem, no LeitorDoc).
import React from "react";
import { registrarLeitor } from "../registroLeitor.js";
import { estiloReact } from "../../../../../shared/docRico";
import { cssDaCelula } from "../../../../../shared/docRico/modulos/tabelas";

const celula = (Tag) =>
  function Celula({ no, filhos }) {
    const cs = Number(no.attrs?.colspan) > 1 ? Number(no.attrs.colspan) : undefined;
    const rs = Number(no.attrs?.rowspan) > 1 ? Number(no.attrs.rowspan) : undefined;
    const st = estiloReact(cssDaCelula(no));
    return (
      <Tag colSpan={cs} rowSpan={rs} style={Object.keys(st).length ? st : undefined}>
        {filhos}
      </Tag>
    );
  };

registrarLeitor("tableCell", celula("td"));
registrarLeitor("tableHeader", celula("th"));
