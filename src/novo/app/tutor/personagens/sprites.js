// Sprites dos personagens (WebP com transparência, âncora nos pés). Os dois têm o mesmo conjunto de poses (sprites/stazia e sprites/stazi).
import { POSES } from "./personagens.js";
import manifestStazia from "./sprites/stazia/manifest.json";
import manifestStazi from "./sprites/stazi/manifest.json";

const URL_STAZIA = import.meta.glob("./sprites/stazia/*.webp", { eager: true, query: "?url", import: "default" });
const URL_STAZI = import.meta.glob("./sprites/stazi/*.webp", { eager: true, query: "?url", import: "default" });
/** Altura (px do arquivo) da lontra em pé: todas as poses foram normalizadas pelo tamanho do focinho para esta escala. */
export const ALTURA_EM_PE = 720;

function resolver(id, arquivo) {
  const [mapa, pasta, man] = id === "stazia" ? [URL_STAZIA, "./sprites/stazia/", manifestStazia] : [URL_STAZI, "./sprites/stazi/", manifestStazi];
  const m = man[arquivo];
  if (!m?.file) return null;
  const urlDe = (f) => mapa[`${pasta}${f}`];
  // versão "meia" (0,5 px de arquivo por px lógico) ao lado de cada arquivo: para o personagem pequeno na tela
  const meiaDe = (f) => mapa[`${pasta}${f.replace(/\.webp$/, ".meia.webp")}`] ?? null;
  return { ...m, url: urlDe(m.file), urlMeia: meiaDe(m.file), urlDe, meiaDe };
}

/**
 * Sprite de uma pose canônica: { url, urlMeia, w, h, ax, ay, boca?: {url,urlMeia,x,y,w,h}, olhos?: {...} } (px lógicos: a lontra em
 * pé mede ALTURA_EM_PE). `urlMeia` é a mesma imagem com metade da resolução lógica (null se não existir).
 * Pose que faltar cai na "base" (nunca quebra a tela).
 */
export function spritePose(id, chave) {
  const mapa = POSES[id] ?? POSES.stazi;
  const s = resolver(id, mapa[chave] ?? mapa.base) ?? resolver(id, mapa.base);
  if (!s) return null;
  const extra = (o) => (o?.file ? { ...o, url: s.urlDe(o.file), urlMeia: s.meiaDe(o.file) } : null);
  return { url: s.url, urlMeia: s.urlMeia, w: s.w, h: s.h, ax: s.ax, ay: s.ay, nx: s.nx ?? s.w / 2, ny: s.ny ?? s.h * 0.15, boca: extra(s.boca), olhos: extra(s.olhos) };
}

/** Poses mais prováveis logo depois da primeira (a conversa por voz passa por elas o tempo todo): pré-carregadas primeiro. */
export const POSES_PROVAVEIS = ["falando", "ouvindo", "pensando", "base", "falandoFirme", "acenando"];

/**
 * URLs de um personagem para pré-carregar, das poses mais prováveis para as outras (cada pose seguida da boca e da piscada dela).
 * `meia`: a versão de meia resolução (personagem pequeno na tela). `so`: só estas poses (ex.: POSES_PROVAVEIS).
 */
export function urlsDoPersonagem(id, { meia = false, so = null } = {}) {
  const mapa = POSES[id] ?? POSES.stazi;
  const chaves = [...new Set([...POSES_PROVAVEIS.filter((c) => c in mapa), ...Object.keys(mapa)])].filter((c) => !so || so.includes(c));
  const urls = new Set();
  const qual = (o) => (meia && o.urlMeia) || o.url;
  for (const chave of chaves) {
    const s = spritePose(id, chave);
    if (!s) continue;
    urls.add(qual(s));
    if (s.boca) urls.add(qual(s.boca));
    if (s.olhos) urls.add(qual(s.olhos));
  }
  return [...urls].filter(Boolean);
}
