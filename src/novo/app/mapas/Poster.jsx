// Pôster do mapa mental: proporção fixa 3:2, oito cartões nas posições da referência do dono.
// Tudo escala com a largura (unidades de container). O texto é curto e grande; se ainda assim não couber,
// a letra encolhe até no mínimo 80%. Conteúdo vem de `mapa.poster` (ver docs/mapas-mentais.md).
import React from "react";
import { MapaIcon } from "./icones.jsx";
import { corDe } from "./mapas.js";
import { ImagemCentral, itemTexto } from "./partes.jsx";

// posição (% da largura: l, w; % da altura: t, h), cor e cabeçalho padrão de cada cartão
export const CARTOES = {
  conceito: { l: 2, t: 2, w: 36, h: 20.5, cor: "azul", icone: "virus" },
  quadro: { l: 45.5, t: 1.5, w: 25, h: 21.5, cor: "vermelho", icone: "estetoscopio" },
  fatores: { l: 73, t: 2, w: 25, h: 23, cor: "amarelo", icone: "alerta" },
  diagnostico: { l: 2, t: 24.5, w: 33, h: 30, cor: "verde", icone: "prancheta" },
  exames: { l: 2, t: 56.5, w: 33, h: 30, cor: "roxo", icone: "microscopio", solido: true },
  conduta: { l: 67.5, t: 27, w: 30.5, h: 31, cor: "azul-forte", icone: "pessoas", solido: true },
  objetivos: { l: 69, t: 60.5, w: 29, h: 24.5, cor: "ciano", icone: "alvo" },
  tratamento: { l: 35.5, t: 64.5, w: 32, h: 23.3, cor: "laranja", icone: "pilula", solido: true },
};
// onde o fio sai da imagem central (% da largura e da altura) e onde chega no cartão
const FIOS = {
  conceito: [[41, 27], [38, 17]],
  quadro: [[50, 25], [49, 22.5]],
  fatores: [[60, 28], [73, 15]],
  diagnostico: [[41.5, 33], [35, 38]],
  exames: [[40, 41], [35, 70]],
  conduta: [[62, 36], [67.5, 40]],
  objetivos: [[62, 40], [69, 72]],
  tratamento: [[50, 63], [50, 65]],
};

export const temPoster = (mapa) => !!mapa.poster && Object.keys(CARTOES).every((k) => mapa.poster[k]);

function Marcadores({ itens, check }) {
  return (
    <ul className={"mmp-lista" + (check ? " mmp-checks" : "")}>
      {itens.map((raw, i) => (
        <li key={i}>
          {check && <span className="mmp-ok" aria-hidden="true"><MapaIcon nome="check" size={14} sw={3} /></span>}
          {itemTexto(raw)}
        </li>
      ))}
    </ul>
  );
}

function Tabela({ linhas }) {
  return (
    <div className="mmp-tab">
      {linhas.map((l, i) => (
        <div key={i} className="mmp-tr">
          <span className="mmp-ti"><MapaIcon nome={l.icone} size={22} /></span>
          <span className="mmp-tr-r">{l.rotulo}</span>
          <span className="mmp-tr-t">{l.texto ? l.texto : (l.itens ?? []).map((t, j) => <span key={j} className="mmp-tr-i">{itemTexto(t)}</span>)}</span>
        </div>
      ))}
    </div>
  );
}

