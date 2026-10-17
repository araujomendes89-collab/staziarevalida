import React from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { estiloReact } from "../../../../shared/docRico";
import {
  cssMoldura,
  cssImagem,
  ehQuadrado,
  OPCOES_FIGURA,
} from "../../../../shared/docRico/modulos/imagens";
import { ContextoFiguras, srcParaEquipe, backendPadrao } from "./fonteImagens.js";
import { abrirPainelDo } from "./ctxEditor.js";
import { useOptionalSession } from "../../session.jsx";
import "./figura.css";

export function VistaFigura(props) {
  const { node, editor, updateAttributes, selected, getPos } = props;
  const attrs = node?.attrs || {};

  const ctxFiguras = React.useContext(ContextoFiguras);
  const sessao = useOptionalSession();

  // o número "Figura N" depende das outras figuras: redesenha a cada mudança do documento
  const [, redesenhar] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    if (!editor) return undefined;
    editor.on("update", redesenhar);
    return () => editor.off("update", redesenhar);
  }, [editor]);

  const selecionarEsta = () => {
    const pos = typeof getPos === "function" ? getPos() : null;
    if (typeof pos === "number") editor.commands.setNodeSelection(pos);
  };

  const [src, setSrc] = React.useState(null);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState(false);

  React.useEffect(() => {
    let cancelado = false;
    if (!attrs.asset) {
      setCarregando(false);
      setErro(true);
      return;
    }

    setCarregando(true);
    setErro(false);

    (async () => {
      try {
        let url = null;
        if (ctxFiguras?.carregar) {
          url = await ctxFiguras.carregar(attrs.asset);
        } else {
          const backend = sessao?.backend || (await backendPadrao());
          url = await srcParaEquipe(backend, attrs.asset);
        }
        if (cancelado) return;
        if (!url) {
          setErro(true);
        } else {
          setSrc(url);
        }
      } catch {
        if (!cancelado) setErro(true);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [attrs.asset, ctxFiguras, sessao?.backend]);

  // Número da figura contando figuras anteriores com legenda
  let numero = null;
  const temLegenda = Boolean(attrs.legenda && String(attrs.legenda).trim());
  if (temLegenda && typeof getPos === "function" && editor?.state?.doc) {
    const minhaPos = getPos();
    let cont = 0;
    editor.state.doc.descendants((no, pos) => {
      if (no.type.name === "figura") {
        const leg = no.attrs?.legenda;
        if (typeof leg === "string" && leg.trim()) {
          if (pos < minhaPos) {
            cont++;
          }
        }
      }
    });
    numero = cont + 1;
  }

  const semAlt = !attrs.alt || !String(attrs.alt).trim();
  const larguraAtual = typeof attrs.largura === "number" ? attrs.largura : 100;

  const classes = [
    "dr-figura",
    ehQuadrado(attrs) ? "dr-figura--quadrado" : "",
    selected ? "dr-figura--selecionada" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <NodeViewWrapper
      as="figure"
      className={classes}
      data-figura=""
      style={estiloReact(cssMoldura(attrs))}
    >
      {selected && (
        <div className="dr-figura-barra" onClick={(e) => e.stopPropagation()}>
          {[25, 50, 75, 100].map((w) => (
            <button
              key={w}
              type="button"
              className={`ep-btn${larguraAtual === w ? " ep-ativo" : ""}`}
              onClick={() => updateAttributes({ largura: w })}
              title={`Largura ${w}%`}
              aria-label={`Largura ${w}% (barra da imagem)`}
              aria-pressed={larguraAtual === w}
            >
              {w}%
            </button>
          ))}
          <select
            className="ep-select"
            value={attrs.disposicao || "linha"}
            onChange={(e) => updateAttributes({ disposicao: e.target.value })}
            title="Disposição"
            aria-label="Disposição da imagem"
          >
            {OPCOES_FIGURA.disposicoes.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.rotulo}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ep-btn"
            onClick={() => abrirPainelDo(editor, "formatar-imagem")}
            title="Formatar imagem"
          >
            Formatar imagem…
          </button>
        </div>
      )}

      {carregando ? (
        <div className="dr-figura-carregando">Carregando imagem…</div>
      ) : erro || !src ? (
        <div className="dr-figura-erro">Imagem indisponível</div>
      ) : (
        <img
          src={src}
          alt={attrs.alt || ""}
          style={estiloReact(cssImagem(attrs))}
          draggable={false}
        />
      )}

      {temLegenda && (
        <figcaption className="dr-figura-legenda">
          Figura {numero ?? 1} – {attrs.legenda}
        </figcaption>
      )}

      {semAlt && (
        <div className="dr-figura-aviso" role="alert">
          <span>Falta o texto alternativo. Sem ele, a aula não pode ser publicada.</span>
          <button
            type="button"
            className="dr-figura-aviso-btn"
            onClick={(e) => {
              e.stopPropagation();
              selecionarEsta();
              abrirPainelDo(editor, "formatar-imagem");
            }}
          >
            Escrever agora
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}
export default VistaFigura;
