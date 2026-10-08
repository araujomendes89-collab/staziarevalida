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
  let code = null;
  try {
    const data = await res.json();
    message = data.error ?? message;
    code = data.code ?? null; // "tutor_consent": falta o aceite do Tutor (a tela mostra o cartão)
  } catch {
    // resposta sem corpo
  }
  const error = new Error(message);
  error.status = res.status;
  error.code = code;
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
  start: (backend, sessionId, force = false, sdp = null, avoid = null) =>
    voicePost(backend, "start", { session_id: sessionId, force, ...(sdp ? { sdp } : {}), ...(avoid?.length ? { avoid } : {}) }),
  renew: (backend, voiceCallId, callId) => voicePost(backend, "renew", { voice_call_id: voiceCallId, call_id: callId ?? null }),
  end: (backend, voiceCallId, reason = "student", metrics = null) => voicePost(backend, "end", metrics ? { voice_call_id: voiceCallId, reason, metrics } : { voice_call_id: voiceCallId, reason }),
  metrics: (backend, voiceCallId, metrics) => voicePost(backend, "metrics", { voice_call_id: voiceCallId, metrics }),
  /** GPT-Live delegou: o servidor responde com o motor do Tutor (o que dizer, o tom e contexto silencioso). */
  delegate: (backend, voiceCallId, body) => voicePost(backend, "delegate", { voice_call_id: voiceCallId, ...body }),
  usage: (backend, voiceCallId, usage) => voicePost(backend, "usage", { voice_call_id: voiceCallId, usage }),
  transcript: (backend, voiceCallId, role, text) => voicePost(backend, "transcript", { voice_call_id: voiceCallId, role, text }),
  tool: (backend, voiceCallId, name, args) => voicePost(backend, "tool", { voice_call_id: voiceCallId, name, arguments: args }),
};

/** Erro do servidor com status, código e direito de uso (o aplicativo age pelo código: tutor_consent, busy, voice_*…). */
async function failure(res) {
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
  return error;
}

/**
 * Nexus: o estado por professor (voz do professor, reserva, minutos), a abertura (o jeito da conversa), o turno pela voz do
 * professor, a transcrição da fala do aluno (o áudio vai cru, só para o servidor) e a amostra aprovada do "Ouvir".
 */
export const nexusApi = {
  status: async (backend) => {
    const res = await fetch(`${BASE}/nexus`, { headers: await headers(backend) });
    if (!res.ok) throw await failure(res);
    return res.json();
  },
  /** skip: no meio da conversa, "eleven" pula a voz do professor e "voice" pula as duas (o servidor escolhe o jeito que sobra). */
  open: (backend, sessionId, force = false, skip = null) => voicePost(backend, "open", { session_id: sessionId, ...(force ? { force: true } : {}), ...(skip ? { skip } : {}) }),
  say: (backend, body) => voicePost(backend, "say", body),
  transcribe: async (backend, voiceCallId, blob, seconds) => {
    const res = await fetch(`${BASE}/voice/transcribe`, {
      method: "POST", body: blob,
      headers: await headers(backend, { "Content-Type": blob.type || "audio/webm", "X-Voice-Call-Id": voiceCallId, "X-Audio-Seconds": String(Math.round(seconds * 10) / 10) }),
    });
    if (!res.ok) throw await failure(res);
    return res.json();
  },
  sample: async (backend, personalityId) => {
    const res = await fetch(`${BASE}/voice/sample/${encodeURIComponent(personalityId)}`, { headers: await headers(backend) });
    if (!res.ok) throw await failure(res);
    return res.blob();
  },
};
