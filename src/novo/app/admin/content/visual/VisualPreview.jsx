// Prévia do material visual: o MESMO HTML e a MESMA conferência da geração final (src/shared/visualMaterials),
// numa moldura isolada (iframe com sandbox, sem acesso à página). As fontes vão uma vez pela FontFace API; a cada
// mudança vão só as pranchas, e a moldura devolve a conferência (texto cortado, linhas, zonas seguras…).
import React from "react";
import { Banner } from "../../../../ds";
import { previewShellHtml, renderArtboards, VISUAL_MODELS } from "../../../../../shared/visualMaterials";
import { loadVisualFonts } from "./visualFonts.js";
import { explainError } from "../../../../../shared/errors/explicarErro";

const SHELL = previewShellHtml();

/** Mostra só o lado escolhido, sem tirar o outro da página (ele continua sendo conferido). O !important vence o
 * position:relative escrito na própria prancha; sem ele, o lado escondido ocupava o lugar e empurrava o outro para fora. */
const HIDE_CSS = ".vm-hidden{position:absolute!important;left:-30000px!important;top:0!important}";

export function VisualPreview({ content, side = "front", guides = false, images = {}, onReport, maxWidth = 460 }) {
  const frame = React.useRef(null);
  const box = React.useRef(null);
  const [ready, setReady] = React.useState({ shell: false, fonts: false });
  const [error, setError] = React.useState(null);
  const [width, setWidth] = React.useState(maxWidth);
  const seq = React.useRef(0);
  const info = VISUAL_MODELS[content?.model] ?? VISUAL_MODELS.feed;
  const shown = info.pair ? side : "single";

  // largura disponível
  React.useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.min(maxWidth, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxWidth]);

  // mensagens da moldura
  React.useEffect(() => {
    const onMessage = (e) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const m = e.data || {};
      if (m.type === "visual-shell-ready") {
        setReady((r) => ({ ...r, shell: true }));
        loadVisualFonts().then(
          (faces) => frame.current?.contentWindow?.postMessage({ type: "fonts", faces }, "*"),
          (err) => setError(explainError(err))
        );
      }
      if (m.type === "visual-fonts-ready") setReady((r) => ({ ...r, fonts: true }));
      if (m.type === "visual-report" && m.id === seq.current) onReport?.(m.report);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onReport]);

  // pranchas a cada mudança (com um pequeno intervalo para não redesenhar a cada tecla)
  React.useEffect(() => {
    if (!ready.fonts || !content) return undefined;
    const t = setTimeout(() => {
      const arts = renderArtboards(content, { guides, images, preview: true });
      const html =
        `<style>${HIDE_CSS}</style>` +
        arts.map((a) => (a.side === shown || !info.pair ? a.html : a.html.replace('class="vm-artboard"', 'class="vm-artboard vm-hidden"'))).join("");
      seq.current += 1;
      frame.current?.contentWindow?.postMessage({ type: "render", id: seq.current, html, model: content.model }, "*");
    }, 160);
    return () => clearTimeout(t);
  }, [ready.fonts, content, guides, images, shown, info.pair]);

  const scale = width / info.width;
  return (
    <div ref={box} style={{ width: "100%", maxWidth }}>
      {error && <Banner tone="danger">Prévia indisponível: {error}</Banner>}
      <div
        style={{ width, height: Math.ceil(info.height * scale), overflow: "hidden", borderRadius: 12, boxShadow: "var(--shadow-md, 0 2px 10px rgba(13,28,66,.12))", background: "#fff", position: "relative" }}
        aria-label={`Prévia: ${info.label}${info.pair ? ` (${shown === "front" ? "frente" : "verso"})` : ""}`}
        role="img"
      >
        <iframe
          ref={frame}
          title="Prévia do material visual"
          sandbox="allow-scripts"
          srcDoc={SHELL}
          style={{ width: info.width, height: info.height, border: 0, transform: `scale(${scale})`, transformOrigin: "0 0", display: "block", pointerEvents: "none" }}
        />
        {!ready.fonts && !error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", font: "var(--type-body-sm)" }}>Carregando a prévia…</div>
        )}
      </div>
    </div>
  );
}
