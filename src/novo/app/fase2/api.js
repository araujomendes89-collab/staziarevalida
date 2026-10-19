// Chamadas RPC da 2ª fase no backend do Supabase.
// Sem lógica extra, exceto as duas rotas do servidor do treino sozinho (/api/dupla/solo): a avaliação por IA e a imagem dos
// impressos. As duas levam o token da sessão; nenhuma chave de IA passa pelo navegador.

const SOLO_BASE = "/api/dupla/solo";

async function authHeaders(backend, extra = {}) {
  const token = backend?.accessToken ? await backend.accessToken() : null;
  if (!token) throw new Error("Entre de novo na sua conta para continuar.");
  return { Authorization: `Bearer ${token}`, ...extra };
}

/** Resposta de erro da rota: a mensagem em português vem do servidor (`error`); `status` fica no erro. */
async function routeError(res) {
  let message = `Erro ${res.status}.`;
  try {
    message = (await res.json()).error ?? message;
  } catch {
    // resposta sem corpo
  }
  const error = new Error(message);
  error.status = res.status;
  return error;
}

export function fase2Api(backend) {
  if (!backend) {
    throw new Error("Backend não disponível para a 2ª fase.");
  }

  return {
    overview() {
      return backend.rpc("app_fase2_overview");
    },

    stations() {
      return backend.rpc("app_fase2_stations");
    },

    start(stationId) {
      return backend.rpc("app_fase2_start", { p_station_id: stationId });
    },

    attempt(attemptId) {
      return backend.rpc("app_fase2_attempt", { p_attempt_id: attemptId });
    },

    begin(attemptId) {
      return backend.rpc("app_fase2_begin", { p_attempt_id: attemptId });
    },

    finish(attemptId) {
      return backend.rpc("app_fase2_finish", { p_attempt_id: attemptId });
    },

    submit(attemptId, marks) {
      return backend.rpc("app_fase2_submit", { p_attempt_id: attemptId, p_marks: marks });
    },

    abandon(attemptId) {
      return backend.rpc("app_fase2_abandon", { p_attempt_id: attemptId });
    },

    // Treino sozinho com texto (migração 014100). `answers` = [{ task: 1..30, text }].
    saveAnswers(attemptId, answers) {
      return backend.rpc("app_fase2_save_answers", { p_attempt_id: attemptId, p_answers: answers });
    },

    openPressing(attemptId, pressingId) {
      return backend.rpc("app_fase2_open_pressing", { p_attempt_id: attemptId, p_pressing_id: pressingId });
    },

    deliver(attemptId, answers = null) {
      return backend.rpc("app_fase2_deliver", { p_attempt_id: attemptId, p_answers: answers });
    },

    /** "Avisar a equipe que a avaliação errou": `order` (número do item) é opcional; sem ele o aviso vale para a avaliação toda. */
    reportIa(attemptId, order = null, note = "") {
      return backend.rpc("app_fase2_report_ia", { p_attempt_id: attemptId, p_order: order, p_note: note });
    },

    /** Pede a avaliação por IA (rota do servidor, que confere tudo e responde com a mensagem em português se recusar). */
    async evaluate(attemptId) {
      const res = await fetch(`${SOLO_BASE}/${encodeURIComponent(attemptId)}/evaluate`, {
        method: "POST",
        headers: await authHeaders(backend, { "Content-Type": "application/json" }),
        body: "{}",
      });
      if (!res.ok) throw await routeError(res);
      try {
        return await res.json();
      } catch {
        return null;
      }
    },

    /**
     * Endereço da imagem de um impresso JÁ ABERTO: assinado por 10 minutos (Supabase) ou, em desenvolvimento, uma cópia baixada
     * (blob). Sem imagem (404) ou sem servidor: null. O caminho do arquivo nunca chega à tela.
     */
    async printUrl(attemptId, pressingId) {
      if (!backend?.accessToken) return null;
      const headers = await authHeaders(backend);
      const base = `${SOLO_BASE}/${encodeURIComponent(attemptId)}/prints/${encodeURIComponent(pressingId)}`;
      const link = await fetch(`${base}/link`, { headers });
      if (link.status === 404) return null;
      if (!link.ok) throw await routeError(link);
      const { url } = await link.json();
      if (url) return url;
      const file = await fetch(`${base}/file`, { headers });
      if (!file.ok) return null;
      return URL.createObjectURL(await file.blob());
    },

    peps(limit = 100) {
      return backend.rpc("app_fase2_peps", { p_limit: limit });
    },

    performance() {
      return backend.rpc("app_fase2_performance");
    },

    // Treino em Dupla (migração 013400): rodadas em que a pessoa foi candidata ou avaliadora, e o resultado de uma delas,
    // inclusive depois de a sala fechar.
    duplaHistory(limit = 100) {
      return backend.rpc("app_dupla_history", { p_limit: limit });
    },

    duplaHistoryResult(roomId, round) {
      return backend.rpc("app_dupla_history_result", { p_room_id: roomId, p_round: round });
    },
  };
}
