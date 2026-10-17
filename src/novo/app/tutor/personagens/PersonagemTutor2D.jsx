// Caminho A (2D por sprites): o personagem escolhido (Stazi ou Stazia) no lugar da esfera. Mesmas props da StaziaVoiceOrb, mais
// `personagem`. As poses são as imagens aprovadas (WebP com âncora nos pés); o movimento é só transform/opacidade, escrito a cada
// quadro direto no estilo (sem redesenhar o React): respiração, balanço, "squash" na troca de pose, piscada, boca que acompanha a
// voz (lip flap pelo nível da voz do professor), inclinação ao ouvir (nível do microfone), tremor curto de raiva, aura por emoção.
import React from "react";
import { usePersonagemAnimacao } from "./usePersonagemAnimacao.js";
import { opacidadesTroca, aparenciaBoca, geometriaBoca } from "./movimento.js";
import { spritePose, urlsDoPersonagem, ALTURA_EM_PE, POSES_PROVAVEIS } from "./sprites.js";
import { rotuloPersonagem, personagemValido } from "./personagens.js";
import "./personagem.css";

// caixa de referência (px de sprite): a lontra em pé mede ALTURA_EM_PE; a caixa deixa folga para braços erguidos e efeitos
const CAIXA_W = 600;
const CAIXA_H = 820;
const PE_Y = 800; // onde ficam os pés dentro da caixa
// os deslocamentos do quadro (movimento.js) são pensados para uma lontra de ~400 px de altura na tela
const REF_PX = 400;

// abaixo disto (px do aparelho por px lógico do sprite) a versão de meia resolução basta: rosto do Mini Tutor, bolinha, cartões
const LIMITE_MEIA = 0.55;
const jaPedidas = new Set();

/**
 * Pré-carrega as outras poses DEPOIS que a pose da tela chegou, uma de cada vez e nos intervalos livres do navegador (a pose
 * visível não divide a rede com as outras 23). Devolve a função que cancela.
 */
function preCarregarEmFila(urls) {
  if (typeof Image === "undefined") return () => {};
  const fila = urls.filter((u) => !jaPedidas.has(u));
  let parado = false;
  let espera = null;
  const ocioso = (fn) => {
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      const h = window.requestIdleCallback(fn, { timeout: 1500 });
      return () => window.cancelIdleCallback?.(h);
    }
    const h = setTimeout(fn, 120);
    return () => clearTimeout(h);
  };
  const proxima = () => {
    espera = null;
    if (parado) return;
    const u = fila.shift();
    if (!u) return;
    if (jaPedidas.has(u)) return proxima();
    jaPedidas.add(u);
    const im = new Image();
    im.decoding = "async";
    const seguir = () => {
      if (!parado) espera = ocioso(proxima);
    };
    im.onload = seguir;
    im.onerror = seguir;
    im.src = u;
  };
  espera = ocioso(proxima);
  return () => {
    parado = true;
    espera?.();
  };
}

// `extras` (boca e piscada): só depois que a primeira pose chegou, para não dividirem a rede com ela
function Camada({ id, chave, papel, refs, escondida = false, meia = false, onPronta = null, extras = true }) {
  const s = spritePose(id, chave);
  if (!s) return null;
  const src = (o) => (meia && o.urlMeia) || o.url;
  const pos = (o) => ({ left: `calc(${o.x} * var(--tp-u))`, top: `calc(${o.y} * var(--tp-u))`, width: `calc(${o.w} * var(--tp-u))`, height: `calc(${o.h} * var(--tp-u))` });
  return (
    <div
      ref={(el) => (refs.current[papel] = el)}
      className={`tp__pose tp__pose--${papel}`}
      data-pose={chave}
      style={{ left: `calc((${CAIXA_W / 2} - ${s.ax}) * var(--tp-u))`, top: `calc((${PE_Y} - ${s.ay}) * var(--tp-u))`, width: `calc(${s.w} * var(--tp-u))`, height: `calc(${s.h} * var(--tp-u))`, opacity: escondida ? 0 : 1 }}
    >
      <img className="tp__img" src={src(s)} alt="" draggable={false} decoding="async" fetchPriority={papel === "atual" ? "high" : undefined} onLoad={onPronta ?? undefined} onError={onPronta ?? undefined} />
      {extras && s.olhos && <img ref={(el) => (refs.current[`${papel}-olhos`] = el)} className="tp__extra" src={src(s.olhos)} alt="" draggable={false} style={{ ...pos(s.olhos), opacity: 0 }} />}
      {extras && s.boca && <Boca s={s} refs={refs} papel={papel} src={src(s.boca)} />}
    </div>
  );
}

