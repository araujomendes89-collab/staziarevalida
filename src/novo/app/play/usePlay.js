// Dados do Stazia Play para as telas: resumo (app_gamification_summary) e atualização em tempo real
// da própria linha de estatísticas (Supabase Realtime, só quando o backend oferece).
import React from "react";
import { useSession } from "../session.jsx";

/** Resumo do aluno. `reload()` refaz a leitura; muda sozinho quando as estatísticas mudam no banco. */
export function usePlaySummary() {
  const { backend, user, boot } = useSession();
  const enabled = boot?.play?.enabled !== false;
  const [state, setState] = React.useState({ data: null, error: null, loading: enabled });
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!enabled) {
      setState({ data: { enabled: false }, error: null, loading: false });
      return undefined;
    }
    let alive = true;
    backend
      .rpc("app_gamification_summary")
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState((s) => ({ ...s, error, loading: false })));
    return () => {
      alive = false;
    };
  }, [backend, enabled, tick]);
  const reload = React.useCallback(() => setTick((n) => n + 1), []);
  useStatsRealtime(backend, user?.id, reload);
  return { ...state, reload };
}

/** Avisa quando user_gamification_stats do aluno muda (XP, posição, sequência); agrupa avisos seguidos. */
export function useStatsRealtime(backend, userId, onChange) {
  const ref = React.useRef(onChange);
  ref.current = onChange;
  React.useEffect(() => {
    if (!backend?.subscribeStats || !userId) return undefined;
    let timer = null;
    const stop = backend.subscribeStats(userId, () => {
      clearTimeout(timer);
      timer = setTimeout(() => ref.current?.(), 400);
    });
    return () => {
      clearTimeout(timer);
      stop?.();
    };
  }, [backend, userId]);
}

/** Carrega uma função do Play e permite recarregar (mesmo padrão de admin/common.jsx, sem depender dele). */
export function usePlayLoad(load, deps) {
  const [state, setState] = React.useState({ data: null, error: null, loading: true });
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState((s) => ({ ...s, error, loading: false })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((n) => n + 1), setData: (data) => setState((s) => ({ ...s, data })) };
}
