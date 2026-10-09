// Chamadas às rotas do servidor da Central de Conteúdo (/api/content-hub), com o token da
// sessão. Nenhuma chave de serviço ou de IA passa pelo navegador.

const BASE = "/api/content-hub";

async function headers(backend, extra = {}) {
  const token = backend.accessToken ? await backend.accessToken() : null;
  if (!token) throw new Error("A Central de Conteúdo precisa do servidor: entre de novo ou use o modo com servidor.");
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function parse(res) {
  if (res.ok) return res.headers.get("content-type")?.includes("json") ? res.json() : res;
  let message = `Erro ${res.status}.`;
  try {
    message = (await res.json()).error ?? message;
  } catch {
    // resposta sem corpo
  }
  throw new Error(message);
}

export const hubAvailable = (backend) => Boolean(backend?.accessToken);

export async function hubGet(backend, path) {
  return parse(await fetch(BASE + path, { headers: await headers(backend) }));
}

export async function hubPost(backend, path, body) {
  return parse(await fetch(BASE + path, { method: "POST", headers: await headers(backend, { "Content-Type": "application/json" }), body: JSON.stringify(body ?? {}) }));
}

export async function hubPut(backend, path, body) {
  return parse(await fetch(BASE + path, { method: "PUT", headers: await headers(backend, { "Content-Type": "application/json" }), body: JSON.stringify(body ?? {}) }));
}

/** Envia um arquivo qualquer (corpo bruto) com o tipo dele, ex.: imagem da ilustração de um material visual. */
export async function hubUploadFile(backend, path, file) {
  return parse(await fetch(BASE + path, { method: "POST", headers: await headers(backend, { "Content-Type": file.type || "application/octet-stream" }), body: file }));
}

/**
 * Envia um PDF (documento ou PDF completo de uma fonte). Com o Supabase, o arquivo vai direto ao depósito (envio
 * assinado) e o servidor só confirma: sem o limite de 4,5 MB do corpo das funções da Vercel (erro 413). No banco local,
 * o PDF segue pelo servidor (corpo bruto, metadados na consulta).
 */
export async function hubUploadPdf(backend, path, file, meta = {}, opts = {}) {
  const fields = Object.fromEntries(Object.entries(meta).filter(([, v]) => v != null && String(v).trim() !== ""));
  const prep = await hubPost(backend, `${path}/upload`, { size_bytes: file.size });
  if (prep.mode === "signed") {
    if (!backend.uploadToSignedUrl) throw new Error("Envio direto indisponível neste ambiente.");
    opts.onStage?.("enviando");
    await backend.uploadToSignedUrl(prep.bucket, prep.path, prep.token, file, "application/pdf", opts.onProgress);
    opts.onStage?.("conferindo");
    return hubPost(backend, `${path}/confirm`, { ...fields, key: prep.key, name: file.name });
  }
  const query = new URLSearchParams(fields);
  return parse(
    await fetch(`${BASE}${path}${query.size ? `?${query}` : ""}`, {
      method: "POST",
      headers: await headers(backend, { "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent(file.name) }),
      body: file,
    })
  );
}

/** Baixa um arquivo protegido e devolve um endereço local (blob) para exibir ou abrir. */
export async function hubBlobUrl(backend, path) {
  const res = await parse(await fetch(BASE + path, { headers: await headers(backend) }));
  return URL.createObjectURL(await res.blob());
}

/** Endereço do PDF original de um documento: assinado (Supabase, direto do depósito) ou, no banco local, uma cópia baixada (blob). */
export async function hubDocumentUrl(backend, id) {
  const link = await hubGet(backend, `/documents/${id}/link`);
  return link.url || hubBlobUrl(backend, `/documents/${id}/file`);
}