/**
 * Boca que acompanha a voz (17/10/2026): só a parte do recorte ABAIXO do focinho (as sobrancelhas do recorte não pulam a cada
 * sílaba), com a borda apagada por uma elipse e escala vertical presa no focinho: fechada, meia e aberta, sem mexer o corpo.
 */
function Boca({ s, refs, papel, src }) {
  const g = geometriaBoca(s);
  const u = (n) => `calc(${n.toFixed(1)} * var(--tp-u))`;
  const mascara = `radial-gradient(ellipse ${u(g.rx)} ${u(g.ry)} at ${u(g.cx)} 0px, #000 65%, transparent 100%)`;
  return (
    <div
      ref={(el) => (refs.current[`${papel}-boca`] = el)}
      className="tp__boca"
      style={{ position: "absolute", left: u(s.boca.x), top: u(s.boca.y + g.corte), width: u(s.boca.w), height: u(g.h), overflow: "hidden", opacity: 0, transformOrigin: "50% 0", willChange: "transform, opacity", maskImage: mascara, WebkitMaskImage: mascara }}
    >
      <img className="tp__extra" src={src} alt="" draggable={false} style={{ left: 0, top: u(-g.corte), width: u(s.boca.w), height: u(s.boca.h) }} />
    </div>
  );
}

/** Efeitos em SVG em volta da cabeça (coordenadas da caixa 600 × 820). Só opacidade/transform mudam por quadro. */
function Efeitos({ refs }) {
  const r = (k) => (el) => (refs.current[k] = el);
  return (
    <svg className="tp__efeitos" viewBox={`0 0 ${CAIXA_W} ${CAIXA_H}`} aria-hidden="true">
      <g ref={r("fx-ondas")} className="tp__fx" style={{ opacity: 0 }}>
        <path d="M150 170 q-22 30 0 60" />
        <path d="M128 152 q-36 48 0 96" />
        <path d="M106 134 q-50 66 0 132" />
      </g>
      <g ref={r("fx-pensando")} className="tp__fx tp__fx--bolha" style={{ opacity: 0 }}>
        <circle ref={r("fx-p0")} cx="430" cy="70" r="13" />
        <circle ref={r("fx-p1")} cx="470" cy="62" r="13" />
        <circle ref={r("fx-p2")} cx="510" cy="54" r="13" />
      </g>
      <g ref={r("fx-raiva")} className="tp__fx tp__fx--raiva" style={{ opacity: 0, transformOrigin: "440px 70px" }}>
        <path d="M412 62 Q430 60 432 42 M448 42 Q450 60 468 62 M468 78 Q450 80 448 98 M432 98 Q430 80 412 78" />
      </g>
      <g ref={r("fx-brilho")} className="tp__fx tp__fx--brilho" style={{ opacity: 0 }}>
        {[
          [120, 120, 1],
          [470, 90, 0.8],
          [500, 260, 0.6],
          [95, 300, 0.7],
        ].map(([x, y, s], i) => (
          <path key={i} ref={r(`fx-b${i}`)} d={`M${x} ${y - 16 * s} L${x + 4 * s} ${y - 4 * s} L${x + 16 * s} ${y} L${x + 4 * s} ${y + 4 * s} L${x} ${y + 16 * s} L${x - 4 * s} ${y + 4 * s} L${x - 16 * s} ${y} L${x - 4 * s} ${y - 4 * s} Z`} style={{ transformOrigin: `${x}px ${y}px` }} />
        ))}
      </g>
      <g ref={r("fx-reconectando")} className="tp__fx tp__fx--giro" style={{ opacity: 0, transformOrigin: "470px 80px" }}>
        <path d="M470 50 a30 30 0 1 1 -28 19" />
      </g>
    </svg>
  );
}

