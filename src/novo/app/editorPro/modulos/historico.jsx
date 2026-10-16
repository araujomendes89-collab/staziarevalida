// Módulo "historico" do editor profissional: salvamento automático de rascunhos, trava de edição e histórico de versões.
import { Extension } from "@tiptap/core";
import { registrarModuloEditor } from "../registroEditor.js";
import { ControleHistorico, controleDe } from "../historico/controle.js";
import IndicadorRascunho from "../historico/IndicadorRascunho.jsx";
import PainelHistorico from "../historico/PainelHistorico.jsx";
import "../historico/historico.css";

export const ExtensaoHistorico = Extension.create({
  name: "historicoRascunho",
  addOptions: () => ({
    contexto: null,
    somenteLeitura: false,
  }),
  addStorage: () => ({
    controle: null,
  }),
  // beforeCreate é síncrono (o evento "create" do TipTap chega depois): o controle já existe quando a barra se desenha
  onBeforeCreate() {
    if (this.options.contexto?.versionId) {
      this.storage.controle = new ControleHistorico({
        editor: this.editor,
        contexto: this.options.contexto,
        somenteLeitura: this.options.somenteLeitura,
      });
    }
  },
  onUpdate() {
    this.storage.controle?.aoMudar();
  },
  onDestroy() {
    this.storage.controle?.desligar();
  },
});

registrarModuloEditor({
  id: "historico",
  extensoes: (ctx) => [
    ExtensaoHistorico.configure({
      contexto: ctx?.contexto,
      somenteLeitura: ctx?.somenteLeitura,
    }),
  ],
  botoes: [
    {
      id: "rascunho",
      aba: "inicio",
      grupo: "salvamento",
      rotuloGrupo: "Rascunho",
      ordem: 900,
      Componente: IndicadorRascunho,
    },
  ],
  paineis: [
    {
      id: "historico",
      titulo: "Histórico de versões",
      icone: "history",
      Componente: PainelHistorico,
    },
  ],
});

export { controleDe, ControleHistorico, IndicadorRascunho, PainelHistorico };
