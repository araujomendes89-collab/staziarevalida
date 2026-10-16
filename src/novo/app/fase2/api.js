// Chamadas RPC da 2ª fase no backend do Supabase.
// Sem lógica extra.

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

    peps(limit = 100) {
      return backend.rpc("app_fase2_peps", { p_limit: limit });
    },

    performance() {
      return backend.rpc("app_fase2_performance");
    },
  };
}
