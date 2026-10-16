// Componente de leitura da figura para o aluno (sem TipTap).
import React from "react";
import { estiloReact } from "../../../../shared/docRico";
import { cssMoldura, cssImagem, ehQuadrado } from "../../../../shared/docRico/modulos/imagens";
import { ContextoFiguras, srcParaAluno } from "./fonteImagens.js";
import { useOptionalSession } from "../../session.jsx";
import "./figura.css";

export function FiguraLeitor({ no }) {
  const figureRef = React.useRef(null);
  const [numero, setNumero] = React.useState(null);
  const [zoomAberto, setZoomAberto] = React.useState(false);

  const ctxFiguras = React.useContext(ContextoFiguras);
  const sessao = useOptionalSession();

  const attrs = no?.attrs || {};
  const asset = attrs.asset;
  const alt = typeof attrs.alt === "string" ? attrs.alt : "";
  const legenda = typeof attrs.legenda === "string" ? attrs.legenda.trim() : "";

  const [src, setSrc] = React.useState(null);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState(false);

  // Carregamento da imagem protegida do aluno
  React.useEffect(() => {
    let cancelado = false;
    if (!asset) return undefined;
    setCarregando(true);
    setErro(false);

    (async () => {
      try {
        let url = null;
        if (ctxFiguras?.carregar) {
          url = await ctxFiguras.carregar(asset);
        } else {
          const backend = sessao?.backend;
          if (!backend) {
            throw new Error("Imagem indisponível.");
          }
          url = await srcParaAluno(backend, asset);
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
  }, [asset, ctxFiguras, sessao?.backend]);

  // Numeração da figura calculada na tela (nunca guardada): roda a cada desenho e só muda o estado quando o número muda
  React.useLayoutEffect(() => {
    if (!legenda) return;
    const el = figureRef.current;
    if (!el) return;
    const raiz = el.closest("[data-figuras-raiz]") ?? document;
    const todas = Array.from(raiz.querySelectorAll("figure.dr-figura[data-numerada]"));
    const idx = todas.indexOf(el);
    if (idx !== -1) {
      const n = idx + 1;
      setNumero((antigo) => (antigo !== n ? n : antigo));
    }
  });

  // Fechar zoom no Escape
  React.useEffect(() => {
    if (!zoomAberto) return;
    const aoTeclar = (e) => {
      if (e.key === "Escape") setZoomAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [zoomAberto]);

  // Sem imagem (asset) não desenha nada — depois dos hooks, para não quebrar a ordem deles
  if (!asset) return null;

  const classes = ["dr-figura", ehQuadrado(attrs) ? "dr-figura--quadrado" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <figure
        ref={figureRef}
        className={classes}
        data-numerada={legenda ? "" : undefined}
        style={estiloReact(cssMoldura(attrs))}
      >
        {carregando ? (
          <div className="dr-figura-carregando">Carregando imagem…</div>
        ) : erro || !src ? (
          <div className="dr-figura-erro">Imagem indisponível</div>
        ) : (
          <button
            type="button"
            className="dr-figura-zoom"
            aria-label="Ampliar imagem"
            onClick={() => setZoomAberto(true)}
          >
            <img
              src={src}
              alt={alt}
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              style={estiloReact(cssImagem(attrs))}
            />
          </button>
        )}

        {legenda && (
          <figcaption className="dr-figura-legenda">
            Figura {numero ?? 1} – {legenda}
          </figcaption>
        )}
      </figure>

      {zoomAberto && (
        <div
          className="dr-figura-ampliar"
          role="dialog"
          aria-modal="true"
          aria-label="Imagem ampliada"
          onClick={() => setZoomAberto(false)}
        >
          <div
            className="dr-figura-ampliar-conteudo"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="dr-figura-ampliar-fechar"
              onClick={() => setZoomAberto(false)}
              aria-label="Fechar"
              autoFocus
            >
              Fechar
            </button>
            <img
              src={src}
              alt={alt}
              className="dr-figura-ampliar-img"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />
            {legenda && (
              <p className="dr-figura-ampliar-legenda">
                Figura {numero ?? 1} – {legenda}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
export default FiguraLeitor;
