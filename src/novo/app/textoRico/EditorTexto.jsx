// Editor no estilo Word (só equipe, Administração): barra com desfazer/refazer, negrito, itálico, sublinhado e, no modo
// "documento", títulos, listas, citação e tabela simples. Guarda SEMPRE o "texto com marcas" (src/shared/textoRico): o que
// entra e sai é texto, igual ao que as aulas já usam; texto sem formatação continua idêntico.
import React from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Extension, Node } from "@tiptap/core";
import { doEditor, hrefValido, ler } from "../../../shared/textoRico";
import { Icon } from "../../ds";
import "./textoRico.css";

// Lista dentro de lista não existe no formato guardado: Tab num item não aninha (na tabela, Tab continua indo à próxima célula).
const SemAninhar = Extension.create({
  name: "semAninhar",
  priority: 1000,
  addKeyboardShortcuts() {
    const preso = () => this.editor.isActive("listItem") && !this.editor.isActive("table");
    return { Tab: preso, "Shift-Tab": preso };
  },
});

// Modo "linha": Enter quebra a linha dentro do mesmo parágrafo (como no texto antigo).
const EnterQuebra = Extension.create({
  name: "enterQuebra",
  priority: 1000,
  addKeyboardShortcuts() {
    return { Enter: () => this.editor.commands.setHardBreak() };
  },
});

// Modo "pontos": o documento é uma lista só (um ponto por item).
const DocPontos = Node.create({ name: "doc", topNode: true, content: "bulletList" });

function extensoes(modo) {
  const link = { openOnClick: false, autolink: false, linkOnPaste: false, isAllowedUri: (url) => hrefValido(url) };
  const base = { code: false, codeBlock: false, strike: false, horizontalRule: false, link };
  if (modo === "linha")
    return [StarterKit.configure({ ...base, heading: false, blockquote: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }), EnterQuebra];
  if (modo === "pontos")
    return [StarterKit.configure({ ...base, document: false, heading: false, blockquote: false, orderedList: false }), DocPontos, SemAninhar];
  return [StarterKit.configure({ ...base, heading: { levels: [2, 3] } }), TableKit.configure({ table: { resizable: false } }), SemAninhar];
}

