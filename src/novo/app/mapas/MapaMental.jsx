// Mapa Mental do tema: tema central, ramos coloridos, palavras-chave e decisões, desenhado em código (SVG/HTML/CSS).
// Dois níveis: "Revisão" (uma tela, leitura curta) e "Aprofundado" (cada ramo se abre com mais detalhe).
// Alimentado por um JSON por tema (ver docs/mapas-mentais.md). Nada aqui mostra código de tema, referência, link ou página.
import React from "react";
import { MapaIcon, Emblema } from "./icones.jsx";
import { corDe, distribuir, itemDe } from "./mapas.js";
import "./mapas.css";

const LARGURA_ABERTA = 960; // a partir daqui o mapa vira o desenho horizontal com fios curvos

function Itens({ itens }) {
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

function Fluxo({ passos }) {
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

function Revisao({ v }) {
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
              <div className="mm-linha-r">{l.rotulo}</div>
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

function Ramo({ r, modo, aberto, onToggle, setRef }) {
  const [p, d, l] = corDe(r.cor);
  const solido = r.cabecalho ? r.cabecalho === "solido" : ["azul-forte", "roxo", "laranja"].includes(r.cor);
  const deep = r.aprofundado ?? [];
  const corpoId = `mm-deep-${r.id}`;
  return (
    <section ref={setRef} className="mm-card" data-cab={solido ? "solido" : "suave"} data-aberto={aberto || undefined} style={{ "--ac": p, "--ac-d": d, "--ac-l": l }} aria-label={r.titulo}>
      <header className="mm-card-h">
        <span className="mm-badge"><MapaIcon nome={r.icone} size={22} /></span>
        <h3 className="mm-card-t">{r.titulo}</h3>
      </header>
      <div className="mm-card-b">
        <Revisao v={r.revisao} />
        {modo === "aprofundado" && deep.length > 0 && (
          <>
            <button type="button" className="mm-mais" aria-expanded={!!aberto} aria-controls={corpoId} onClick={onToggle}>
              <MapaIcon nome={aberto ? "seta" : "mais"} size={14} sw={2.4} />
              {aberto ? "Recolher" : "Aprofundar"}
            </button>
            {aberto && (
              <div id={corpoId} className="mm-deep">
                {deep.map((b, i) => (
                  <div key={i} className="mm-deep-bloco">
                    <h4>{b.titulo}</h4>
                    <Itens itens={b.itens} />
                    <Fluxo passos={b.fluxo} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** Imagem central: campo opcional `imagem` {url, alt} (sem texto nem logo dentro da imagem; efeitos de vidro/brilho por CSS).
 *  Sem imagem, ou se ela falhar ao carregar, entra o emblema desenhado em SVG (fallback). */
function ImagemCentral({ mapa }) {
  const [falhou, setFalhou] = React.useState(false);
  const url = mapa.imagem?.url;
  if (!url || falhou) return <Emblema tipo={mapa.emblema} />;
  return <img className="mm-imagem" src={url} alt={mapa.imagem.alt ?? ""} loading="lazy" onError={() => setFalhou(true)} />;
}

function Centro({ mapa, setRef }) {
  const palavras = String(mapa.titulo).trim().split(/\s+/);
  const primeira = palavras[0];
  const resto = palavras.slice(1).join(" ");
  return (
    <div className="mm-hero">
      <ImagemCentral mapa={mapa} />
      <div className="mm-center" ref={setRef}>
        <h2 className="mm-center-t">
          <span>{primeira}</span>
          {resto && <em> {resto}</em>}
        </h2>
        {mapa.subtitulo && <p className="mm-center-s">{mapa.subtitulo}</p>}
        <span className="mm-tag">MAPA MENTAL · STAZIAMED</span>
      </div>
    </div>
  );
}

export function MapaMental({ mapa, modoInicial = "revisao" }) {
  const [modo, setModo] = React.useState(modoInicial);
  const [abertos, setAbertos] = React.useState(() => new Set());
  const [largo, setLargo] = React.useState(false);
  const [fios, setFios] = React.useState([]);
  const board = React.useRef(null);
  const centro = React.useRef(null);
  const refs = React.useRef({});
  const { esq, dir, centro: baixo, topo } = React.useMemo(() => distribuir(mapa.ramos), [mapa]);
  const temDeep = mapa.ramos.some((r) => r.aprofundado?.length);

  const trocarModo = (m) => {
    setModo(m);
    if (m === "revisao") setAbertos(new Set());
  };
  const alternar = (id) =>
    setAbertos((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const todosAbertos = mapa.ramos.filter((r) => r.aprofundado?.length).every((r) => abertos.has(r.id));
  const alternarTodos = () => setAbertos(todosAbertos ? new Set() : new Set(mapa.ramos.filter((r) => r.aprofundado?.length).map((r) => r.id)));

  // largura do quadro → desenho horizontal ou empilhado; fios curvos medidos nas posições reais dos cartões
  React.useLayoutEffect(() => {
    const el = board.current;
    if (!el) return undefined;
    const medir = () => {
      const w = el.getBoundingClientRect().width;
      const wide = w >= LARGURA_ABERTA;
      setLargo((a) => (a === wide ? a : wide));
      const c = centro.current;
      if (!wide || !c) {
        setFios((f) => (f.length ? [] : f));
        return;
      }
      const b = el.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      const cx = cr.left - b.left, cy = cr.top - b.top, cw = cr.width, ch = cr.height;
      const out = [];
      const lado = (lista, dirSign) =>
        lista.forEach((r, i) => {
          const n = refs.current[r.id];
          if (!n) return;
          const rr = n.getBoundingClientRect();
          const ey = rr.top - b.top + 34;
          const ex = dirSign < 0 ? rr.right - b.left : rr.left - b.left;
          const sx = dirSign < 0 ? cx : cx + cw;
          const sy = cy + ch * (0.2 + (0.6 * (i + 0.5)) / lista.length);
          const mx = (sx + ex) / 2;
          out.push({ id: r.id, cor: corDe(r.cor)[0], d: `M${sx} ${sy} C${mx} ${sy} ${mx} ${ey} ${ex} ${ey}`, ex, ey });
        });
      lado(esq, -1);
      lado(dir, 1);
      topo.forEach((r) => {
        const n = refs.current[r.id];
        if (!n) return;
        const rr = n.getBoundingClientRect();
        const sx = cx + cw / 2, sy = cy;
        const ex = rr.left - b.left + rr.width / 2, ey = rr.bottom - b.top;
        const my = (sy + ey) / 2;
        out.push({ id: r.id, cor: corDe(r.cor)[0], d: `M${sx} ${sy} C${sx} ${my} ${ex} ${my} ${ex} ${ey}`, ex, ey });
      });
      baixo.forEach((r) => {
        const n = refs.current[r.id];
        if (!n) return;
        const rr = n.getBoundingClientRect();
        const sx = cx + cw / 2, sy = cy + ch;
        const ex = rr.left - b.left + rr.width / 2, ey = rr.top - b.top;
        const my = (sy + ey) / 2;
        out.push({ id: r.id, cor: corDe(r.cor)[0], d: `M${sx} ${sy} C${sx} ${my} ${ex} ${my} ${ex} ${ey}`, ex, ey });
      });
      setFios(out);
    };
    medir();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    Object.values(refs.current).forEach((n) => n && ro.observe(n));
    if (centro.current) ro.observe(centro.current);
    return () => ro.disconnect();
  }, [mapa, esq, dir, baixo, topo, modo, abertos, largo]);

  const ramo = (r) => (
    <Ramo key={r.id} r={r} modo={modo} aberto={abertos.has(r.id)} onToggle={() => alternar(r.id)} setRef={(n) => { refs.current[r.id] = n; }} />
  );
  // empilhado (celular): o centro vem primeiro e os ramos seguem a ordem dos dados
  const ordem = mapa.ramos;

  return (
    <div className="mm" data-modo={modo}>
      <div className="mm-barra">
        <div className="mm-modos" role="group" aria-label="Nível do mapa">
          <button type="button" aria-pressed={modo === "revisao"} onClick={() => trocarModo("revisao")}>Revisão</button>
          <button type="button" aria-pressed={modo === "aprofundado"} onClick={() => trocarModo("aprofundado")} disabled={!temDeep}>Aprofundado</button>
        </div>
        {modo === "aprofundado" && temDeep && (
          <button type="button" className="mm-todos" onClick={alternarTodos}>{todosAbertos ? "Recolher tudo" : "Abrir tudo"}</button>
        )}
        <ul className="mm-legenda" aria-label="Cores do mapa">
          <li data-c="azul">Diagnóstico</li>
          <li data-c="verde">Conduta</li>
          <li data-c="laranja">Atenção</li>
          <li data-c="vermelho">Alerta ou erro comum</li>
        </ul>
      </div>

      <div ref={board} className={"mm-board" + (largo ? " mm-wide" : "")}>
        {largo && (
          <svg className="mm-fios" aria-hidden="true" focusable="false">
            {fios.map((f) => (
              <g key={f.id}>
                <path d={f.d} fill="none" stroke={f.cor} strokeWidth="2.6" strokeLinecap="round" opacity=".85" />
                <circle cx={f.ex} cy={f.ey} r="4" fill={f.cor} />
              </g>
            ))}
          </svg>
        )}
        {largo ? (
          <>
            <div className="mm-col mm-col-e">{esq.map(ramo)}</div>
            <div className="mm-col mm-col-c">
              {topo.map(ramo)}
              <Centro mapa={mapa} setRef={(n) => { centro.current = n; }} />
              {baixo.map(ramo)}
            </div>
            <div className="mm-col mm-col-d">{dir.map(ramo)}</div>
          </>
        ) : (
          <div className="mm-col mm-col-1">
            <Centro mapa={mapa} setRef={(n) => { centro.current = n; }} />
            {ordem.map(ramo)}
          </div>
        )}
      </div>

      {(mapa.pontos_chave?.length > 0 || mapa.atencao?.length > 0) && (
        <div className="mm-base">
          {mapa.pontos_chave?.length > 0 && (
            <section className="mm-pontos" aria-label="Pontos-chave">
              <h3 className="mm-pill"><MapaIcon nome="lampada" size={20} />Pontos-chave</h3>
              <ul className="mm-checks">
                {mapa.pontos_chave.map((t, i) => (
                  <li key={i}><span className="mm-check" aria-hidden="true"><MapaIcon nome="check" size={14} sw={3} /></span>{itemDe(t).t}</li>
                ))}
              </ul>
            </section>
          )}
          {mapa.atencao?.length > 0 && (
            <section className="mm-atencao" aria-label="Atenção">
              <h3 className="mm-pill"><MapaIcon nome="alerta" size={20} />Atenção</h3>
              <Itens itens={mapa.atencao} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
