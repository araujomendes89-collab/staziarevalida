// PAINEL LATERAL do editor profissional: peças reaproveitáveis (usadas pelo M6 Revisão; o M7 IA deve usar as mesmas).
//
// Como encaixar um painel novo (ex.: M7 IA), em src/novo/app/editorPro/modulos/<modulo>.jsx:
//
//   registrarModuloEditor({
//     id: "ia",
//     paineis: [{ id: "ia-assistente", titulo: "Assistente de IA", icone: "sparkles", Componente: PainelIA }],
//   });
//
// - A casca (EditorDocumento) mostra um botão por painel registrado ao lado das abas e abre UM painel por vez na coluna da direita
//   (no celular, embaixo). O título, o botão de fechar e a rolagem já vêm da casca: o Componente só desenha o miolo.
// - O Componente recebe { editor, ctx }. "editor" é o editor TipTap (leia editor.state; chame editor.chain()/commands).
//   "ctx" = { config, mudarConfig, contexto, somenteLeitura }; respeite ctx.somenteLeitura (desligue ações que mudam o texto).
// - Para o painel reagir a mudanças no documento/seleção use useEstadoEditor(editor, (e) => valor) (abaixo).
// - Proposta com antes/depois: use <PropostaAntesDepois antes depois onAceitar onRejeitar /> (abaixo). Nada muda no texto
//   sem o clique em Aceitar.
// - Peças de layout: SecaoPainel (bloco com título), LinhaCampos, BotaoPainel, Interruptor, AvisoPainel.
// - Estilos: ./revisao.css (classes ep-pl-*), já importado por este arquivo.
import React from "react";
import { useEditorState } from "@tiptap/react";
import { Icon } from "../../../ds";
import "./revisao.css";

export function useEstadoEditor(editor, seletor) {
  return useEditorState({ editor, selector: ({ editor: e }) => seletor(e) });
}

export function SecaoPainel({ titulo, children, dica }) {
  return (
    <section className="ep-pl-secao">
      {titulo && <h3 className="ep-pl-titulo">{titulo}</h3>}
      {children}
      {dica && <p className="ep-pl-dica">{dica}</p>}
    </section>
  );
}

export function LinhaCampos({ children }) {
  return <div className="ep-pl-linha">{children}</div>;
}

export function BotaoPainel({ icon, children, onClick, disabled, primario, titulo, ativo }) {
  return (
    <button
      type="button"
      className={`ep-pl-btn${primario ? " ep-pl-btn--primario" : ""}${ativo ? " ep-ativo" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      aria-label={titulo}
      aria-pressed={ativo === undefined ? undefined : Boolean(ativo)}
      onMouseDown={(e) => e.preventDefault()}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

export function Interruptor({ rotulo, marcado, onChange, disabled, detalhe }) {
  return (
    <label className="ep-pl-interruptor">
      <input type="checkbox" checked={Boolean(marcado)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {rotulo}
        {detalhe && <small>{detalhe}</small>}
      </span>
    </label>
  );
}

export function AvisoPainel({ children }) {
  return (
    <p className="ep-pl-aviso" role="status">
      {children}
    </p>
  );
}

export function PropostaAntesDepois({ antes, depois, onAceitar, onRejeitar, desabilitado }) {
  return (
    <div className="ep-pl-proposta">
      <div className="ep-pl-proposta-bloco">
        <b>Antes</b>
        <p>{antes}</p>
      </div>
      <div className="ep-pl-proposta-bloco ep-pl-proposta-bloco--depois">
        <b>Depois</b>
        <p>{depois}</p>
      </div>
      <LinhaCampos>
        <BotaoPainel primario icon="check" onClick={onAceitar} disabled={desabilitado}>
          Aceitar
        </BotaoPainel>
        <BotaoPainel icon="x" onClick={onRejeitar}>
          Rejeitar
        </BotaoPainel>
      </LinhaCampos>
    </div>
  );
}
