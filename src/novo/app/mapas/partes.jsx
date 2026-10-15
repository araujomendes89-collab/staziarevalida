// Peças de conteúdo compartilhadas pelo mapa empilhado e pelo pôster.
import React from "react";
import { MapaIcon, Emblema } from "./icones.jsx";
import { itemDe } from "./mapas.js";

export function Itens({ itens }) {
  if (!itens?.length) return null;
  return (
    <ul className="mm-ul">
      {itens.map((raw, i) => {
        const { t, tom } = itemDe(raw);
        return (
          <li key={i} className="mm-li" data-tom={tom || undefined}>
            {t}
          </li>
        );
      })}
    </ul>
  );
}

export function Fluxo({ passos }) {
  if (!passos?.length) return null;
  return (
    <ol className="mm-fluxo" aria-label="Sequência de conduta">
      {passos.map((raw, i) => {
        const { t, tom } = itemDe(raw);
        return (
          <li key={i} className="mm-passo-li">
            {i > 0 && <span className="mm-seta" aria-hidden="true"><MapaIcon nome="seta" size={14} sw={2.4} /></span>}
            <span className="mm-passo" data-tom={tom || undefined}>{t}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Revisao({ v }) {
  if (!v) return null;
  return (
    <>
      {v.faixas?.length > 0 && (
        <div className="mm-faixas">
          {v.faixas.map((f, i) => (
            <div key={i} className="mm-faixa">
              <span className="mm-faixa-r">{f.rotulo}</span>
              {f.chip && <span className="mm-faixa-c">{f.chip}</span>}
              <span className="mm-faixa-t">{f.texto}</span>
            </div>
          ))}
        </div>
      )}
      {v.linhas?.length > 0 && (
        <div className="mm-linhas">
          {v.linhas.map((l, i) => (
            <div key={i} className="mm-linha">
              <div className="mm-linha-r">{l.icone && <span className="mm-linha-i"><MapaIcon nome={l.icone} size={20} /></span>}{l.rotulo}</div>
              <Itens itens={l.itens} />
            </div>
          ))}
        </div>
      )}
      <Itens itens={v.itens} />
      <Fluxo passos={v.fluxo} />
    </>
  );
}


/** Imagem central: campo opcional `foto` {webp, avif, foco, alt} (sem texto nem logo dentro da imagem; efeitos de vidro/brilho por CSS).
 *  Sem imagem, ou se ela falhar ao carregar, entra o emblema desenhado em SVG (fallback). */
export function ImagemCentral({ mapa }) {
  const [falhou, setFalhou] = React.useState(false);
  const f = mapa.foto;
  if (!f?.webp || falhou) return <Emblema tipo={mapa.emblema} />;
  return (
    <picture>
      {f.avif && <source srcSet={f.avif} type="image/avif" />}
      <img className="mm-imagem" src={f.webp} alt={f.alt ?? ""} loading="lazy" style={f.foco ? { objectPosition: f.foco } : undefined} onError={() => setFalhou(true)} />
    </picture>
  );
}

