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

/**
 * Voz natural de um texto que o servidor já validou: { kind: "message", session_id, message_id } | { kind: "question", session_id }
 * | { kind: "phrase", phrase, letter?, personality_id }. Devolve o áudio (Blob).
 */
export async function tutorSpeech(backend, body) {
  const res = await fetch(`${BASE}/speech`, { method: "POST", headers: await headers(backend, { "Content-Type": "application/json" }), body: JSON.stringify(body) });
  if (!res.ok) await parse(res);
  return res.blob();
}

export async function tutorServerStatus(backend) {
  return parse(await fetch(`${BASE}/status`, { headers: await headers(backend) }));
}

/** Voz em tempo real: o servidor confere direito, cota e reserva; devolve o segredo temporário da OpenAI (nunca a chave). */
async function voicePost(backend, path, body) {
  const res = await fetch(`${BASE}/voice/${path}`, { method: "POST", headers: await headers(backend, { "Content-Type": "application/json" }), body: JSON.stringify(body) });
  if (res.ok) return res.json();
  let data = {};
  try {
    data = await res.json();
  } catch {
    // resposta sem corpo
  }
  const error = new Error(data.error ?? `Erro ${res.status}.`);
  error.status = res.status;
  error.code = data.code ?? null;
  error.entitlement = data.entitlement ?? null;
  throw error;
}
export const voiceApi = {
  /** Com a oferta WebRTC (sdp), o servidor pode abrir o GPT-Live e devolver a resposta; sem ela, devolve o segredo do Realtime. */
  start: (backend, sessionId, force = false, sdp = null) => voicePost(backend, "start", sdp ? { session_id: sessionId, force, sdp } : { session_id: sessionId, force }),
  renew: (backend, voiceCallId, callId) => voicePost(backend, "renew", { voice_call_id: voiceCallId, call_id: callId ?? null }),
  end: (backend, voiceCallId, reason = "student", metrics = null) => voicePost(backend, "end", metrics ? { voice_call_id: voiceCallId, reason, metrics } : { voice_call_id: voiceCallId, reason }),
  metrics: (backend, voiceCallId, metrics) => voicePost(backend, "metrics", { voice_call_id: voiceCallId, metrics }),
  /** GPT-Live delegou: o servidor responde com o motor do Tutor (o que dizer, o tom e contexto silencioso). */
  delegate: (backend, voiceCallId, body) => voicePost(backend, "delegate", { voice_call_id: voiceCallId, ...body }),
  usage: (backend, voiceCallId, usage) => voicePost(backend, "usage", { voice_call_id: voiceCallId, usage }),
  transcript: (backend, voiceCallId, role, text) => voicePost(backend, "transcript", { voice_call_id: voiceCallId, role, text }),
  tool: (backend, voiceCallId, name, args) => voicePost(backend, "tool", { voice_call_id: voiceCallId, name, arguments: args }),
};
