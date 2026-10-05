// Chamadas ao servidor do Stazia Tutor (/api/tutor) com o token da sessão. Nenhuma chave de IA passa pelo navegador.
const BASE = "/api/tutor";

async function headers(backend, extra = {}) {
  const token = backend.accessToken ? await backend.accessToken() : null;
  if (!token) throw new Error("O Tutor precisa do servidor: entre de novo na sua conta.");
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function parse(res) {
  if (res.ok) return res.json();
  let message = `Erro ${res.status}.`;
  try {
    message = (await res.json()).error ?? message;
  } catch {
    // resposta sem corpo
  }
  const error = new Error(message);
  error.status = res.status;
  throw error;
}

export const tutorAvailable = (backend) => Boolean(backend?.accessToken);

/** Um turno: { session_id, action: "message" | "hint" | "react", text?, voice?, interrupted? } */
export async function tutorTurn(backend, body) {
  return parse(await fetch(`${BASE}/turn`, { method: "POST", headers: await headers(backend, { "Content-Type": "application/json" }), body: JSON.stringify(body) }));
}

export async function tutorServerStatus(backend) {
  return parse(await fetch(`${BASE}/status`, { headers: await headers(backend) }));
}
