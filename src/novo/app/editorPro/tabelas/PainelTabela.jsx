import React from "react";
import { LIMITES, limitar } from "./comandos.js";

// Janela "Inserir tabela": escolhe linhas, colunas e se a primeira linha é cabeçalho.
export default function PainelTabela({ editor, ctx }) {
  const [linhas, setLinhas] = React.useState(3);
  const [colunas, setColunas] = React.useState(3);
  const [cabecalho, setCabecalho] = React.useState(true);
  const bloqueado = ctx.somenteLeitura || ["table", "bulletList", "orderedList", "blockquote"].some((t) => editor.isActive(t));
  const inserir = () =>
    editor.chain().focus().insertTable({ rows: limitar(linhas, LIMITES.linhas), cols: limitar(colunas, LIMITES.colunas), withHeaderRow: cabecalho }).run();
  return (
    <div className="ep-form" data-testid="painel-tabela">
      <label className="ep-campo">
        Linhas
        <input type="number" min={LIMITES.linhas[0]} max={LIMITES.linhas[1]} value={linhas} onChange={(e) => setLinhas(e.target.value)} />
      </label>
      <label className="ep-campo">
        Colunas
        <input type="number" min={LIMITES.colunas[0]} max={LIMITES.colunas[1]} value={colunas} onChange={(e) => setColunas(e.target.value)} />
      </label>
      <label className="ep-campo ep-campo--linha">
        <input type="checkbox" checked={cabecalho} onChange={(e) => setCabecalho(e.target.checked)} />
        A primeira linha é cabeçalho
      </label>
      <button type="button" className="ep-acao" disabled={bloqueado} onClick={inserir}>
        Inserir tabela
      </button>
      {bloqueado && <p className="ep-aviso">Coloque o cursor em um parágrafo fora de tabelas e listas.</p>}
    </div>
  );
}