const EFEITOS = ["ondas", "pensando", "raiva", "brilho", "reconectando"];

/**
 * <PersonagemTutor2D personagem="stazia" conversationState emotion emotionIntensity inputStream outputStream onFrame time? niveis? reduzido? preCarregar? />
 * `preCarregar`: "tudo" (padrão; tela de voz), "provaveis" (só falando/ouvindo/pensando/base/firme/acenando; rosto do Mini Tutor) ou
 * "nada". Sempre depois que a pose da tela carregou. Personagem pequeno na tela usa a versão de meia resolução dos sprites.
 */
export function PersonagemTutor2D({ personagem = "stazi", conversationState = "idle", emotion = "neutral", emotionIntensity = 0.3, inputStream = null, outputStream = null, personality = null, onFrame = null, time = null, niveis = null, desde = null, semente, reduzido, className = "", decorativo = false, preCarregar = "tudo" }) {
  const id = personagemValido(personagem) ?? "stazi";
  const raiz = React.useRef(null);
  const corpo = React.useRef(null);
  const refs = React.useRef({});
  const escala = React.useRef(1);
  const unidade = React.useRef(0.4); // px de tela por px de sprite

  // null até medir a caixa (antes do primeiro quadro): assim a pose só é pedida uma vez, já na resolução certa
  const [meia, setMeia] = React.useState(null);
  const [pronta, setPronta] = React.useState(false);
  const aoCarregar = React.useCallback(() => setPronta(true), []);

  // as outras poses (e a boca/piscada) só depois que a da tela chegou (ou, se ela não avisar, depois de alguns segundos)
  React.useEffect(() => {
    if (meia === null || preCarregar === "nada") return undefined;
    if (!pronta) return undefined;
    return preCarregarEmFila(urlsDoPersonagem(id, { meia, so: preCarregar === "provaveis" ? POSES_PROVAVEIS : null }));
  }, [id, meia, pronta, preCarregar]);
  React.useEffect(() => {
    if (pronta) return undefined;
    const t = setTimeout(aoCarregar, 5000);
    return () => clearTimeout(t);
  }, [pronta, aoCarregar]);

  // px de tela por px de sprite (atualiza só quando a caixa muda de tamanho)
  React.useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return undefined;
    const medir = () => {
      const u = Math.min(el.clientHeight / CAIXA_H, el.clientWidth / CAIXA_W) || 0.4;
      unidade.current = u;
      escala.current = (u * ALTURA_EM_PE) / REF_PX;
      const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
      // só desce para a meia resolução; uma vez na cheia, fica nela (não troca a imagem no meio da conversa)
      setMeia((antes) => (antes === false ? false : u * dpr <= LIMITE_MEIA));
    };
    medir();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pintar = React.useCallback((q, m) => {
    const el = raiz.current;
    const c = corpo.current;
    if (!el || !c) return;
    const k = escala.current;
    c.style.transform = `translate(${(q.x * k).toFixed(2)}px, ${(q.y * k).toFixed(2)}px) rotate(${q.rot.toFixed(2)}deg) scale(${q.sx.toFixed(4)}, ${q.sy.toFixed(4)})`;
    el.style.setProperty("--tp-cor", q.cor);
    el.style.setProperty("--tp-aura", q.aura.toFixed(3));
    el.style.setProperty("--tp-sombra", (1 + Math.min(0, q.y) * 0.01).toFixed(3));
    const R = refs.current;
    // cruzamento ancorado no focinho: durante a troca os dois focinhos coincidem (sem pulo de posição ou de tamanho)
    let dx = 0;
    let dy = 0;
    if (m?.anterior && m.pose && q.troca < 1) {
      const a = spritePose(id, m.pose);
      const b = spritePose(id, m.anterior);
      if (a && b) {
        dx = (CAIXA_W / 2 - a.ax + a.nx) - (CAIXA_W / 2 - b.ax + b.nx);
        dy = (PE_Y - a.ay + a.ny) - (PE_Y - b.ay + b.ny);
      }
    }
    const u = unidade.current;
    if (R.atual) {
      R.atual.style.opacity = String(opacidadesTroca(q.troca).atual);
      R.atual.style.transform = `translate(${(-dx * (1 - q.troca) * u).toFixed(2)}px, ${(-dy * (1 - q.troca) * u).toFixed(2)}px)`;
    }
    if (R.anterior) {
      R.anterior.style.opacity = String(opacidadesTroca(q.troca).anterior);
      R.anterior.style.transform = `translate(${(dx * q.troca * u).toFixed(2)}px, ${(dy * q.troca * u).toFixed(2)}px)`;
    }
    if (R["atual-boca"]) {
      const b = aparenciaBoca(q.boca);
      R["atual-boca"].style.opacity = b.opacidade.toFixed(3);
      R["atual-boca"].style.transform = `scaleY(${b.escala.toFixed(3)})`;
    }
    el.dataset.boca = q.boca.toFixed(2);
    if (R["atual-olhos"]) R["atual-olhos"].style.opacity = q.olhos.toFixed(3);
    for (const nome of EFEITOS) {
      const g = R[`fx-${nome}`];
      if (g) g.style.opacity = q.efeito === nome ? "1" : "0";
    }
    const t = q.t;
    const n = q.nivelEfeito;
    if (q.efeito === "ondas" && R["fx-ondas"]) R["fx-ondas"].style.opacity = (0.25 + n * 0.75).toFixed(3);
    if (q.efeito === "pensando") {
      for (let i = 0; i < 3; i++) {
        const p = R[`fx-p${i}`];
        if (p) p.style.opacity = (0.3 + 0.7 * Math.max(0, Math.sin((t / 1000) * Math.PI * 1.6 - i * 0.9))).toFixed(3);
      }
    }
    if (q.efeito === "raiva" && R["fx-raiva"]) R["fx-raiva"].style.transform = `scale(${(1 + 0.16 * Math.abs(Math.sin((t / 1000) * Math.PI * 2.4))).toFixed(3)})`;
    if (q.efeito === "brilho") {
      for (let i = 0; i < 4; i++) {
        const b = R[`fx-b${i}`];
        if (b) {
          const v = Math.max(0, Math.sin((t / 1000) * Math.PI * 1.1 + i * 1.7));
          b.style.opacity = v.toFixed(3);
          b.style.transform = `scale(${(0.6 + 0.5 * v).toFixed(3)})`;
        }
      }
    }
    if (q.efeito === "reconectando" && R["fx-reconectando"]) R["fx-reconectando"].style.transform = `rotate(${((t * 0.36) % 360).toFixed(1)}deg)`;
  }, [id]);

  const { poses, reduzido: red } = usePersonagemAnimacao({ conversationState, emotion, emotionIntensity, inputStream, outputStream, onFrame, time, niveis, desde, semente: semente ?? (id === "stazia" ? 2 : 1), reduzido, pintar });
  const rotulo = rotuloPersonagem(id, conversationState, emotion);

  return (
    <div
      ref={raiz}
      className={`tp tp--${id} is-${conversationState} emo-${emotion}${red ? " is-reduced" : ""} ${className}`.trim()}
      data-personagem={id}
      data-state={conversationState}
      data-emotion={emotion}
      data-pose={poses.atual}
      data-personality={personality?.id ?? undefined}
      {...(decorativo ? { "aria-hidden": "true" } : { role: "img", "aria-label": rotulo })}
    >
      <div className="tp__caixa">
        <div className="tp__aura" />
        <div className="tp__chao" />
        <div ref={corpo} className="tp__corpo">
          {poses.anterior && poses.anterior !== poses.atual && <Camada key={`a-${poses.anterior}`} id={id} chave={poses.anterior} papel="anterior" refs={refs} meia={Boolean(meia)} />}
          {meia !== null && <Camada key={`p-${poses.atual}`} id={id} chave={poses.atual} papel="atual" refs={refs} meia={meia} onPronta={pronta ? null : aoCarregar} extras={pronta} escondida={Boolean(poses.anterior && poses.anterior !== poses.atual && !red)} />}
          <Efeitos refs={refs} />
        </div>
      </div>
    </div>
  );
}
