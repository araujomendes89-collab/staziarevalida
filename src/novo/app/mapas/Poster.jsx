// Pôster do mapa mental: proporção fixa 3:2 (como a referência), cartões em posições fixas por composição.
// Tudo escala com a largura (unidades de container); o texto de cada cartão encolhe sozinho se não couber.
import React from "react";
import { MapaIcon } from "./icones.jsx";
import { corDe, pesoDoRamo } from "./mapas.js";
import { Itens, Revisao, ImagemCentral } from "./partes.jsx";

// posições em % da largura (l, w) e da altura (t, h) do pôster
const SLOTS = {
  topL: { l: 2, t: 2, w: 35, h: 21 },
  topC: { l: 47.5, t: 1.5, w: 25.5, h: 21.5 },
  topR: { l: 74, t: 2, w: 24, h: 23 },
  midL1: { l: 2, t: 25, w: 33.5, h: 31 },
  midL2: { l: 2, t: 58, w: 33, h: 28 },
  midR1: { l: 66, t: 27, w: 32, h: 31 },
  midR2: { l: 69, t: 62, w: 29, h: 24 },
  botC: { l: 35, t: 64, w: 33, h: 24 },
};
// composições: quais posições cada composição usa (a de 8 ramos é a da referência; 7 e 6 reaproveitam e alargam)
const COMPOSICOES = {
  8: { ordem: ["topL", "midL1", "midL2", "topR", "midR1", "midR2"], ajustes: {} },
  7: { ordem: ["midL1", "midL2", "topR", "midR1", "midR2"], ajustes: { midL1: { t: 2, h: 36, w: 36 }, midL2: { t: 42, h: 44 } } },
  6: { ordem: ["midL1", "midL2", "midR1", "midR2"], ajustes: { midL1: { t: 2, h: 38, w: 34 }, midL2: { t: 44, h: 42 }, midR1: { t: 2, h: 38, l: 66 }, midR2: { t: 44, h: 40, l: 66, w: 32 } } },
};
// por onde o fio sai do cartão central e onde chega no cartão (% da largura e da altura)
const FIOS = {
  topL: [[37.5, 43], [37, 12]],
  topC: [[50, 41], [50, 23]],
  topR: [[63, 43], [74, 14]],
  midL1: [[36.5, 48], [39, 40]],
  midL2: [[36.5, 58], [35, 71]],
  midR1: [[63.5, 49], [66, 42]],
  midR2: [[63.5, 58], [69, 73]],
  botC: [[50, 63], [50, 65]],
};

export function escolherPosicoes(ramos) {
  const n = Math.min(8, Math.max(6, ramos.length));
  const comp = COMPOSICOES[n];
  const resto = [...ramos];
  const tira = (f) => { const i = resto.findIndex(f); return i >= 0 ? resto.splice(i, 1)[0] : null; };
  const centro = tira((r) => r.lado === "centro") ?? tira((r) => r.id === "tratamento") ?? resto.splice(resto.length - 2, 1)[0];
  const topo = tira((r) => r.lado === "topo") ?? tira((r) => /suspeita|quadro/.test(r.id)) ?? resto.shift();
  const mapa = [];
  mapa.push({ ramo: topo, slot: "topC", geo: SLOTS.topC });
  mapa.push({ ramo: centro, slot: "botC", geo: SLOTS.botC });
  // os cartões mais cheios ficam nas posições maiores
  const geoDe = (slot) => ({ ...SLOTS[slot], ...(comp.ajustes[slot] ?? {}) });
  const slots = [...comp.ordem].sort((a, b) => geoDe(b).w * geoDe(b).h - geoDe(a).w * geoDe(a).h);
  const pesados = [...resto].sort((a, b) => pesoDoRamo(b) - pesoDoRamo(a));
  slots.forEach((slot, i) => { if (pesados[i]) mapa.push({ ramo: pesados[i], slot, geo: geoDe(slot) }); });
  return mapa;
}

