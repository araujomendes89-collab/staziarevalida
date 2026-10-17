// Caminho B (Three.js, 2.5D): o MESMO personagem (as mesmas poses aprovadas) num plano dentro de uma cena com profundidade.
// NÃO é um modelo 3D (GLB): sem o Blender neste Mac não há como modelar, riggar e texturizar uma lontra fiel à arte do dono.
// O que este caminho acrescenta ao 2D: câmera com paralaxe (camadas em profundidades diferentes), luz de contorno colorida pela
// emoção (rim light calculada da borda do sprite), leve giro do plano (falso volume), curvatura do corpo ao ouvir/falar, chão com
// sombra de contato e partículas na frente e atrás que mudam com a emoção e com o som. Mesmas props da esfera.
// Carregado sob demanda (React.lazy em PersonagemTutor.jsx): o three só baixa se este motor for usado.
import React from "react";
import * as THREE from "three";
import { usePersonagemAnimacao } from "./usePersonagemAnimacao.js";
import { opacidadesTroca } from "./movimento.js";
import { spritePose, ALTURA_EM_PE } from "./sprites.js";
import { rotuloPersonagem, personagemValido } from "./personagens.js";
import "./personagem.css";

const VERT = /* glsl */ `
uniform float uLean;      // curvatura lateral (ouvir/falar), proporcional à altura
uniform vec2 uScale;      // squash/stretch com pivô nos pés
uniform vec2 uOffset;     // deslocamento (unidades de cena)
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;                       // plano com os pés em y = 0
  float h = clamp(position.y, 0.0, 1.0);   // 0 nos pés, 1 no alto do sprite
  p.x *= uScale.x; p.y *= uScale.y;
  p.x += uLean * h * h;                    // curva: mais na cabeça que nos pés
  p.z += -abs(uLean) * h * 0.15;
  p.xy += uOffset;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uBoca;
uniform sampler2D uOlhos;
uniform vec4 uBocaRect;   // x, y, w, h em uv do sprite (origem embaixo)
uniform vec4 uOlhosRect;
uniform float uBocaOn;
uniform float uOlhosOn;
uniform float uOpacity;
uniform vec3 uRim;        // cor da luz de contorno (emoção)
uniform float uRimForca;
uniform vec2 uTexel;      // 1/largura, 1/altura do sprite
varying vec2 vUv;
vec4 sobre(vec4 base, sampler2D tex, vec4 r, float on, vec2 uv) {
  vec2 q = (uv - r.xy) / r.zw;
  if (on <= 0.001 || q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return base;
  vec4 o = texture2D(tex, q);
  float a = o.a * on;
  return vec4(mix(base.rgb, o.rgb, a), base.a);
}
void main() {
  vec4 c = texture2D(uMap, vUv);
  c = sobre(c, uBoca, uBocaRect, uBocaOn, vUv);
  c = sobre(c, uOlhos, uOlhosRect, uOlhosOn, vUv);
  // luz de contorno direcional (luz de cima e da direita): acende só a borda voltada para a luz, com a cor da emoção
  vec2 d = uTexel * vec2(7.0, 6.0);
  float fora = texture2D(uMap, vUv + d).a;
  float borda = clamp(c.a - fora, 0.0, 1.0) * c.a;
  vec3 col = c.rgb + uRim * borda * uRimForca * 0.85;
  // luz principal suave de cima (falso volume)
  col *= 0.9 + 0.16 * smoothstep(0.0, 1.0, vUv.y);
  float a = c.a * uOpacity;
  vec4 o = linearToOutputTexel(vec4(col, 1.0));
  gl_FragColor = vec4(o.rgb * a, a);
}`;

const ALTURA_CENA = 2.2; // lontra em pé = 2,2 unidades

function texturaDe(cache, url) {
  if (!url) return null;
  if (!cache.has(url)) {
    // ao terminar de carregar, desenha de novo (no relógio controlado e no movimento reduzido não há rAF)
    const tex = new THREE.TextureLoader().load(url, () => cache.aoCarregar?.());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    cache.set(url, tex);
  }
  return cache.get(url);
}

