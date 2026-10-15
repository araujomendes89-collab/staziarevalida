// Visual principal do mapa: pôster realista (imagem 3:2). Ampliável (tela cheia com zoom), download opcional.
// O texto do mapa (JSON) vira descrição longa para leitores de tela e fica pesquisável no modo Aprofundado.
// Estado de revisão e ressalvas da imagem ficam só nos dados: nunca aparecem aqui.
import React from "react";
import { textoVisivel } from "./mapas.js";
import { MapaIcon } from "./icones.jsx";

export function PosterImagem({ mapa, onErro }) {
  const [cheia, setCheia] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const url = mapa.poster.webp;
  const descId = React.useId();
  const fechar = React.useCallback(() => { setCheia(false); setZoom(1); }, []);
  React.useEffect(() => {
    if (!cheia) return undefined;
    const k = (e) => { if (e.key === "Escape") fechar(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [cheia, fechar]);

  return (
    <figure className="mm-pimg">
      <button type="button" className="mm-pimg-abrir" onClick={() => setCheia(true)} aria-label={`Ampliar o mapa mental: ${mapa.titulo}`}>
        <img src={url} alt={`Mapa mental: ${mapa.titulo}. ${mapa.subtitulo ?? ""}`} aria-describedby={descId} onError={onErro} loading="eager" draggable={false} />
      </button>
      <figcaption id={descId} className="mm-sr">{textoVisivel(mapa)}</figcaption>
      <div className="mm-pimg-acoes">
        <button type="button" onClick={() => setCheia(true)}><MapaIcon nome="lupa" size={16} /> Ampliar</button>
        <a href={url} download={`mapa-mental-${mapa.slug}.webp`}>Baixar imagem</a>
      </div>
      {cheia && (
        <div className="mm-tela-cheia" role="dialog" aria-modal="true" aria-label={`Mapa mental ampliado: ${mapa.titulo}`}>
          <div className="mm-tc-barra">
            <button type="button" onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))} aria-label="Diminuir">−</button>
            <span aria-live="polite">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(4, +(z + 0.5).toFixed(1)))} aria-label="Aumentar">+</button>
            <a href={url} download={`mapa-mental-${mapa.slug}.webp`}>Baixar</a>
            <button type="button" className="mm-tc-fechar" onClick={fechar} autoFocus>Fechar</button>
          </div>
          <div className="mm-tc-area">
            <img src={url} alt={`Mapa mental: ${mapa.titulo}`} style={{ width: `max(${zoom * 100}%, ${zoom * 900}px)` }} draggable={false} />
          </div>
        </div>
      )}
    </figure>
  );
}
