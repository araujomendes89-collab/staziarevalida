// Chamadas às rotas /api/ai (Central de IAs), com o token da sessão. Nenhuma chave de IA passa pelo navegador.

const BASE = "/api/ai";

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
