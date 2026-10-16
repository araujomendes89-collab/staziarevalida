// Editor profissional (estilo Word), só na Administração. É uma casca: abas, botões, painéis e extensões vêm dos módulos
// registrados em ./modulos.js (cada módulo no próprio arquivo). Entra e sai o documento rico (src/shared/docRico), saneado.
import React from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { ABAS, ROTULOS_GRUPO, botoesDaAba, extensoesDe, paineis } from "./registroEditor.js";
import { sanear } from "../../../shared/docRico";
import { Botao, Grupo } from "./ui.jsx";
import { Icon } from "../../ds";
import "./modulos.js";
import "../textoRico/textoRico.css";
import "./editorPro.css";

/**
 * valor: documento rico ({ type: "doc", content }) · aoMudar(doc saneado, com "ref" nos blocos)
 * config / aoMudarConfig: configuração do documento inteiro (página, estilos...), uma chave por módulo.
 * contexto: dados da tela para os módulos (ex.: { versionId }). aoCriar(editor): para testes e telas que precisam do editor.
 * Os botões e painéis recebem ctx = { config, mudarConfig, contexto, somenteLeitura, abrirPainel(id), fecharPainel(), painelAberto }.
 * Painel com "atalho" (ex.: "Mod-f") abre com Ctrl/Cmd + a tecla, com o cursor no primeiro campo.
 */
export default function EditorDocumento({ valor, aoMudar, config = {}, aoMudarConfig, contexto, somenteLeitura = false, rotulo, id, aoCriar }) {
  const [aba, setAba] = React.useState("inicio");
  const [painel, setPainel] = React.useState(null);
  const ultimo = React.useRef(JSON.stringify(valor ?? null));
  const aoMudarRef = React.useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  const ctxInicial = React.useRef({ config, contexto, somenteLeitura });

  const editor = useEditor({
    extensions: extensoesDe(ctxInicial.current),
    content: valor,
    editable: !somenteLeitura,
    editorProps: { attributes: { class: "ep-folha tr-doc", role: "textbox", "aria-multiline": "true", ...(rotulo ? { "aria-label": rotulo } : {}), spellcheck: "true", lang: "pt-BR" } },
    onUpdate: ({ editor: e }) => {
      const doc = sanear(e.getJSON());
      const s = JSON.stringify(doc);
      if (s === ultimo.current) return;
      ultimo.current = s;
      aoMudarRef.current?.(doc);
    },
  });
  // a barra se redesenha a cada mudança (botões ativos/desligados)
  useEditorState({ editor, selector: (snap) => snap.transactionNumber });

  React.useEffect(() => {
    if (editor) aoCriar?.(editor);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps
  // valor trocado por fora (Cancelar, outra aula): recarrega sem marcar como alteração
  React.useEffect(() => {
    const s = JSON.stringify(valor ?? null);
    if (!editor || s === ultimo.current) return;
    ultimo.current = s;
    editor.commands.setContent(valor, { emitUpdate: false });
  }, [editor, valor]);
  React.useEffect(() => {
    if (editor && editor.isEditable === somenteLeitura) editor.setEditable(!somenteLeitura);
  }, [editor, somenteLeitura]);

  // painel lateral aberto por botão de módulo ou atalho (ex.: Ctrl+F abre "Localizar e substituir" e põe o cursor no campo)
  const painelRef = React.useRef(null);
  const [focarPainel, setFocarPainel] = React.useState(0);
  const abrirPainel = (pid, { focar = true } = {}) => {
    if (!paineis().some((p) => p.id === pid)) return false;
    setPainel(pid);
    if (focar) setFocarPainel((n) => n + 1);
    return true;
  };
  React.useEffect(() => {
    if (!focarPainel) return;
    const campo = painelRef.current?.querySelector("input:not([disabled]), textarea:not([disabled]), select:not([disabled])");
    campo?.focus();
    campo?.select?.();
  }, [focarPainel]);
  const aoTeclar = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const tecla = String(e.key || "").toLowerCase();
    const alvo = paineis().find((p) => typeof p.atalho === "string" && p.atalho.toLowerCase() === `mod-${tecla}`);
    if (alvo && abrirPainel(alvo.id)) e.preventDefault();
  };

  const ctx = {
    config,
    mudarConfig: (chave, v) => aoMudarConfig?.({ ...config, [chave]: v }),
    contexto,
    somenteLeitura,
    abrirPainel,
    fecharPainel: () => setPainel(null),
    painelAberto: painel,
  };
  if (!editor) return null;

  const abas = ABAS.filter((a) => botoesDaAba(a.id).length > 0);
  const grupos = [];
  for (const b of botoesDaAba(aba)) {
    const g = grupos[grupos.length - 1];
    if (g && g.id === b.grupo) g.botoes.push(b);
    else grupos.push({ id: b.grupo, botoes: [b] });
  }
  const listaPaineis = paineis();
  const aberto = listaPaineis.find((p) => p.id === painel);

  return (
    <div className="ep-container" id={id} onKeyDown={aoTeclar}>
      <div className="ep-toolbar">
        <div className="ep-tablist" role="tablist" aria-label="Abas do editor">
          {abas.map((a) => (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={`ep-tab${aba === a.id ? " ep-tab--ativa" : ""}`} onClick={() => setAba(a.id)}>
              {a.rotulo}
            </button>
          ))}
          {listaPaineis.length > 0 && (
            <div className="ep-paineis-btn">
              {listaPaineis.map((p) => (
                <Botao key={p.id} icon={p.icone} label={p.atalho ? `${p.titulo} (${p.atalho.replace(/^mod-/i, "Ctrl+").toUpperCase().replace("CTRL+", "Ctrl+")})` : p.titulo} ativo={painel === p.id} onClick={() => setPainel(painel === p.id ? null : p.id)} />
              ))}
            </div>
          )}
        </div>
        <div className="ep-tools" role="toolbar" aria-label="Ferramentas do editor">
          {grupos.map((g, i) => (
            <React.Fragment key={g.id}>
              {i > 0 && <span className="ep-sep" aria-hidden="true" />}
              <Grupo rotulo={ROTULOS_GRUPO[g.id] ?? g.id}>
                {g.botoes.map(({ id: bid, Componente }) => <Componente key={bid} editor={editor} ctx={ctx} />)}
              </Grupo>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="ep-corpo">
        <div className="ep-area-texto">
          <EditorContent editor={editor} />
        </div>
        {aberto && (
          <aside className="ep-painel" aria-label={aberto.titulo} ref={painelRef}>
            <div className="ep-painel-header">
              {aberto.titulo}
              <button type="button" className="ep-painel-fechar" onClick={() => setPainel(null)} aria-label="Fechar painel">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="ep-painel-corpo">
              <aberto.Componente editor={editor} ctx={ctx} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
