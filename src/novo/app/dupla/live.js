// Treino em Dupla · tempo real do Praticar e do Perfil de estudo: sinal de que a pessoa está online (heartbeat), canal
// `dupla:online` (Presença + aviso de convite) e a lista de convites. O tempo real só AVISA; quem diz o que existe são as funções do
// banco (`app_dupla_heartbeat`, `app_dupla_invites`). Sem o canal (banco local, ou canal com erro) as telas consultam de tempos em tempos.
import React from "react";
import { useSession } from "../session.jsx";

const HEARTBEAT_MS = 45000;
/** Consulta de convites: sem tempo real a cada 5 s; com tempo real só de segurança, a cada 30 s. */
const POLL_LOCAL_MS = 5000;
const POLL_LIVE_MS = 30000;

/** Erros de rede nunca derrubam a tela: o próximo sinal ou a próxima consulta refaz. */
function quiet(call) {
  try {
    return Promise.resolve(call()).catch(() => undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}

/** Avisa o banco que a pessoa está aqui; "fora" tira da lista na hora. */
function sendSignal(backend, status, roomId) {
  return quiet(() => backend.rpc("app_dupla_heartbeat", { p_status: status, p_room_id: roomId ?? null }));
}

function pageVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/**
 * Sinal de presença no banco: na montagem, a cada `intervalMs` (45 s) e ao voltar a aba; "fora" ao sair da tela e ao fechar
 * ou esconder a página (pagehide). Trocar `status`/`roomId` (ex.: do Praticar para a sala) manda o novo sinal sem passar por "fora".
 * @param {"livre" | "em_estacao"} status
 * @param {string | null} [roomId]
 * @param {number} [intervalMs]
 */
export function useHeartbeat(status, roomId = null, intervalMs = HEARTBEAT_MS) {
  const { backend } = useSession();

  React.useEffect(() => {
    if (!backend) return undefined;
    const beat = () => {
      void sendSignal(backend, status, roomId);
    };
    beat();
    const timer = setInterval(beat, intervalMs);
    const onVisible = () => {
      if (pageVisible()) beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [backend, status, roomId, intervalMs]);

  React.useEffect(() => {
    if (!backend) return undefined;
    const leave = () => {
      void sendSignal(backend, "fora", null);
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [backend]);
}

/**
 * Canal `dupla:online`. Com `radar` ligado a pessoa se anuncia na Presença ({ user_id, status: "livre" }); desligado, sai dela.
 * Devolve quem está online (sem mim; `null` enquanto não há Presença), um contador que sobe a cada convite novo e se o canal está
 * ligado. Sem `subscribeInvites` no backend (banco local) devolve { onlineIds: null, inviteTick: 0, live: false }.
 * @param {{ radar: boolean }} p
 * @returns {{ onlineIds: Set<string> | null, inviteTick: number, live: boolean }}
 */
export function useDuplaChannel({ radar }) {
  const { backend, user } = useSession();
  const userId = user?.id ?? null;
  const [state, setState] = React.useState({ onlineIds: null, inviteTick: 0, live: false });
  const handleRef = React.useRef(null);

  React.useEffect(() => {
    if (!backend?.subscribeInvites || !userId) return undefined;
    const handle = backend.subscribeInvites(userId, {
      onInvite: () => setState((s) => ({ ...s, inviteTick: s.inviteTick + 1 })),
      onPresence: (members) =>
        setState((s) => ({ ...s, onlineIds: new Set(members.map((m) => m.user_id).filter((id) => id && id !== userId)) })),
      onStatus: (status) =>
        setState((s) => (status === "SUBSCRIBED" ? { ...s, live: true } : { ...s, live: false, onlineIds: null })),
    });
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.untrack();
      handle.close();
      setState((s) => ({ ...s, live: false, onlineIds: null }));
    };
  }, [backend, userId]);

  React.useEffect(() => {
    const handle = handleRef.current;
    if (!handle || !userId) return;
    if (radar) handle.track({ user_id: userId, status: "livre" });
    else handle.untrack();
  }, [radar, backend, userId]);

  return state;
}

/**
 * @typedef {{ id: string, room_id: string, from: { user_id: string, public_name: string }, expires_at: string }} Invite
 */

/**
 * Convites pendentes para mim (`app_dupla_invites`). Consulta na entrada, a cada aviso (`inviteTick`), ao voltar a aba e a rede e por
 * relógio: 5 s no banco local (ou canal fora do ar), 30 s com o tempo real ligado (`live`). Erro de rede mantém a lista anterior e
 * resposta atrasada nunca vence uma mais nova.
 * @param {number} inviteTick
 * @param {boolean} live
 * @returns {{ invites: Invite[], serverNow: string | null, refresh(): Promise<void> }}
 */
export function useInvites(inviteTick, live) {
  const { backend } = useSession();
  const [state, setState] = React.useState({ invites: [], serverNow: null });
  const seq = React.useRef(0);
  const alive = React.useRef(true);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = React.useCallback(async () => {
    if (!backend) return;
    const mine = ++seq.current;
    const res = await quiet(() => backend.rpc("app_dupla_invites"));
    if (!alive.current || mine !== seq.current || !res) return;
    setState({ invites: Array.isArray(res.invites) ? res.invites : [], serverNow: res.server_now ?? null });
  }, [backend]);

  React.useEffect(() => {
    void refresh();
  }, [refresh, inviteTick]);

  React.useEffect(() => {
    const timer = setInterval(() => void refresh(), live ? POLL_LIVE_MS : POLL_LOCAL_MS);
    const onVisible = () => {
      if (pageVisible()) void refresh();
    };
    const onOnline = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh, live]);

  return { invites: state.invites, serverNow: state.serverNow, refresh };
}
