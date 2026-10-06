// Chamadas ao servidor das aulas (/api/lessons) com o token da sessão: envio de slides/áudio e leitura dos arquivos.
const BASE = "/api/lessons";

async function headers(backend, extra = {}) {
  const token = backend.accessToken ? await backend.accessToken() : null;
  if (!token) throw new Error("Os arquivos das aulas precisam do servidor: entre de novo na sua conta.");
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function parse(res) {
  if (res.ok) return res;
  let message = `Erro ${res.status}.`;
  try {
    message = (await res.json()).error ?? message;
  } catch {
    // sem corpo
  }
  const error = new Error(message);
  error.status = res.status;
  throw error;
}
const json = async (backend, path, body) =>
  (await parse(await fetch(BASE + path, body === undefined ? { headers: await headers(backend) } : { method: "POST", headers: await headers(backend, { "Content-Type": "application/json" }), body: JSON.stringify(body) }))).json();

export const lessonsAvailable = (backend) => Boolean(backend?.accessToken);

/** Tipo aceito para o arquivo (PDF ou MP3), ou null. */
export function lessonFileType(file) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "application/pdf";
  if (/audio\/(mpeg|mp3)/.test(file.type) || /\.mp3$/i.test(file.name)) return "audio/mpeg";
  return null;
}

/**
 * Envia slides (PDF) ou áudio (MP3) de uma aula e devolve a aula atualizada. Com o Supabase o arquivo vai
 * direto ao depósito (envio assinado); no banco local, pelo servidor.
 */
export async function uploadLessonFile(backend, lessonId, file, kind, title) {
  const type = lessonFileType(file);
  if (!type) throw new Error("Envie um PDF (slides) ou um MP3 (áudio).");
  const prep = await json(backend, `/${lessonId}/upload`, { kind, content_type: type, size_bytes: file.size });
  if (prep.mode === "signed") {
    if (!backend.uploadToSignedUrl) throw new Error("Envio direto indisponível neste ambiente.");
    await backend.uploadToSignedUrl(prep.bucket, prep.path, prep.token, file, type);
    return json(backend, `/${lessonId}/materials/confirm`, { kind, key: prep.key, title: title || file.name, content_type: type, size_bytes: file.size });
  }
  const query = new URLSearchParams({ kind, title: title || file.name });
  const res = await parse(
    await fetch(`${BASE}/${lessonId}/materials?${query}`, { method: "POST", headers: await headers(backend, { "Content-Type": type, "X-File-Name": encodeURIComponent(file.name) }), body: file })
  );
  return res.json();
}

/** Endereço para abrir ou tocar um material: assinado (Supabase) ou, no banco local, uma cópia baixada (blob). */
export async function lessonFileUrl(backend, materialId) {
  const link = await json(backend, `/materials/${materialId}/link`);
  if (link.url) return link.url;
  const res = await parse(await fetch(`${BASE}/materials/${materialId}/file`, { headers: await headers(backend) }));
  return URL.createObjectURL(await res.blob());
}

/** Endereço de vídeo → como incorporar: {kind: "youtube"|"vimeo"|"file"|"link", src}. */
export function videoEmbed(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}` };
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v") || (u.pathname.startsWith("/embed/") || u.pathname.startsWith("/shorts/") ? u.pathname.split("/")[2] : null);
      return id ? { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` } : { kind: "link", src: url };
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return /^\d+$/.test(id ?? "") ? { kind: "vimeo", src: `https://player.vimeo.com/video/${id}` } : { kind: "link", src: url };
    }
    if (/\.(mp4|webm|m3u8)(\?|$)/i.test(u.pathname)) return { kind: "file", src: url };
    return { kind: "link", src: url };
  } catch {
    return null;
  }
}

/** 42 → "42 min" · 90 → "1h30". */
export function durationLabel(minutes) {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)}h${rest ? String(rest).padStart(2, "0") : ""}`;
}

export function sizeLabel(bytes) {
  if (!bytes) return "";
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