function Botao({ icon, label, ativo, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`tr-btn${ativo ? " tr-btn--ativo" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={ativo === undefined ? undefined : Boolean(ativo)}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

function Barra({ editor, modo }) {
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      podeDesfazer: e.can().undo(),
      podeRefazer: e.can().redo(),
      negrito: e.isActive("bold"),
      italico: e.isActive("italic"),
      sublinhado: e.isActive("underline"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      lista: e.isActive("bulletList"),
      numerada: e.isActive("orderedList"),
      citacao: e.isActive("blockquote"),
      tabela: e.isActive("table"),
      editavel: e.isEditable,
    }),
  });
  const c = () => editor.chain().focus();
  const off = !st.editavel;
  return (
    <div className="tr-barra" role="toolbar" aria-label="Formatação do texto">
      <Botao icon="undo-2" label="Desfazer (Ctrl+Z)" disabled={off || !st.podeDesfazer} onClick={() => c().undo().run()} />
      <Botao icon="redo-2" label="Refazer (Ctrl+Y)" disabled={off || !st.podeRefazer} onClick={() => c().redo().run()} />
      <span className="tr-sep" aria-hidden="true" />
      <Botao icon="bold" label="Negrito (Ctrl+B)" ativo={st.negrito} disabled={off} onClick={() => c().toggleBold().run()} />
      <Botao icon="italic" label="Itálico (Ctrl+I)" ativo={st.italico} disabled={off} onClick={() => c().toggleItalic().run()} />
      <Botao icon="underline" label="Sublinhado (Ctrl+U)" ativo={st.sublinhado} disabled={off} onClick={() => c().toggleUnderline().run()} />
      {modo === "documento" && (
        <>
          <span className="tr-sep" aria-hidden="true" />
          <Botao icon="heading-2" label="Título" ativo={st.h2} disabled={off || st.tabela} onClick={() => c().toggleHeading({ level: 2 }).run()} />
          <Botao icon="heading-3" label="Subtítulo" ativo={st.h3} disabled={off || st.tabela} onClick={() => c().toggleHeading({ level: 3 }).run()} />
          <Botao icon="list" label="Lista com marcadores" ativo={st.lista} disabled={off || st.tabela} onClick={() => c().toggleBulletList().run()} />
          <Botao icon="list-ordered" label="Lista numerada" ativo={st.numerada} disabled={off || st.tabela} onClick={() => c().toggleOrderedList().run()} />
          <Botao icon="text-quote" label="Citação" ativo={st.citacao} disabled={off || st.tabela} onClick={() => c().toggleBlockquote().run()} />
          <span className="tr-sep" aria-hidden="true" />
          {!st.tabela ? (
            <Botao icon="table" label="Inserir tabela (3 × 3)" disabled={off || st.lista || st.numerada || st.citacao} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
          ) : (
            <>
              <Botao icon="between-horizontal-end" label="Linha abaixo" disabled={off} onClick={() => c().addRowAfter().run()} />
              <Botao icon="between-vertical-end" label="Coluna à direita" disabled={off} onClick={() => c().addColumnAfter().run()} />
              <Botao icon="rows-3" label="Apagar linha" disabled={off} onClick={() => c().deleteRow().run()} />
              <Botao icon="columns-3" label="Apagar coluna" disabled={off} onClick={() => c().deleteColumn().run()} />
              <Botao icon="trash-2" label="Apagar tabela" disabled={off} onClick={() => c().deleteTable().run()} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * value/onChange: texto com marcas (string). modo: "documento" | "linha" | "pontos".
 * maxLength só avisa (quem barra é o servidor), contando o texto guardado.
 */
export default function EditorTexto({ value, onChange, modo = "documento", label, hint, maxLength, disabled = false, minRows = 3, id: given, aoCriar }) {
  const auto = React.useId();
  const id = given ?? auto;
  const ultimo = React.useRef(String(value ?? ""));
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const editor = useEditor({
    extensions: extensoes(modo),
    content: ler(value, modo),
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "tr-area tr-doc",
        id,
        role: "textbox",
        "aria-multiline": "true",
        ...(label ? { "aria-labelledby": `${id}-rotulo` } : {}),
        style: `min-height:${Math.max(1, minRows) * 1.6 + 1.5}em`,
      },
    },
    onUpdate: ({ editor: e }) => {
      const texto = doEditor(e.getJSON(), modo);
      if (texto === ultimo.current) return;
      ultimo.current = texto;
      onChangeRef.current?.(texto);
    },
  });
  React.useEffect(() => {
    if (editor) aoCriar?.(editor);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps
  // valor trocado por fora (Cancelar, sugestão do assistente, outra aula): recarrega sem marcar como alteração
  React.useEffect(() => {
    const v = String(value ?? "");
    if (!editor || v === ultimo.current) return;
    ultimo.current = v;
    editor.commands.setContent(ler(v, modo), { emitUpdate: false });
  }, [editor, value, modo]);
  React.useEffect(() => {
    if (editor && editor.isEditable === disabled) editor.setEditable(!disabled);
  }, [editor, disabled]);
  const tamanho = String(value ?? "").length;
  return (
    <div className="sm-field tr-campo">
      {label && (
        <span className="sm-field__label" id={`${id}-rotulo`} onClick={() => editor?.commands.focus()}>
          {label}
        </span>
      )}
      <div className={`tr-caixa${disabled ? " tr-caixa--off" : ""}`}>
        {editor && <Barra editor={editor} modo={modo} />}
        <EditorContent editor={editor} />
      </div>
      {(hint || (maxLength && tamanho > maxLength * 0.9)) && (
        <span className="sm-field__hint" style={maxLength && tamanho > maxLength ? { color: "var(--danger-text)" } : undefined}>
          {hint}
          {maxLength && tamanho > maxLength * 0.9 ? `${hint ? " · " : ""}${tamanho} de ${maxLength} caracteres` : ""}
        </span>
      )}
    </div>
  );
}
