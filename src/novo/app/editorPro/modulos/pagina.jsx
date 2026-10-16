// Módulo "pagina" do editor profissional (StaziaMed Revalida).
// Extensão TipTap de quebra de página, botões de layout e painel de configuração e prévia de PDF.

import React from "react";
import { Extension } from "@tiptap/core";
import { registrarModuloEditor } from "../registroEditor.js";
import { Botao, Seletor } from "../ui.jsx";
import { sanearPagina, PAGINA_PADRAO } from "../../../../shared/docRico/modulos/pagina";
import { PainelPagina } from "../pagina/PainelPagina.jsx";
import "../pagina/pagina.css";

export const QuebraPagina = Extension.create({
  name: "quebraPagina",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          quebraPagina: {
            default: false,
            keepOnSplit: false,
            parseHTML: (el) => el.getAttribute("data-quebra-pagina") === "true",
            renderHTML: (a) => (a.quebraPagina ? { "data-quebra-pagina": "true" } : {}),
          },
        },
      },
    ];
  },
});

const OPCOES_TAMANHO = [
  { valor: "A4", rotulo: "A4" },
  { valor: "A5", rotulo: "A5" },
  { valor: "Carta", rotulo: "Carta" },
  { valor: "Oficio", rotulo: "Ofício" },
];

const OPCOES_ORIENTACAO = [
  { valor: "retrato", rotulo: "Retrato" },
  { valor: "paisagem", rotulo: "Paisagem" },
];

const PRESETS_MARGENS = {
  padrao: { topo: 16, base: 18, esquerda: 13, direita: 13, rotulo: "Padrão do app" },
  estreita: { topo: 13, base: 13, esquerda: 13, direita: 13, rotulo: "Estreita" },
  normal: { topo: 25, base: 25, esquerda: 25, direita: 25, rotulo: "Normal" },
  larga: { topo: 25, base: 25, esquerda: 38, direita: 38, rotulo: "Larga" },
};

function chaveMargens(m) {
  if (!m) return "padrao";
  for (const [k, v] of Object.entries(PRESETS_MARGENS)) {
    if (v.topo === m.topo && v.base === m.base && v.esquerda === m.esquerda && v.direita === m.direita) {
      return k;
    }
  }
  return "personalizada";
}

registrarModuloEditor({
  id: "pagina",
  extensoes: () => [QuebraPagina],
  botoes: [
    {
      id: "pagina-tamanho",
      aba: "layout",
      grupo: "pagina",
      rotuloGrupo: "Página",
      ordem: 10,
      Componente: ({ ctx }) => {
        const pg = sanearPagina(ctx.config?.pagina) ?? PAGINA_PADRAO;
        return (
          <Seletor
            label="Tamanho da página"
            value={pg.tamanho}
            opcoes={OPCOES_TAMANHO}
            disabled={ctx.somenteLeitura}
            onChange={(val) => ctx.mudarConfig?.("pagina", { ...pg, tamanho: val })}
          />
        );
      },
    },
    {
      id: "pagina-orientacao",
      aba: "layout",
      grupo: "pagina",
      rotuloGrupo: "Página",
      ordem: 20,
      Componente: ({ ctx }) => {
        const pg = sanearPagina(ctx.config?.pagina) ?? PAGINA_PADRAO;
        return (
          <Seletor
            label="Orientação da página"
            value={pg.orientacao}
            opcoes={OPCOES_ORIENTACAO}
            disabled={ctx.somenteLeitura}
            onChange={(val) => ctx.mudarConfig?.("pagina", { ...pg, orientacao: val })}
          />
        );
      },
    },
    {
      id: "pagina-margens",
      aba: "layout",
      grupo: "pagina",
      rotuloGrupo: "Página",
      ordem: 30,
      Componente: ({ ctx }) => {
        const pg = sanearPagina(ctx.config?.pagina) ?? PAGINA_PADRAO;
        const chaveAtual = chaveMargens(pg.margens);
        const opcoes = [
          { valor: "padrao", rotulo: "Padrão do app" },
          { valor: "estreita", rotulo: "Estreita" },
          { valor: "normal", rotulo: "Normal" },
          { valor: "larga", rotulo: "Larga" },
        ];
        if (chaveAtual === "personalizada") {
          opcoes.push({ valor: "personalizada", rotulo: "Personalizada" });
        }
        return (
          <Seletor
            label="Margens da página"
            value={chaveAtual}
            opcoes={opcoes}
            disabled={ctx.somenteLeitura}
            onChange={(val) => {
              const preset = PRESETS_MARGENS[val];
              if (preset) {
                ctx.mudarConfig?.("pagina", {
                  ...pg,
                  margens: {
                    topo: preset.topo,
                    base: preset.base,
                    esquerda: preset.esquerda,
                    direita: preset.direita,
                  },
                });
              }
            }}
          />
        );
      },
    },
    {
      id: "pagina-quebra",
      aba: "layout",
      grupo: "pagina",
      rotuloGrupo: "Página",
      ordem: 40,
      Componente: ({ editor, ctx }) => {
        const bloqueado =
          ctx.somenteLeitura ||
          editor.isActive("heading", { level: 2 }) ||
          editor.isActive("table") ||
          editor.isActive("bulletList") ||
          editor.isActive("orderedList") ||
          !(editor.isActive("paragraph") || editor.isActive("heading"));

        const ativo =
          Boolean(editor.getAttributes("paragraph")?.quebraPagina) ||
          Boolean(editor.getAttributes("heading")?.quebraPagina);

        const alternar = () => {
          if (bloqueado) return;
          const novo = !ativo;
          if (editor.isActive("paragraph")) {
            editor.chain().focus().updateAttributes("paragraph", { quebraPagina: novo }).run();
          } else if (editor.isActive("heading")) {
            editor.chain().focus().updateAttributes("heading", { quebraPagina: novo }).run();
          }
        };

        return (
          <Botao
            label="Quebra de página"
            ativo={ativo}
            disabled={bloqueado}
            onClick={alternar}
          />
        );
      },
    },
  ],
  paineis: [
    {
      id: "pagina",
      titulo: "Página e PDF",
      icone: "file-text",
      Componente: PainelPagina,
    },
  ],
});