function criarPlano(material) {
  const g = new THREE.PlaneGeometry(1, 1, 8, 24);
  g.translate(0, 0.5, 0); // pés (base do plano) em y = 0
  return new THREE.Mesh(g, material);
}

function materialPersonagem() {
  const vazio = new THREE.Texture();
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: vazio }, uBoca: { value: vazio }, uOlhos: { value: vazio },
      uBocaRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uOlhosRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uBocaOn: { value: 0 }, uOlhosOn: { value: 0 }, uOpacity: { value: 1 },
      uRim: { value: new THREE.Color("#3DA5FF") }, uRimForca: { value: 0.5 }, uTexel: { value: new THREE.Vector2(1 / 440, 1 / 720) },
      uLean: { value: 0 }, uScale: { value: new THREE.Vector2(1, 1) }, uOffset: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });
}

/** Ajusta o plano de uma camada à pose (tamanho, âncora nos pés, retângulos da boca e dos olhos). */
function vestir(mesh, s, cache) {
  const u = mesh.material.uniforms;
  u.uMap.value = texturaDe(cache, s.url);
  const k = ALTURA_CENA / ALTURA_EM_PE;
  mesh.userData.w = s.w * k;
  mesh.userData.h = s.h * k;
  // âncora (ax, ay) em px → o plano é deslocado para os pés ficarem na origem
  mesh.userData.dx = (s.w / 2 - s.ax) * k;
  mesh.userData.dy = (s.h - s.ay) * k;
  mesh.userData.nxs = (s.nx - s.ax) * k; // focinho em relação aos pés (unidades de cena)
  mesh.userData.nys = (s.ay - s.ny) * k;
  u.uTexel.value.set(1 / s.w, 1 / s.h);
  const ret = (o) => new THREE.Vector4(o.x / s.w, 1 - (o.y + o.h) / s.h, o.w / s.w, o.h / s.h);
  u.uBoca.value = s.boca ? texturaDe(cache, s.boca.url) : u.uMap.value;
  u.uBocaRect.value = s.boca ? ret(s.boca) : new THREE.Vector4(0, 0, 0, 0);
  u.uOlhos.value = s.olhos ? texturaDe(cache, s.olhos.url) : u.uMap.value;
  u.uOlhosRect.value = s.olhos ? ret(s.olhos) : new THREE.Vector4(0, 0, 0, 0);
  mesh.userData.temBoca = Boolean(s.boca);
  mesh.userData.temOlhos = Boolean(s.olhos);
}

function brilhoFundo() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCor: { value: new THREE.Color("#3DA5FF") }, uForca: { value: 0.4 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader:
      "uniform vec3 uCor; uniform float uForca; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a = a * a * uForca; vec4 o = linearToOutputTexel(vec4(uCor,1.0)); gl_FragColor = vec4(o.rgb * a, a); }",
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
}

function sombraChao() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uForca: { value: 0.5 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform float uForca; varying vec2 vUv; void main(){ float d = length((vUv - 0.5) * vec2(2.0, 2.0)); float a = smoothstep(1.0, 0.1, d) * uForca; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }",
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Partículas com semente (mesma semente, mesmas partículas: nada de aleatório global). */
function seededParticulas(qtd, semente) {
  let a = semente >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: qtd }, () => ({ x: r(), z: r(), fase: r(), vel: 0.08 + r() * 0.12 }));
}

function nuvemParticulas(qtd, semente, tamanho) {
  const g = new THREE.BufferGeometry();
  const ps = seededParticulas(qtd, semente);
  g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(qtd * 3), 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCor: { value: new THREE.Color("#3DA5FF") }, uForca: { value: 0.5 }, uTam: { value: tamanho } },
    vertexShader: "uniform float uTam; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = uTam / -mv.z; gl_Position = projectionMatrix * mv; }",
    fragmentShader:
      "uniform vec3 uCor; uniform float uForca; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d) * uForca; vec4 o = linearToOutputTexel(vec4(uCor,1.0)); gl_FragColor = vec4(o.rgb * a, a); }",
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.userData.ps = ps;
  return pts;
}