function Cartao({ papel, def, mapa }) {
  const base = CARTOES[papel];
  const c = { ...base, ...def };
  const [p, d, l] = corDe(c.cor);
  const fig = papel === "conceito" ? mapa.foto?.webp : null;
  return (
    <section data-fit className="mm-card mmp-card" data-cab={c.solido ? "solido" : "suave"} data-papel={papel} style={{ "--ac": p, "--ac-d": d, "--ac-l": l, left: `${base.l}%`, top: `${base.t}%`, width: `${base.w}%`, height: `${base.h}%` }} aria-label={c.titulo}>
      <header className="mm-card-h">
        <span className="mm-badge"><MapaIcon nome={c.icone} size={22} /></span>
        <h3 className="mm-card-t">{c.titulo}</h3>
      </header>
      <div className="mm-card-b">
        {c.faixas && (
          <div className="mm-faixas">{c.faixas.map((f, i) => <div key={i} className="mm-faixa"><span className="mm-faixa-r">{f.rotulo}</span><span className="mm-faixa-c">{f.chip}</span><span className="mm-faixa-t">{f.texto}</span></div>)}</div>
        )}
        {c.linhas && (papel === "exames" || c.linhas.some((x) => x.texto) ? <Tabela linhas={c.linhas} /> : <Tabela linhas={c.linhas} />)}
        {c.itens && <Marcadores itens={c.itens} check={papel === "objetivos"} />}
      </div>
      {fig && <img className="mmp-figura" src={fig} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
    </section>
  );
}

export function Poster({ mapa }) {
  const raiz = React.useRef(null);
  const P = mapa.poster;
  const palavras = String(mapa.titulo).trim().split(/\s+/);

  // se mesmo curto não couber, a letra encolhe até no mínimo 80%
  React.useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return undefined;
    const ajustar = () => {
      el.querySelectorAll("[data-fit]").forEach((c) => {
        c.style.fontSize = "";
        let f = 1;
        while (c.scrollHeight > c.clientHeight + 1 && f > 0.8) {
          f -= 0.03;
          c.style.fontSize = `${f}em`;
        }
      });
    };
    ajustar();
    let cancelado = false;
    document.fonts?.ready?.then(() => { if (!cancelado) ajustar(); });
    return () => { cancelado = true; };
  }, [mapa]);

  return (
    <div className="mmp-wrap">
      <div className="mmp" ref={raiz}>
        <svg className="mmp-fios" viewBox="0 0 1536 1024" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {Object.keys(CARTOES).map((papel) => {
            const f = FIOS[papel];
            const [[x1, y1], [x2, y2]] = f.map((pt) => [pt[0] * 15.36, pt[1] * 10.24]);
            const vertical = papel === "quadro" || papel === "tratamento";
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            const d = vertical ? `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}` : `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
            const cor = corDe(P[papel].cor ?? CARTOES[papel].cor)[0];
            return <g key={papel}><path d={d} fill="none" stroke={cor} strokeWidth="3.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" /><circle cx={x2} cy={y2} r="5.5" fill={cor} /></g>;
          })}
        </svg>
        <div className="mmp-emblema"><ImagemCentral mapa={mapa} /></div>
        {Object.keys(CARTOES).map((papel) => <Cartao key={papel} papel={papel} def={P[papel]} mapa={mapa} />)}
        <div className="mmp-centro" data-fit>
          <h2 className="mm-center-t"><span>{palavras[0]}</span>{palavras.length > 1 && <em> {palavras.slice(1).join(" ")}</em>}</h2>
          {mapa.subtitulo && <p className="mm-center-s">{mapa.subtitulo}</p>}
          <span className="mm-tag">MAPA MENTAL · STAZIAMED</span>
        </div>
        <section data-fit className="mmp-pontos" aria-label="Pontos-chave">
          <h3 className="mm-pill"><MapaIcon nome="lampada" size={20} />Pontos-chave</h3>
          <ul className="mm-checks">{mapa.pontos_chave.map((t, i) => <li key={i}><span className="mm-check" aria-hidden="true"><MapaIcon nome="check" size={14} sw={3} /></span>{itemTexto(t)}</li>)}</ul>
        </section>
        <section data-fit className="mmp-atencao" aria-label="Atenção">
          <h3 className="mm-pill"><MapaIcon nome="alerta" size={20} />Atenção</h3>
          <ul className="mm-ul">{mapa.atencao.map((t, i) => <li key={i} className="mm-li">{itemTexto(t)}</li>)}</ul>
        </section>
      </div>
    </div>
  );
}