function CartaoPoster({ ramo, geo }) {
  const [p, d, l] = corDe(ramo.cor);
  const solido = ramo.cabecalho ? ramo.cabecalho === "solido" : ["azul-forte", "roxo", "laranja"].includes(ramo.cor);
  return (
    <section data-fit className="mm-card mmp-card" data-cab={solido ? "solido" : "suave"} style={{ "--ac": p, "--ac-d": d, "--ac-l": l, left: `${geo.l}%`, top: `${geo.t}%`, width: `${geo.w}%`, height: `${geo.h}%` }} aria-label={ramo.titulo}>
      <header className="mm-card-h">
        <span className="mm-badge"><MapaIcon nome={ramo.icone} size={22} /></span>
        <h3 className="mm-card-t">{ramo.titulo}</h3>
        {ramo.foto?.webp && <img className="mm-figura" src={ramo.foto.webp} alt={ramo.foto.alt ?? ""} loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      </header>
      <div className="mm-card-b"><Revisao v={ramo.revisao} /></div>
    </section>
  );
}

export function Poster({ mapa }) {
  const raiz = React.useRef(null);
  const posicoes = React.useMemo(() => escolherPosicoes(mapa.ramos), [mapa]);
  const palavras = String(mapa.titulo).trim().split(/\s+/);

  // cada cartão e o cartão central encolhem a letra até caber no espaço fixo
  React.useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return undefined;
    const ajustar = () => {
      el.querySelectorAll("[data-fit]").forEach((c) => {
        c.style.fontSize = "";
        let f = 1;
        while (c.scrollHeight > c.clientHeight + 1 && f > 0.55) {
          f -= 0.04;
          c.style.fontSize = `${f}em`;
        }
      });
    };
    ajustar();
    let cancelado = false;
    document.fonts?.ready?.then(() => { if (!cancelado) ajustar(); });
    return () => { cancelado = true; };
  }, [mapa, posicoes]);

  return (
    <div className="mmp-wrap">
      <div className="mmp" ref={raiz}>
        <svg className="mmp-fios" viewBox="0 0 1536 1024" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {posicoes.map(({ ramo, slot }) => {
            const f = FIOS[slot];
            if (!f) return null;
            const [[x1, y1], [x2, y2]] = [f[0].map((v, i) => v * (i ? 10.24 : 15.36)), f[1].map((v, i) => v * (i ? 10.24 : 15.36))];
            const vertical = slot === "topC" || slot === "botC";
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            const d = vertical ? `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}` : `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
            const cor = corDe(ramo.cor)[0];
            return <g key={slot}><path d={d} fill="none" stroke={cor} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" /><circle cx={x2} cy={y2} r="5" fill={cor} /></g>;
          })}
        </svg>
        <div className="mmp-emblema"><ImagemCentral mapa={mapa} /></div>
        {posicoes.map(({ ramo, slot, geo }) => <CartaoPoster key={ramo.id} ramo={ramo} geo={geo} />)}
        <div className="mmp-centro" data-fit>
          <h2 className="mm-center-t"><span>{palavras[0]}</span>{palavras.length > 1 && <em> {palavras.slice(1).join(" ")}</em>}</h2>
          {mapa.subtitulo && <p className="mm-center-s">{mapa.subtitulo}</p>}
          <span className="mm-tag">MAPA MENTAL · STAZIAMED</span>
        </div>
        {mapa.pontos_chave?.length > 0 && (
          <section data-fit className="mmp-pontos" aria-label="Pontos-chave">
            <h3 className="mm-pill"><MapaIcon nome="lampada" size={20} />Pontos-chave</h3>
            <ul className="mm-checks">{mapa.pontos_chave.map((t, i) => <li key={i}><span className="mm-check" aria-hidden="true"><MapaIcon nome="check" size={14} sw={3} /></span>{typeof t === "string" ? t : t.t}</li>)}</ul>
          </section>
        )}
        {mapa.atencao?.length > 0 && (
          <section data-fit className="mmp-atencao" aria-label="Atenção">
            <h3 className="mm-pill"><MapaIcon nome="alerta" size={20} />Atenção</h3>
            <Itens itens={mapa.atencao} />
          </section>
        )}
      </div>
    </div>
  );
}
