// Assistente de IA da aula (/api/lessons/assist): o servidor chama a IA escolhida (Gemini, Claude ou OpenAI) só com o material
// enviado. O PDF é lido aqui no navegador (texto por página, sem enviar o arquivo), o que evita o limite de 4,5 MB da Vercel.
const BASE = "/api/lessons";
export const MAX_ASSIST_CHARS = 400_000;

async function call(backend, path, body) {
  const token = backend.accessToken ? await backend.accessToken() : null;
  if (!token) throw new Error("O assistente precisa do servidor: entre de novo na sua conta.");
  const res = await fetch(BASE + path, body === undefined ? { headers: { Authorization: `Bearer ${token}` } } : { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    let message = `Erro ${res.status}.`;
    try {
      message = (await res.json()).error ?? message;
    } catch {
      // sem corpo
    }
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.json();
}

export const assistAvailable = (backend) => Boolean(backend?.accessToken);
export const assistProviders = (backend) => call(backend, "/assist/providers");
export const runLessonAssist = (backend, body) => call(backend, "/assist", body);

/** PDF (File, Blob ou ArrayBuffer) → texto por página, no próprio navegador. PDF escaneado volta sem texto. */
export async function pdfPages(input) {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const buffer = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [String(text ?? "")]).map((t, i) => ({ page: i + 1, text: String(t ?? "").trim() }));
}

/** Mantém as páginas até o limite de caracteres do servidor; diz quantas ficaram de fora. */
export function capPages(pages, max = MAX_ASSIST_CHARS) {
  const kept = [];
  let used = 0;
  for (const p of pages) {
    if (used + p.text.length > max) break;
    kept.push(p);
    used += p.text.length;
  }
  return { pages: kept, dropped: pages.length - kept.length, chars: used };
}
