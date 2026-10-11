// Cliente das rotas /api/admin-assistant: estado da IA de cada modo e execução do assistente. O navegador manda só o token da pessoa;
// chave e modelo ficam no servidor. O PDF é lido aqui (texto por página), como nas Aulas.
import { capPages, pdfPages } from "../lessonAssistApi.js";
import { ASSIST_ERRORS, SCREEN_STATUS, isBareStatusText } from "../../../../shared/adminAssistant/errors";

const BASE = "/api/admin-assistant";
const MAX_PAGES = 3000;

/**
 * O texto de um erro para a tela (Q13). Só aparece o que o servidor escreve de propósito, em português (códigos de `SCREEN_STATUS`);
 * qualquer outra coisa (falha da IA, erro imprevisto, rede, leitor de PDF), muitas vezes em inglês, vira `fallback`. O detalhe
 * técnico vai para o console do navegador.
 */
export function assistantErrorText(error, fallback = ASSIST_ERRORS.failed) {
  console.error("[assistente]", error);
  const text = String(error?.message ?? "").trim();
  return SCREEN_STATUS.includes(Number(error?.status)) && text && !isBareStatusText(text) ? text : fallback;
}

async function call(backend, path, body) {
  const token = backend.accessToken ? await backend.accessToken() : null;
  if (!token) throw Object.assign(new Error("O assistente precisa do servidor: entre de novo na sua conta."), { status: 401 });
  const res = await fetch(BASE + path, body === undefined ? { headers: { Authorization: `Bearer ${token}` } } : { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    let message = `Erro ${res.status}.`;
    try {
      const sent = (await res.json()).error;
      if (typeof sent === "string" && sent.trim()) message = sent;
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
  if (!all.some((p) => p.text.length > 40)) throw Object.assign(new Error("O PDF não tem texto aproveitável (pode ser escaneado). Cole o texto."), { status: 422 });
  const { pages, dropped } = capPages(all);
  const note = dropped > 0 ? `${pages.length} páginas lidas; ${dropped} ficaram de fora pelo limite de tamanho.` : `${pages.length} páginas lidas.`;
  return { pages, note };
}
