// Módulo "insercao" do editor profissional (M4): símbolos, data e hora e janela de hiperlink.
// Símbolos e datas entram como texto comum (nada novo no documento); o link usa a marca "link" do núcleo (só https).
import React from "react";
import { registrarModuloEditor } from "../registroEditor.js";
import { Botao } from "../ui.jsx";
import { formatarDataHora } from "../../../../shared/docRico/modulos/insercao";
import PainelSimbolos from "../insercao/PainelSimbolos.jsx";
import PainelDataHora from "../insercao/PainelDataHora.jsx";
import PainelLink from "../insercao/PainelLink.jsx";
import "../tabelas/tabelas.css";

const RAPIDOS = ["µ", "±", "°", "≥", "≤", "→"];
const rapido = (s, i) => ({
  id: `sim-${i}`,
  aba: "inserir",
  grupo: "simbolos",
  ordem: 400 + i,
  rotuloGrupo: "Símbolos",
  Componente: ({ editor, ctx }) => (
    <Botao label={s} disabled={ctx.somenteLeitura} onClick={() => editor.chain().focus().insertContent(s).run()} />
  ),
});

registrarModuloEditor({
  id: "insercao",
  paineis: [
    { id: "simbolos", titulo: "Símbolos", icone: "omega", Componente: PainelSimbolos },
    { id: "hiperlink", titulo: "Hiperlink", icone: "link", Componente: PainelLink },
    { id: "datahora", titulo: "Data e hora", icone: "calendar", Componente: PainelDataHora },
  ],
  botoes: [
    ...RAPIDOS.map(rapido),
    {
      id: "sim-remover-link",
      aba: "inserir",
      grupo: "links",
      ordem: 500,
      rotuloGrupo: "Links",
      Componente: ({ editor, ctx }) => (
        <Botao
          icon="unlink"
          label="Remover link"
          disabled={ctx.somenteLeitura || !editor.isActive("link")}
          onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
        />
      ),
    },
    {
      id: "data-hoje",
      aba: "inserir",
      grupo: "datahora",
      ordem: 600,
      rotuloGrupo: "Data e hora",
      Componente: ({ editor, ctx }) => (
        <Botao icon="calendar" label="Inserir a data de hoje" disabled={ctx.somenteLeitura} onClick={() => editor.chain().focus().insertContent(formatarDataHora(new Date(), "curta")).run()} />
      ),
    },
    {
      id: "hora-agora",
      aba: "inserir",
      grupo: "datahora",
      ordem: 610,
      Componente: ({ editor, ctx }) => (
        <Botao icon="clock" label="Inserir a hora de agora" disabled={ctx.somenteLeitura} onClick={() => editor.chain().focus().insertContent(formatarDataHora(new Date(), "hora")).run()} />
      ),
    },
  ],
});
