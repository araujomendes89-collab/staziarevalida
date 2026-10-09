// Cliente das rotas /api/admin-assistant: estado da IA de cada modo e execução do assistente. O navegador manda só o token da pessoa;
// chave e modelo ficam no servidor. O PDF é lido aqui (texto por página), como nas Aulas.
import { capPages, pdfPages } from "../lessonAssistApi.js";

const BASE = "/api/admin-assistant";
const MAX_PAGES = 3000;

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

export const assistantAvailable = (backend) => Boolean(backend?.accessToken);
export const fetchAssistantStatus = (backend, tab) => call(backend, `/status?tab=${encodeURIComponent(tab)}`);
export const postAssistantRun = (backend, body) => call(backend, "/run", body);

/** PDF → páginas com texto, já cortadas no limite do servidor. PDF escaneado (sem texto) vira erro. */
export async function readPdfMaterial(file) {
  const all = (await pdfPages(file)).slice(0, MAX_PAGES);
  if (!all.some((p) => p.text.length > 40)) throw new Error("O PDF não tem texto aproveitável (pode ser escaneado). Cole o texto.");
  const { pages, dropped } = capPages(all);
  const note = dropped > 0 ? `${pages.length} páginas lidas; ${dropped} ficaram de fora pelo limite de tamanho.` : `${pages.length} páginas lidas.`;
  return { pages, note };
}
