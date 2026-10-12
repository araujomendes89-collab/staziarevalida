// Estado da sala desenhado a partir do que o servidor gravou (leitura). Sem tempo real e sem relógio do servidor
// (Etapa 5: Tarefas 15 a 17). As ações ainda não fazem nada: as Tarefas 16, 17 e 18 as implementam.
import React from "react";
import { useSession } from "../../session.jsx";

const nothing = () => Promise.resolve();

/**
 * Ações da sala. Nesta tarefa todas resolvem sem fazer nada; as Tarefas 16, 17 e 18 implementam:
 *  chooseRole(role), drawRoles(), setStation(stationId), confirmRoles(), connected(), setLink(link), setReady(ready),
 *  setDuration(ms), start(), pause(), resume(), adjust(deltaMs), release(pressingId, released), mark(itemId, grade, subitems),
 *  finish(), finalize({ pos, neg, gen }), leave(), requestReview(reason), redoReview(), swap(), printUrl(pressingId)
 */
export function createRoomActions() {
  return {
    chooseRole: nothing,
    drawRoles: nothing,
    setStation: nothing,
    confirmRoles: nothing,
    connected: nothing,
    setLink: nothing,
    setReady: nothing,
    setDuration: nothing,
    start: nothing,
    pause: nothing,
    resume: nothing,
    adjust: nothing,
    release: nothing,
    mark: nothing,
    finish: nothing,
    finalize: nothing,
    leave: nothing,
    requestReview: nothing,
    redoReview: nothing,
    swap: nothing,
    printUrl: () => Promise.resolve(null),
  };
}

/**
 * Tempo que falta, em ms, a partir do que o servidor gravou: pausado → `paused_left_ms`; correndo → `ends_at − server_now`
 * (parado: a diferença de relógio e a contagem viva são da Tarefa 15); antes de iniciar → a duração da rodada.
 * @param {{ ends_at?: string | null, paused_left_ms?: number | null, server_now?: string, duration_ms?: number } | null} room
 * @returns {number | null}
 */
export function remainingOf(room) {
  if (!room) return null;
  if (typeof room.paused_left_ms === "number") return Math.max(0, room.paused_left_ms);
  if (room.ends_at) {
    const end = Date.parse(room.ends_at);
    const now = Date.parse(room.server_now);
    if (Number.isFinite(end) && Number.isFinite(now)) return Math.max(0, end - now);
  }
  return typeof room.duration_ms === "number" ? room.duration_ms : null;
}

function marksByItem(rows) {
  const map = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    map[row.item_id] = { grade: row.grade ?? null, subitems: Array.isArray(row.subitems) ? row.subitems : [] };
  }
  return map;
}

/**
 * @param {string} roomId
 * @returns {{ room: object | null, content: object | null, marks: Record<string, { grade: string | null, subitems: string[] }>,
 *   result: object | null, error: Error | null, loading: boolean, reload(): void, actions: object }}
 */
export function useRoom(roomId) {
  const { backend } = useSession();
  const [state, setState] = React.useState({ room: null, content: null, marks: {}, result: null, error: null, loading: true });
  const [tick, setTick] = React.useState(0);
  const actions = React.useMemo(() => createRoomActions(), []);
  const reload = React.useCallback(() => {
    setState((old) => (old.error ? { ...old, error: null, loading: true } : old));
    setTick((n) => n + 1);
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const room = await backend.rpc("app_dupla_room", { p_room_id: roomId, p_since_rev: null });
        if (!room) throw new Error("Sala não encontrada.");
        const closed = room.phase === "closed";
        const role = room.me?.role ?? null;
        const content = closed ? null : await backend.rpc("app_dupla_room_content", { p_room_id: roomId });
        const marks =
          role === "evaluator" && (room.phase === "running" || room.phase === "review")
            ? marksByItem(await backend.rpc("app_dupla_marks", { p_room_id: roomId }))
            : {};
        const result = room.phase === "result" ? await backend.rpc("app_dupla_result", { p_room_id: room.id, p_round: room.round }) : null;
        if (alive) setState({ room, content, marks, result, error: null, loading: false });
      } catch (error) {
        if (alive) setState((old) => ({ ...old, error: error instanceof Error ? error : new Error(String(error)), loading: false }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [backend, roomId, tick]);

  return { ...state, reload, actions };
}
