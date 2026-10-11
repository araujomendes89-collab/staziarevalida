// Chamadas às rotas /api/ai-central (Central de IAs), com o token da sessão. Nenhuma chave de IA passa pelo navegador.
// (O prefixo /api/ai é do app antigo: /api/ai/models, /generate, ... continuam lá.)

const BASE = "/api/ai-central";

async function headers(backend, extra = {}) {
  const token = backend?.accessToken ? await backend.accessToken() : null;
  if (!token) throw new Error("A Central de IAs precisa do servidor: entre de novo ou use o modo com servidor.");
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function parse(res) {
  let data = null;
  try {
    data = await res.json();
  } catch {
    // resposta sem corpo
  }
  if (res.ok) return data ?? {};
  const error = new Error(data?.error ?? `Erro ${res.status}.`);
  if (Array.isArray(data?.problems)) error.problems = data.problems;
  if (Array.isArray(data?.warnings)) error.warnings = data.warnings;
  throw error;
}

export async function aiGet(backend, path) {
  return parse(await fetch(BASE + path, { headers: await headers(backend) }));
}

export async function aiSend(backend, method, path, body) {
  return parse(await fetch(BASE + path, { method, headers: await headers(backend, { "Content-Type": "application/json" }), body: JSON.stringify(body ?? {}) }));
}

export const PROVIDER_NAME = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini", ollama: "Ollama" };
/** Funções de IA e o nome na tela (Central de IAs e Administração › Registro). */
export const AI_FUNCTIONS = [
  ["criacao", "Criação"],
  ["verificacao", "Verificação e checagem"],
  ["engenharia_reversa", "Engenharia reversa"],
  ["assistente_preencher", "Assistente: preencher"],
  ["assistente_conferir", "Assistente: conferir"],
  ["assistente_revisar", "Assistente: conversar e revisar"],
];
export const AI_FUNCTION_NAME = Object.fromEntries(AI_FUNCTIONS);

/** Dólar em pt-BR: "US$ 0,0123" (até 4 casas); zero vira "US$ 0". */
export const usd = (n) => {
  const v = Number(n ?? 0);
  return v === 0 ? "US$ 0" : `US$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v)}`;
};
