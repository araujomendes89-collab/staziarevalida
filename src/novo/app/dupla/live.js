// Treino em Dupla · tempo real do Praticar e do Perfil de estudo: sinal de que a pessoa está online (heartbeat), canal
// `dupla:online` (Presença + aviso de convite) e a lista de convites. O tempo real só AVISA; quem diz o que existe são as funções do
// banco (`app_dupla_heartbeat`, `app_dupla_invites`). Sem o canal (banco local, ou canal com erro) as telas consultam de tempos em tempos.
import React from "react";
import { useSession } from "../session.jsx";
import { measureOffset } from "./clock.js";

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

// ------------------------------------------------------------------ sala ao vivo (Tarefa 15)
/** Sala sem tempo real (banco local, ou canal com erro): consulta rápida (só traz algo se o `rev` mudou) e completa. */
const ROOM_POLL_MS = 2000;
const ROOM_FULL_MS = 10000;
/** Com tempo real: avisos juntos em 300 ms viram uma consulta; consulta completa de segurança a cada 30 s. */
const ROOM_DEBOUNCE_MS = 300;
const ROOM_SAFETY_MS = 30000;
/** Parceiro ausente por mais de 30 s: "Reconectando…". */
export const PARTNER_AWAY_MS = 30000;

/**
 * Estado da sala ao vivo. O tempo real só AVISA (canal `room:{id}`: Presença e o aviso `sala`); quem diz o estado é sempre
 * `app_dupla_room`. Cada resposta mede a diferença de relógio com o servidor (`server_now`), usada pelo cronômetro.
 *  - ao vivo (`backend.subscribeRoom`): avisos agrupados em 300 ms → `app_dupla_room(p_since_rev = rev)`; presença do parceiro
 *    pelo canal; consulta completa a cada 30 s e ao voltar a aba ou a rede; canal com erro → passa ao modo local.
 *  - local: a cada 2 s com `p_since_rev` (vazio se nada mudou) e completa a cada 10 s; `channelReady` depois da 1ª consulta;
 *    parceiro presente = sinal há menos de 30 s (`partner.seen_ms_ago`).
 * Resposta mais velha (rev menor) nunca vence uma mais nova. Erro de rede depois da 1ª leitura não derruba a tela.
 * @param {string} roomId
 * @returns {{ room: object | null, error: Error | null, offsetMs: number, live: boolean, channelReady: boolean,
 *   partnerPresent: boolean | null, partnerAway: boolean, refresh(): Promise<void>, apply(room: object, sentAt?: number, receivedAt?: number): void }}
 */
export function useRoomState(roomId) {
  const { backend, user } = useSession();
  const userId = user?.id ?? null;
  const [state, setState] = React.useState({ room: null, error: null, offsetMs: 0, live: false, polled: false, presence: null });
  const roomRef = React.useRef(null);
  const alive = React.useRef(true);
  const liveRef = React.useRef(false);

  const apply = React.useCallback((room, sentAt, receivedAt) => {
    if (!room || typeof room !== "object" || !alive.current) return;
    const cur = roomRef.current;
    if (cur && cur.id === room.id && typeof room.rev === "number" && room.rev < cur.rev) return;
    roomRef.current = room;
    const offset = Number.isFinite(sentAt) && Number.isFinite(receivedAt) && room.server_now ? measureOffset(room.server_now, sentAt, receivedAt) : null;
    setState((s) => ({ ...s, room, error: null, polled: true, offsetMs: offset ?? s.offsetMs }));
  }, []);

  const fetchRoom = React.useCallback(
    async (full) => {
      if (!backend || !roomId) return;
      const since = full ? null : roomRef.current?.rev ?? null;
      const sentAt = Date.now();
      try {
        const res = await backend.rpc("app_dupla_room", { p_room_id: roomId, p_since_rev: since });
        const receivedAt = Date.now();
        if (!alive.current) return;
        if (res == null) {
          if (since == null) throw new Error("Sala não encontrada.");
          setState((s) => (s.polled ? s : { ...s, polled: true }));
          return;
        }
        apply(res, sentAt, receivedAt);
      } catch (error) {
        if (!alive.current || roomRef.current) return; // já há sala na tela: a próxima consulta refaz
        setState((s) => ({ ...s, error: error instanceof Error ? error : new Error(String(error)) }));
      }
    },
    [backend, roomId, apply]
  );

  React.useEffect(() => {
    alive.current = true;
    roomRef.current = null;
    setState({ room: null, error: null, offsetMs: 0, live: false, polled: false, presence: null });
    return () => {
      alive.current = false;
    };
  }, [roomId]);

  // Canal da sala (só no Supabase).
  React.useEffect(() => {
    if (!backend?.subscribeRoom || !roomId || !userId) return undefined;
    let timer = null;
    const handle = backend.subscribeRoom(roomId, userId, {
      onChange: () => {
        clearTimeout(timer);
        timer = setTimeout(() => void fetchRoom(false), ROOM_DEBOUNCE_MS);
      },
      onPresence: (members) => setState((s) => ({ ...s, presence: new Set(members.map((m) => m.user_id).filter(Boolean)) })),
      onStatus: (status) => {
        liveRef.current = status === "SUBSCRIBED";
        setState((s) => ({ ...s, live: liveRef.current, presence: liveRef.current ? s.presence : null }));
        if (liveRef.current) void fetchRoom(true);
      },
    });
    handle.track({ user_id: userId, status: "em_estacao" });
    return () => {
      clearTimeout(timer);
      liveRef.current = false;
      handle.untrack();
      handle.close();
    };
  }, [backend, roomId, userId, fetchRoom]);

  // Consultas: a primeira, as de reserva (local) ou de segurança (ao vivo), e ao voltar a aba ou a rede.
  React.useEffect(() => {
    void fetchRoom(true);
  }, [fetchRoom]);
  React.useEffect(() => {
    const timers = state.live
      ? [setInterval(() => void fetchRoom(true), ROOM_SAFETY_MS)]
      : [setInterval(() => void fetchRoom(false), ROOM_POLL_MS), setInterval(() => void fetchRoom(true), ROOM_FULL_MS)];
    const onVisible = () => {
      if (pageVisible()) void fetchRoom(true);
    };
    const onOnline = () => void fetchRoom(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      timers.forEach(clearInterval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [state.live, fetchRoom]);

  const room = state.room;
  const partnerId = room?.partner?.user_id ?? null;
  const seenPresent = typeof room?.partner?.seen_ms_ago === "number" ? room.partner.seen_ms_ago < PARTNER_AWAY_MS : null;
  const partnerPresent = state.live && state.presence ? (partnerId ? state.presence.has(partnerId) : false) : room ? seenPresent : null;

  // Ausente há mais de 30 s. No modo local o próprio sinal já diz "há 30 s"; ao vivo, a Presença some na hora: espera 30 s.
  const [awayLive, setAwayLive] = React.useState(false);
  React.useEffect(() => {
    if (!state.live || partnerPresent !== false) {
      setAwayLive(false);
      return undefined;
    }
    const t = setTimeout(() => setAwayLive(true), PARTNER_AWAY_MS);
    return () => clearTimeout(t);
  }, [state.live, partnerPresent]);
  const partnerAway = state.live ? awayLive : partnerPresent === false;

  return {
    room,
    error: state.error,
    offsetMs: state.offsetMs,
    live: state.live,
    channelReady: state.live || state.polled,
    partnerPresent,
    partnerAway,
    refresh: () => fetchRoom(true),
    apply,
  };
}
