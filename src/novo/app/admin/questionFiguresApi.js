// Chamadas ao servidor das figuras das questões (/api/question-figures) com o token da sessão: envio, troca e retirada pela
// equipe (Q07) e endereço da figura para quem a vê (aluno e equipe). O servidor guarda o arquivo no depósito privado.
const BASE = "/api/question-figures";
export const FIGURE_MAX_MB = 5;
export const FIGURE_MAX_BYTES = FIGURE_MAX_MB * 1024 * 1024;

async function headers(backend, extra = {}) {
  const token = backend.accessToken ? await backend.accessToken() : null;
  if (!token) throw new Error("As figuras precisam do servidor: entre de novo na sua conta.");
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
const json = async (backend, path, body, method) =>
  (await parse(await fetch(BASE + path, body === undefined && !method ? { headers: await headers(backend) } : { method: method ?? "POST", headers: await headers(backend, body === undefined ? {} : { "Content-Type": "application/json" }), body: body === undefined ? undefined : JSON.stringify(body) }))).json();

export const figuresAvailable = (backend) => Boolean(backend?.accessToken);

/** Tipo aceito para o arquivo (PNG ou JPG), ou null. */
export function figureFileType(file) {
  if (file.type === "image/png" || (!file.type && /\.png$/i.test(file.name))) return "image/png";
  if (file.type === "image/jpeg" || (!file.type && /\.jpe?g$/i.test(file.name))) return "image/jpeg";
  return null;
}

/** Texto em português para um erro de envio (as frases do nosso servidor já vêm em português; o resto vira uma frase geral). */
export function figureErrorText(error) {
  const text = String(error?.message ?? "").trim();
  if (error?.code === "network" || /failed to fetch|network|networkerror|conex/i.test(text)) return "Sem conexão com o servidor. Confira a internet e tente de novo.";
  if (error?.status === 413 || /exceeded|maximum allowed|too large|payload/i.test(text)) return `A figura pode ter no máximo ${FIGURE_MAX_MB} MB.`;
  if (/mime|not allowed|unsupported|invalid.*(file|format)/i.test(text)) return "O depósito não aceitou este tipo de arquivo. Envie uma imagem PNG ou JPG.";
  if (/expired|token|jwt|unauthori[sz]ed|forbidden|signature|permission/i.test(text)) return "O envio expirou ou não foi autorizado. Entre de novo e tente outra vez.";
  if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ].{3,300}[.!?]$/.test(text) && (/[áàâãéêíóôõúç]/i.test(text) || [400, 403, 404, 413, 415].includes(error?.status))) return text;
  return "Não foi possível enviar a figura. Tente de novo.";
}

/**
 * Envia (ou troca) a figura da questão e devolve a questão atualizada. Com o Supabase o arquivo vai direto ao depósito (envio
 * assinado); no banco local, pelo servidor.
 */
export async function uploadQuestionFigure(backend, questionId, file, alt) {
  const type = figureFileType(file);
  if (!type) throw new Error("Envie a figura em PNG ou JPG.");
  if (file.size > FIGURE_MAX_BYTES) throw new Error(`A figura pode ter no máximo ${FIGURE_MAX_MB} MB.`);
  const prep = await json(backend, `/${encodeURIComponent(questionId)}/upload`, { content_type: type, size_bytes: file.size });
  if (prep.mode === "signed") {
    if (!backend.uploadToSignedUrl) throw new Error("Envio direto indisponível neste ambiente.");
    await backend.uploadToSignedUrl(prep.bucket, prep.path, prep.token, file, type);
    return json(backend, `/${encodeURIComponent(questionId)}/confirm`, { key: prep.key, alt, content_type: type });
  }
  const res = await parse(
    await fetch(`${BASE}/${encodeURIComponent(questionId)}/figure?${new URLSearchParams({ alt })}`, { method: "POST", headers: await headers(backend, { "Content-Type": type }), body: file })
  );
  return res.json();
}

/** Tira a figura da questão (e o arquivo do depósito); devolve a questão atualizada. */
export const removeQuestionFigure = (backend, questionId) => json(backend, `/${encodeURIComponent(questionId)}/figure`, undefined, "DELETE");

/** Endereço para mostrar a figura n: assinado (Supabase) ou, no banco local, uma cópia baixada (blob). */
export async function questionFigureUrl(backend, questionId, index) {
  const link = await json(backend, `/${encodeURIComponent(questionId)}/${index}/link`);
  if (link.url) return link.url;
  const res = await parse(await fetch(`${BASE}/${encodeURIComponent(questionId)}/${index}/file`, { headers: await headers(backend) }));
  return URL.createObjectURL(await res.blob());
}