/** Posição das partículas como função do tempo: sobem devagar (mais rápido na raiva e com som) e voltam embaixo. */
function moverParticulas(pts, t, vel, abertura, zBase) {
  const arr = pts.geometry.attributes.position.array;
  pts.userData.ps.forEach((p, i) => {
    const subida = (p.fase + (t / 1000) * vel * p.vel) % 1;
    arr[i * 3] = (p.x - 0.5) * abertura + Math.sin(t / 1000 * p.vel * 1.3 + p.fase * 6) * 0.08;
    arr[i * 3 + 1] = -0.1 + subida * 3.0;
    arr[i * 3 + 2] = zBase + (p.z - 0.5) * 0.6;
  });
  pts.geometry.attributes.position.needsUpdate = true;
}

// Efeitos (ondas ao ouvir, "..." ao pensar, marca de raiva, brilhos, giro de reconexão): os mesmos desenhos do 2D, numa textura de
// canvas que fica num plano um pouco à frente do personagem (ganha profundidade com a paralaxe da câmera).
const FX_W = 300;
const FX_H = 410;
const ESTRELAS = [[120, 120, 1], [470, 90, 0.8], [500, 260, 0.6], [95, 300, 0.7]];
function desenharEfeitos(ctx, q) {
  ctx.clearRect(0, 0, FX_W, FX_H);
  if (!q.efeito) return;
  ctx.save();
  ctx.scale(FX_W / 600, FX_H / 820);
  ctx.lineCap = "round";
  const t = q.t / 1000;
  const traco = (d, cor, w) => {
    ctx.strokeStyle = cor;
    ctx.lineWidth = w;
    ctx.stroke(new Path2D(d));
  };
  if (q.efeito === "ondas") {
    ctx.globalAlpha = 0.25 + q.nivelEfeito * 0.75;
    ["M150 170 q-22 30 0 60", "M128 152 q-36 48 0 96", "M106 134 q-50 66 0 132"].forEach((d) => traco(d, q.cor, 7));
  } else if (q.efeito === "pensando") {
    ctx.fillStyle = "#eef1ff";
    [430, 470, 510].forEach((x, i) => {
      ctx.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(t * Math.PI * 1.6 - i * 0.9));
      ctx.beginPath();
      ctx.arc(x, 70 - i * 8, 13, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (q.efeito === "raiva") {
    const k = 1 + 0.16 * Math.abs(Math.sin(t * Math.PI * 2.4));
    ctx.translate(440, 70);
    ctx.scale(k, k);
    ctx.translate(-440, -70);
    traco("M412 62 Q430 60 432 42 M448 42 Q450 60 468 62 M468 78 Q450 80 448 98 M432 98 Q430 80 412 78", "#ff5a5a", 9);
  } else if (q.efeito === "brilho") {
    ctx.fillStyle = "#ffe9a8";
    ESTRELAS.forEach(([x, y, e], i) => {
      const v = Math.max(0, Math.sin(t * Math.PI * 1.1 + i * 1.7));
      const s = e * (0.6 + 0.5 * v);
      ctx.globalAlpha = v;
      ctx.fill(new Path2D(`M${x} ${y - 16 * s} L${x + 4 * s} ${y - 4 * s} L${x + 16 * s} ${y} L${x + 4 * s} ${y + 4 * s} L${x} ${y + 16 * s} L${x - 4 * s} ${y + 4 * s} L${x - 16 * s} ${y} L${x - 4 * s} ${y - 4 * s} Z`));
    });
  } else if (q.efeito === "reconectando") {
    ctx.translate(470, 80);
    ctx.rotate(((q.t * 0.36) % 360) * (Math.PI / 180));
    ctx.translate(-470, -80);
    traco("M470 50 a30 30 0 1 1 -28 19", "#eef1ff", 8);
  }
  ctx.restore();
}

function planoEfeitos() {
  const canvas = document.createElement("canvas");
  canvas.width = FX_W;
  canvas.height = FX_H;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const k = ALTURA_CENA / ALTURA_EM_PE;
  const g = new THREE.PlaneGeometry(600 * k, 820 * k);
  g.translate(0, (410 - 20) * k, 0); // pés da caixa (300, 800) na origem
  const m = new THREE.Mesh(g, mat);
  m.userData.ctx = canvas.getContext("2d");
  m.userData.tex = tex;
  return m;
}

const VEL = { angry: 1.6, annoyed: 1.1, happy: 0.7, proud: 0.6, impressed: 0.8, relieved: 0.35, firm: 0.4, skeptical: 0.35, curious: 0.5, neutral: 0.3 };

export function PersonagemTutor3D({ personagem = "stazi", conversationState = "idle", emotion = "neutral", emotionIntensity = 0.3, inputStream = null, outputStream = null, personality = null, onFrame = null, time = null, niveis = null, desde = null, reduzido, className = "", decorativo = false }) {
  const id = personagemValido(personagem) ?? "stazi";
  const raiz = React.useRef(null);
  const cena = React.useRef(null);
  const [falhou, setFalhou] = React.useState(false);
  const capturando = time != null;

  // monta a cena uma vez por personagem
  React.useEffect(() => {
    const el = raiz.current;
    if (!el) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: capturando, powerPreference: "low-power" });
    } catch {
      setFalhou(true); // sem WebGL: o 2D assume (PersonagemTutor.jsx)
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "tp3__canvas";
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    const cache = new Map();
    const fundo = brilhoFundo();
    fundo.position.set(0, 1.25, -1.6);
    fundo.scale.set(4.2, 4.2, 1);
    const chao = sombraChao();
    chao.position.set(0, 0.002, 0.05);
    chao.scale.set(1.3, 0.38, 1);
    const atras = nuvemParticulas(26, 7, 26);
    const frente = nuvemParticulas(10, 19, 60);
    const camadas = { atual: criarPlano(materialPersonagem()), anterior: criarPlano(materialPersonagem()) };
    camadas.anterior.position.z = -0.01;
    const efeitos = planoEfeitos();
    efeitos.position.z = 0.25;
    scene.add(fundo, atras, chao, camadas.anterior, camadas.atual, efeitos, frente);
    const medir = () => {
      const w = el.clientWidth || 300;
      const h = el.clientHeight || 400;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    medir();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    cache.aoCarregar = () => renderer.render(scene, camera);
    cena.current = { renderer, scene, camera, cache, fundo, chao, atras, frente, camadas, efeitos, poses: { atual: null, anterior: null } };
    return () => {
      ro?.disconnect();
      cena.current = null;
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
      cache.forEach((t) => t.dispose());
      efeitos.userData.tex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [id, capturando]);

  const pintar = React.useCallback(
    (q, m) => {
      const c = cena.current;
      if (!c) return;
      const { renderer, scene, camera, camadas, cache } = c;
      // troca de pose: a camada "anterior" recebe a pose antiga
      for (const papel of ["atual", "anterior"]) {
        const chave = papel === "atual" ? m.pose : m.anterior;
        if (chave && c.poses[papel] !== chave) {
          const s = spritePose(id, chave);
          if (s) vestir(camadas[papel], s, cache);
          c.poses[papel] = chave;
        }
      }
      const k = ALTURA_CENA / 400; // deslocamentos do quadro (px numa lontra de ~400 px) → unidades de cena
      const lean = (-q.rot * Math.PI) / 180 * 1.1; // a inclinação vira curvatura do corpo
      // cruzamento ancorado no focinho (igual ao 2D): durante a troca os dois focinhos coincidem
      const un = camadas.atual.userData;
      const an = camadas.anterior.userData;
      const dnx = m.anterior ? (un.nxs ?? 0) - (an.nxs ?? 0) : 0;
      const dny = m.anterior ? (un.nys ?? 0) - (an.nys ?? 0) : 0;
      for (const papel of ["atual", "anterior"]) {
        const mesh = camadas[papel];
        const fx = papel === "atual" ? -(1 - q.troca) : q.troca;
        const u = mesh.material.uniforms;
        const ud = mesh.userData;
        mesh.visible = papel === "atual" || (m.anterior && q.troca < 1);
        u.uOpacity.value = opacidadesTroca(q.troca)[papel];
        u.uScale.value.set((ud.w ?? 1) * q.sx, (ud.h ?? 1) * q.sy);
        u.uOffset.value.set((ud.dx ?? 0) * q.sx + q.x * k + dnx * fx, -(ud.dy ?? 0) * q.sy - q.y * k + dny * fx);
        u.uLean.value = lean;
        u.uBocaOn.value = papel === "atual" && ud.temBoca ? q.boca : 0;
        u.uOlhosOn.value = papel === "atual" && ud.temOlhos ? q.olhos : 0;
        u.uRim.value.set(q.cor);
        u.uRimForca.value = 0.25 + q.aura * 0.75;
        // falso volume: o plano gira um pouco junto com o balanço
        mesh.rotation.y = (q.rot * Math.PI) / 180 * 1.8;
      }
      if (c.efeitos.userData.ctx) {
        desenharEfeitos(c.efeitos.userData.ctx, q);
        c.efeitos.userData.tex.needsUpdate = true;
        c.efeitos.position.x = q.x * k;
        c.efeitos.position.y = -q.y * k;
        c.efeitos.rotation.y = (q.rot * Math.PI) / 180 * 1.8;
      }
      const vel = (VEL[emotion] ?? 0.3) * (0.6 + emotionIntensity) + q.nivelEfeito * 0.6;
      const tt = q.t;
      moverParticulas(c.atras, tt, vel, 3.4, -0.9);
      moverParticulas(c.frente, tt + 4000, vel * 0.8, 3.0, 0.9);
      for (const p of [c.atras, c.frente]) {
        p.material.uniforms.uCor.value.set(q.cor);
        p.material.uniforms.uForca.value = 0.25 + q.aura * 0.6;
      }
      c.fundo.material.uniforms.uCor.value.set(q.cor);
      c.fundo.material.uniforms.uForca.value = 0.25 + q.aura * 0.55;
      c.chao.material.uniforms.uForca.value = 0.45 * (1 + Math.min(0, q.y) * 0.01);
      // câmera: paralaxe lenta + aproxima um pouco ao falar/ouvir
      const px = Math.sin(tt / 1000 * 0.35) * 0.18 + q.x * k * 0.5;
      const py = 1.15 + Math.sin(tt / 1000 * 0.23) * 0.05;
      const dist = 5.5 - q.nivelEfeito * 0.2;
      camera.position.set(px, py + 0.25, dist);
      camera.lookAt(0, 1.12, 0);
      renderer.render(scene, camera);
    },
    [id, emotion, emotionIntensity]
  );

  const { poses, reduzido: red } = usePersonagemAnimacao({ conversationState, emotion, emotionIntensity, inputStream, outputStream, onFrame, time, niveis, desde, reduzido, pintar });
  const rotulo = rotuloPersonagem(id, conversationState, emotion);
  if (falhou) return <div className="tp tp--sem-webgl" data-falhou="webgl" />;
  return (
    <div
      ref={raiz}
      className={`tp tp3 tp--${id} is-${conversationState} emo-${emotion}${red ? " is-reduced" : ""} ${className}`.trim()}
      data-personagem={id}
      data-state={conversationState}
      data-emotion={emotion}
      data-pose={poses.atual}
      data-motor="3d"
      data-personality={personality?.id ?? undefined}
      {...(decorativo ? { "aria-hidden": "true" } : { role: "img", "aria-label": rotulo })}
    />
  );
}
