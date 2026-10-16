// Módulo "revisao" do editor profissional (M6, onda 1): localizar e substituir, contagem, ortografia do navegador em pt-BR e
// autocorreção configurável. O painel lateral reaproveitável (para o M7 IA) está em ../revisao/painelLateral.jsx.
// Comentários (migração 013050) ficam para a onda 2. Nada daqui entra no documento: sem nós, marcas ou atributos novos.
import React from "react";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { registrarModuloEditor } from "../registroEditor.js";
import { Botao } from "../ui.jsx";
import { Localizar, estadoLocalizar } from "../revisao/localizar.js";
import { Autocorrecao } from "../revisao/autocorrecao.js";
import { contarEditor } from "../revisao/contagem.js";
import { assinarPrefs, definirPrefs, prefs } from "../revisao/preferencias.js";
import PainelLocalizar from "../revisao/PainelLocalizar.jsx";
import PainelRevisao, { usePrefsRevisao } from "../revisao/PainelRevisao.jsx";
import "../revisao/revisao.css";

// Liga o corretor do navegador (atributo spellcheck, lang pt-BR já vem da casca) conforme a preferência de quem edita.
const OrtografiaNavegador = Extension.create({
  name: "ortografiaNavegador",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("ortografiaNavegador"),
        view(view) {
          const aplicar = () => {
            view.dom.setAttribute("spellcheck", prefs().ortografia ? "true" : "false");
            view.dom.setAttribute("lang", "pt-BR");
          };
          aplicar();
          const cancelar = assinarPrefs(aplicar);
          return { destroy: cancelar };
        },
      }),
    ];
  },
});

function BotaoPref({ chave, icon, label }) {
  const p = usePrefsRevisao();
  return <Botao icon={icon} label={`${label}: ${p[chave] ? "ligada" : "desligada"}`} ativo={p[chave]} onClick={() => definirPrefs({ [chave]: !p[chave] })} />;
}

function ResumoPalavras({ editor }) {
  const { tudo } = contarEditor(editor);
  return <span className="ep-resumo-btn" title="Contagem de palavras (detalhes no painel Contagem e correção)">{tudo.palavras} palavras</span>;
}

registrarModuloEditor({
  id: "revisao",
  extensoes: () => [Localizar, Autocorrecao, OrtografiaNavegador],
  botoes: [
    {
      id: "revisaoLocalizarAbrir", aba: "revisao", grupo: "localizar", rotuloGrupo: "Localizar", ordem: 5,
      Componente: ({ ctx }) => (
        <Botao icon="search" label="Localizar e substituir (Ctrl+F)" ativo={ctx.painelAberto === "revisao-localizar"} onClick={() => ctx.abrirPainel?.("revisao-localizar")} />
      ),
    },
    {
      id: "revisaoLocalizarProx", aba: "revisao", grupo: "localizar", ordem: 10,
      Componente: ({ editor }) => (
        <Botao icon="chevron-down" label="Próximo resultado da busca" disabled={estadoLocalizar(editor.state).achados.length === 0} onClick={() => editor.commands.buscarProximo()} />
      ),
    },
    {
      id: "revisaoLocalizarAnt", aba: "revisao", grupo: "localizar", ordem: 20,
      Componente: ({ editor }) => (
        <Botao icon="chevron-up" label="Resultado anterior da busca" disabled={estadoLocalizar(editor.state).achados.length === 0} onClick={() => editor.commands.buscarAnterior()} />
      ),
    },
    {
      id: "revisaoLocalizarLimpar", aba: "revisao", grupo: "localizar", ordem: 30,
      Componente: ({ editor }) => (
        <Botao icon="eraser" label="Limpar marcações da busca" disabled={!estadoLocalizar(editor.state).termo} onClick={() => editor.commands.limparBusca()} />
      ),
    },
    { id: "revisaoOrtografia", aba: "revisao", grupo: "correcao", rotuloGrupo: "Correção", ordem: 110, Componente: () => <BotaoPref chave="ortografia" icon="spell-check" label="Ortografia do navegador" /> },
    { id: "revisaoAutocorrecao", aba: "revisao", grupo: "correcao", ordem: 120, Componente: () => <BotaoPref chave="autocorrecao" icon="wand-sparkles" label="Autocorreção de símbolos" /> },
    { id: "revisaoPalavras", aba: "revisao", grupo: "contagem", rotuloGrupo: "Contagem", ordem: 210, Componente: ResumoPalavras },
  ],
  paineis: [
    { id: "revisao-localizar", titulo: "Localizar e substituir", icone: "search", atalho: "Mod-f", Componente: PainelLocalizar },
    { id: "revisao-contagem", titulo: "Contagem e correção", icone: "spell-check", Componente: PainelRevisao },
  ],
});
