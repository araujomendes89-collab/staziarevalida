// Módulo "formatacao" do editor profissional (M1): fonte, tamanho, cor do texto, marca-texto, tachado, sobrescrito, subscrito,
// maiúsculas/minúsculas, limpar formatação e pincel. Formato: src/shared/docRico/modulos/formatacao.ts (lista fechada).
import React from "react";
import { registrarModuloEditor } from "../registroEditor.js";
import { Botao, Seletor } from "../ui.jsx";
import Paleta from "../formatacao/Paleta.jsx";
import { extensoesFormatacao } from "../formatacao/extensoes.js";
import { mudarCaixa, limparFormatacao, copiarFormato, colarFormato, cancelarPincel } from "../formatacao/comandos.js";
import { FONTES, TAMANHOS, CORES_TEXTO, CORES_MARCA_TEXTO } from "../../../../shared/docRico/modulos/formatacao";
import "../formatacao/formatacao.css";

const OPCOES_FONTE = [{ valor: "", rotulo: "Fonte (padrão)" }, ...FONTES.map((f) => ({ valor: f.id, rotulo: f.aviso ? `${f.rotulo} (parecida no celular e no PDF)` : f.rotulo }))];
const OPCOES_TAMANHO = [{ valor: "", rotulo: "Tam." }, ...TAMANHOS.map((n) => ({ valor: `${n}pt`, rotulo: String(n) }))];
const OPCOES_CAIXA = [
  { valor: "", rotulo: "Aa Maiúsc./minúsc." },
  { valor: "sentenca", rotulo: "Primeira letra da frase" },
  { valor: "minusculas", rotulo: "minúsculas" },
  { valor: "maiusculas", rotulo: "MAIÚSCULAS" },
  { valor: "palavras", rotulo: "Cada Palavra Maiúscula" },
  { valor: "alternar", rotulo: "aLTERNAR" },
];

const G = "fonte";
const trava = (ctx) => ctx.somenteLeitura;
const estiloAtual = (editor, nome) => editor.getAttributes("textStyle")[nome] ?? "";
const definirEstilo = (editor, nome, valor) => {
  const c = editor.chain().focus();
  (valor ? c.setMark("textStyle", { [nome]: valor }) : c.setMark("textStyle", { [nome]: null }).removeEmptyTextStyle()).run();
};
const alternar = (id, icon, label, marca, ordem) => ({
  id,
  aba: "inicio",
  grupo: G,
  ordem,
  Componente: ({ editor, ctx }) => (
    <Botao icon={icon} label={label} ativo={editor.isActive(marca)} disabled={trava(ctx)} onClick={() => editor.chain().focus().toggleMark(marca).run()} />
  ),
});

registrarModuloEditor({
  id: "formatacao",
  extensoes: extensoesFormatacao,
  botoes: [
    {
      id: "fonte", aba: "inicio", grupo: G, ordem: 90,
      Componente: ({ editor, ctx }) => (
        <span className="ep-select--fonte"><Seletor label="Nome da fonte" value={estiloAtual(editor, "fontFamily")} opcoes={OPCOES_FONTE} disabled={trava(ctx)} onChange={(v) => definirEstilo(editor, "fontFamily", v)} /></span>
      ),
    },
    {
      id: "tamanho", aba: "inicio", grupo: G, ordem: 95,
      Componente: ({ editor, ctx }) => (
        <span className="ep-select--tamanho"><Seletor label="Tamanho da fonte (pt)" value={estiloAtual(editor, "fontSize")} opcoes={OPCOES_TAMANHO} disabled={trava(ctx)} onChange={(v) => definirEstilo(editor, "fontSize", v)} /></span>
      ),
    },
    alternar("tachado", "strikethrough", "Tachado", "strike", 130),
    alternar("subscrito", "subscript", "Subscrito (H₂O)", "subscript", 140),
    alternar("sobrescrito", "superscript", "Sobrescrito (x²)", "superscript", 150),
    {
      id: "corTexto", aba: "inicio", grupo: G, ordem: 160,
      Componente: ({ editor, ctx }) => (
        <Paleta
          icon="baseline" label="Cor do texto" cores={CORES_TEXTO} corAtual={estiloAtual(editor, "color") || null} desabilitado={trava(ctx)}
          rotuloLimpar="Automático"
          aoEscolher={(v) => definirEstilo(editor, "color", v)} aoLimpar={() => definirEstilo(editor, "color", "")}
        />
      ),
    },
    {
      id: "marcaTexto", aba: "inicio", grupo: G, ordem: 170,
      Componente: ({ editor, ctx }) => (
        <Paleta
          icon="highlighter" label="Marca-texto" cores={CORES_MARCA_TEXTO} corAtual={editor.getAttributes("highlight").color ?? null} desabilitado={trava(ctx)}
          rotuloLimpar="Sem marca-texto"
          aoEscolher={(v) => editor.chain().focus().setMark("highlight", { color: v }).run()} aoLimpar={() => editor.chain().focus().unsetMark("highlight").run()}
        />
      ),
    },
    {
      id: "caixa", aba: "inicio", grupo: G, ordem: 180,
      Componente: ({ editor, ctx }) => (
        <Seletor label="Maiúsculas e minúsculas" value="" opcoes={OPCOES_CAIXA} disabled={trava(ctx)} onChange={(v) => v && mudarCaixa(editor, v)} />
      ),
    },
    {
      id: "limpar", aba: "inicio", grupo: G, ordem: 190,
      Componente: ({ editor, ctx }) => <Botao icon="remove-formatting" label="Limpar formatação" disabled={trava(ctx)} onClick={() => limparFormatacao(editor)} />,
    },
    {
      id: "pincel", aba: "inicio", grupo: "area", rotuloGrupo: "Pincel", ordem: 50,
      Componente: ({ editor, ctx }) => {
        const armado = Boolean(editor.storage.pincel?.marcas);
        const semSelecao = editor.state.selection.empty;
        return (
          <Botao
            icon="paintbrush"
            label={armado ? (semSelecao ? "Pincel ligado: selecione o texto (Esc cancela)" : "Aplicar formatação à seleção") : "Pincel de formatação: copia a formatação do trecho"}
            ativo={armado}
            disabled={trava(ctx)}
            onClick={() => (!armado ? copiarFormato(editor) : semSelecao ? cancelarPincel(editor) : colarFormato(editor))}
          />
        );
      },
    },
  ],
});
