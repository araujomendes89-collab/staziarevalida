// Sprites dos personagens (WebP com transparência, âncora nos pés). Os dois têm o mesmo conjunto de poses (sprites/stazia e sprites/stazi).
import { POSES } from "./personagens.js";
import manifestStazia from "./sprites/stazia/manifest.json";
import manifestStazi from "./sprites/stazi/manifest.json";

const URL_STAZIA = import.meta.glob("./sprites/stazia/*.webp", { eager: true, query: "?url", import: "default" });
const URL_STAZI = import.meta.glob("./sprites/stazi/*.webp", { eager: true, query: "?url", import: "default" });
/** Altura (px do arquivo) da lontra em pé: todas as poses foram normalizadas pelo tamanho do focinho para esta escala. */
export const ALTURA_EM_PE = 720;

function resolver(id, arquivo) {
  if (id === "stazia") {
    const m = manifestStazia[arquivo];
    return m ? { ...m, url: URL_STAZIA[`./sprites/stazia/${m.file}`], urlDe: (f) => URL_STAZIA[`./sprites/stazia/${f}`] } : null;
  }
  const novo = manifestStazi[arquivo];
  if (novo?.file) return { ...novo, url: URL_STAZI[`./sprites/stazi/${novo.file}`], urlDe: (f) => URL_STAZI[`./sprites/stazi/${f}`] };
  return null;
}

/**
 * Sprite de uma pose canônica: { url, w, h, ax, ay, boca?: {url,x,y,w,h}, olhos?: {...} } (px do arquivo).
 * Pose que faltar cai na "base" (nunca quebra a tela).
 */
export function spritePose(id, chave) {
  const mapa = POSES[id] ?? POSES.stazi;
  const s = resolver(id, mapa[chave] ?? mapa.base) ?? resolver(id, mapa.base);
  if (!s) return null;
  const extra = (o) => (o?.file ? { ...o, url: s.urlDe(o.file) } : null);
  return { url: s.url, w: s.w, h: s.h, ax: s.ax, ay: s.ay, nx: s.nx ?? s.w / 2, ny: s.ny ?? s.h * 0.15, boca: extra(s.boca), olhos: extra(s.olhos) };
}

/** Todas as URLs de um personagem (para pré-carregar ao abrir a conversa). */
export function urlsDoPersonagem(id) {
  const mapa = POSES[id] ?? POSES.stazi;
  const urls = new Set();
  for (const chave of Object.keys(mapa)) {
    const s = spritePose(id, chave);
    if (!s) continue;
    urls.add(s.url);
    if (s.boca) urls.add(s.boca.url);
    if (s.olhos) urls.add(s.olhos.url);
  }
  return [...urls].filter(Boolean);
}
