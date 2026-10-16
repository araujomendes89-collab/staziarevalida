// Chamadas ao servidor dos podcasts (/api/podcasts) com o token da sessão: fontes, roteiro com IA, áudio em partes e o link do
// áudio. Criar, editar, aprovar e publicar são funções do banco (backend.rpc), que conferem o papel de quem chama.
const BASE = "/api/podcasts";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function headers(backend, extra = {}) {
  const token = backend.accessToken ? await backend.accessToken() : null;
  if (!token) throw new Error("Os podcasts precisam do servidor: entre de novo na sua conta.");
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

async function call(backend, path, { method = "GET", body } = {}) {
  const init = body === undefined ? { method, headers: await headers(backend) } : { method, headers: await headers(backend, { "Content-Type": "application/json" }), body: JSON.stringify(body) };
  return (await parse(await fetch(BASE + path, init))).json();
}

export const podcastsAvailable = (backend) => Boolean(backend?.accessToken);

/** IA do roteiro (Gemini, Claude, OpenAI), vozes e o que falta configurar no servidor. */
export const podcastProviders = (backend) => call(backend, "/providers");

/** Tipo aceito para a fonte (PDF ou DOCX), ou null. */
export function sourceFileType(file) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "application/pdf";
  if (file.type === DOCX || /\.docx$/i.test(file.name)) return DOCX;
  return null;
}

/** PDF ou DOCX como fonte. Com o Supabase o arquivo vai direto ao depósito (envio assinado); no banco local, pelo servidor. */
export async function addFileSource(backend, id, file) {
  const type = sourceFileType(file);
  if (!type) throw new Error("Envie um PDF ou um DOCX.");
  const prep = await call(backend, `/${id}/sources/upload`, { method: "POST", body: { content_type: type, size_bytes: file.size } });
  if (prep.mode === "signed") {
    if (!backend.uploadToSignedUrl) throw new Error("Envio direto indisponível neste ambiente.");
    await backend.uploadToSignedUrl(prep.bucket, prep.path, prep.token, file, type);
    return call(backend, `/${id}/sources/confirm`, { method: "POST", body: { key: prep.key, title: file.name, content_type: type } });
  }
  const res = await parse(await fetch(`${BASE}/${id}/sources/file`, { method: "POST", headers: await headers(backend, { "Content-Type": type, "X-File-Name": encodeURIComponent(file.name) }), body: file }));
  return res.json();
}

export const addTextSource = (backend, id, title, text) => call(backend, `/${id}/sources/text`, { method: "POST", body: { title, text } });
export const addLinkSource = (backend, id, url) => call(backend, `/${id}/sources/link`, { method: "POST", body: { url } });
export const addLessonSource = (backend, id, lessonId) => call(backend, `/${id}/sources/lesson`, { method: "POST", body: { lesson_id: lessonId } });
export const renameSource = (backend, id, sourceId, title) => call(backend, `/${id}/sources/${sourceId}`, { method: "PATCH", body: { title } });
export const removeSource = (backend, id, sourceId) => call(backend, `/${id}/sources/${sourceId}`, { method: "DELETE" });

/** Roteiro com a IA escolhida: entra para revisão (nunca aprovado). Devolve { podcast, warnings }. */
export const generatePodcastScript = (backend, id, provider, notes) => call(backend, `/${id}/script`, { method: "POST", body: { provider, notes } });
export const checkPodcastScript = (backend, id) => call(backend, `/${id}/script/check`);

/**
 * Áudio do roteiro aprovado, parte por parte (cada parte é uma chamada curta ao servidor). `onProgress({ done, total })`.
 * Uma parte que falhar é tentada de novo uma vez antes de desistir.
 */
export async function generatePodcastAudio(backend, id, { provider, voices }, onProgress) {
  const job = await call(backend, `/${id}/audio/start`, { method: "POST", body: { provider, voices } });
  onProgress?.({ done: 0, total: job.parts });
  for (let index = 0; index < job.parts; index++) {
    try {
      await call(backend, `/${id}/audio/part`, { method: "POST", body: { job: job.job, index } });
    } catch (error) {
      if (error.status === 409 || error.status === 400 || error.status === 403) throw error;
      await call(backend, `/${id}/audio/part`, { method: "POST", body: { job: job.job, index } });
    }
    onProgress?.({ done: index + 1, total: job.parts });
  }
  onProgress?.({ done: job.parts, total: job.parts, finishing: true });
  return call(backend, `/${id}/audio/finish`, { method: "POST", body: { job: job.job } });
}

/** Endereço para tocar o episódio: assinado (Supabase) ou, no banco local, uma cópia baixada (blob). */
export async function podcastAudioUrl(backend, id) {
  const link = await call(backend, `/${id}/audio/link`);
  if (link.url) return link.url;
  const res = await parse(await fetch(`${BASE}/${id}/audio/file`, { headers: await headers(backend) }));
  return URL.createObjectURL(await res.blob());
}

export const attachFlashcast = (backend, id, lessonId) => call(backend, `/${id}/flashcast`, { method: "POST", body: { lesson_id: lessonId, confirm: true } });
/** Depois de editar o roteiro (feito direto no banco): o servidor apaga o áudio que deixou de valer, se nada mais o usa. Melhor esforço. */
export const cleanupPodcastFiles = (backend, id) => call(backend, `/${id}/files/cleanup`, { method: "POST", body: {} });
export const deletePodcast = (backend, id) => call(backend, `/${id}`, { method: "DELETE" });

/** IAs ou vozes indisponíveis, juntando as que têm o mesmo motivo: "Gemini, Claude e OpenAI: motivo". */
export function pendingText(list) {
  const byReason = new Map();
  for (const p of list) byReason.set(p.pending, [...(byReason.get(p.pending) ?? []), String(p.label).split(" (")[0]]);
  return [...byReason].map(([why, names]) => `${names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)}` : names[0]}: ${why}`).join(" · ");
}

export const STATUS_LABEL = { draft: "Rascunho", script_ready: "Roteiro para revisar", approved: "Roteiro aprovado", audio_ready: "Áudio pronto", published: "Publicado" };
export const STATUS_TONE = { draft: "neutral", script_ready: "warning", approved: "info", audio_ready: "brand", published: "success" };

/** 754 → "12 min 34 s" */
export function durationText(seconds) {
  if (!seconds && seconds !== 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m} min${s ? ` ${s} s` : ""}` : `${s} s`;
}
