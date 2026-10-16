// Sala ao vivo do Treinamento em Dupla: estado da sala (useRoomState: tempo real que só avisa + consultas), conteúdo do meu
// papel, marcações do PEP (só o avaliador), resultado e as ações. Cada ação chama uma função do banco (app_dupla_*), troca o
// estado pelo que o servidor devolveu e, se der erro, mostra o motivo do servidor no aviso (`notice`). A tela nunca decide nada
// sozinha: papéis, estação, cronômetro, impressos e nota são do servidor.
import React from "react";
import { useSession } from "../../session.jsx";
import { messageOf } from "../../admin/common.jsx";
import { useRoomState } from "../live.js";
import { printUrl as fetchPrintUrl } from "../printsApi.js";

/** A marcação do PEP vai ao servidor 300 ms depois do último toque no item (uma chamada por item). */
export const MARK_DEBOUNCE_MS = 300;

/** Rascunhos que ficam só no aparelho do avaliador, por sala e rodada; apagados depois de finalizar. */
export const notesKey = (roomId, round) => `smn-dupla-notas:${roomId}:${round}`;
export const feedbackKey = (roomId, round) => `smn-dupla-feedback:${roomId}:${round}`;

export function readDraft(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
export function writeDraft(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: o rascunho vale só nesta tela */
  }
}
function dropDraft(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nada a apagar */
  }
}

function marksByItem(rows) {
  const map = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    map[row.item_id] = { grade: row.grade ?? null, subitems: Array.isArray(row.subitems) ? row.subitems : [] };
  }
  return map;
}

/** O conteúdo do meu papel muda com a rodada, a fase (papéis → sala → resultado), o papel, a estação e, para o candidato, os liberados. */
function contentKeyOf(room) {
  if (!room || room.phase === "closed") return null;
  const stage = room.phase === "roles" ? "roles" : room.phase === "result" ? "result" : "sala";
  const role = room.me?.role ?? "";
  const station = room.station ? room.station.id ?? room.station.label ?? "?" : "";
  const released = role === "candidate" ? (room.released_pressings || []).join(",") : "";
  return [room.round, stage, role, station, released].join("|");
}

/**
 * @param {string} roomId
 * @returns {{ room: object | null, content: object | null, marks: Record<string, { grade: string | null, subitems: string[] }>,
 *   result: object | null, error: Error | null, loading: boolean, reload(): void, actions: object, notice: object | null,
 *   offsetMs: number, live: boolean, channelReady: boolean, partnerPresent: boolean | null, partnerAway: boolean }}
 */
export function useRoom(roomId) {
  const { backend } = useSession();
  const live = useRoomState(roomId);
  const { room } = live;
  const [content, setContent] = React.useState({ key: null, data: null });
  const [marks, setMarks] = React.useState({});
  const [result, setResult] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const roomRef = React.useRef(room);
  roomRef.current = room;
  const applyRef = React.useRef(live.apply);
  applyRef.current = live.apply;
  const pending = React.useRef(new Map()); // itemId → { grade, subitems, timer }

  const say = React.useCallback((text, tone = "danger") => setNotice({ text, tone, k: Date.now() + Math.random() }), []);

  // ---------------------------------------------------------------- conteúdo do meu papel
  const contentKey = contentKeyOf(room);
  React.useEffect(() => {
    if (!contentKey || !backend) return undefined;
    let alive = true;
    backend.rpc("app_dupla_room_content", { p_room_id: roomId }).then(
      (data) => alive && setContent({ key: contentKey, data }),
      (e) => alive && (say(messageOf(e)), setContent((c) => ({ ...c, key: contentKey })))
    );
    return () => {
      alive = false;
    };
  }, [backend, roomId, contentKey, say]);

  // ---------------------------------------------------------------- marcações (só o avaliador; as minhas pendentes valem mais)
  const isEval = room?.me?.role === "evaluator";
  const marksKey = isEval && room && ["setup", "running", "review"].includes(room.phase) ? `${room.round}|${room.phase === "review" ? "review" : "sala"}` : null;
  React.useEffect(() => {
    if (!marksKey || !backend) return undefined;
    let alive = true;
    backend.rpc("app_dupla_marks", { p_room_id: roomId }).then(
      (rows) => {
        if (!alive) return;
        const server = marksByItem(rows);
        setMarks((local) => {
          const out = { ...server };
          for (const id of pending.current.keys()) if (local[id]) out[id] = local[id];
          return out;
        });
      },
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [backend, roomId, marksKey]);
  React.useEffect(() => {
    setMarks({});
  }, [room?.round]);

  // ---------------------------------------------------------------- resultado da rodada
  const resultKey = room?.phase === "result" ? `${room.round}|${room.rev}` : null;
  React.useEffect(() => {
    if (!resultKey || !backend) return undefined;
    let alive = true;
    backend.rpc("app_dupla_result", { p_room_id: roomId, p_round: roomRef.current.round }).then(
      (data) => alive && setResult(data),
      (e) => alive && say(messageOf(e))
    );
    return () => {
      alive = false;
    };
  }, [backend, roomId, resultKey, say]);

  // ---------------------------------------------------------------- ações
  const actions = React.useMemo(() => {
    const call = async (fn, args = {}) => {
      const sentAt = Date.now();
      try {
        const res = await backend.rpc(fn, { p_room_id: roomId, ...args });
        if (res && typeof res === "object" && res.id && res.phase) applyRef.current(res, sentAt, Date.now());
        return res ?? true;
      } catch (e) {
        say(messageOf(e));
        return null;
      }
    };
    const sendMark = (itemId) => {
      const p = pending.current.get(itemId);
      if (!p) return Promise.resolve();
      clearTimeout(p.timer);
      pending.current.delete(itemId);
      return backend
        .rpc("app_dupla_mark", { p_room_id: roomId, p_item_id: itemId, p_grade: p.grade, p_subitems: p.subitems })
        .then(
          () => undefined,
          (e) => say(messageOf(e))
        );
    };
    const flushMarks = () => Promise.all([...pending.current.keys()].map(sendMark)).then(() => undefined);
    const partnerId = () => roomRef.current?.partner?.user_id;
    const meId = () => roomRef.current?.me?.user_id;
    const round = () => roomRef.current?.round;
    return {
      chooseRole: (role) => call("app_dupla_set_roles", { p_candidate_id: role === "candidate" ? meId() : partnerId() }),
      drawRoles: () => call("app_dupla_draw_roles"),
      setStation: (stationId) => call("app_dupla_set_station", { p_station_id: stationId }),
      confirmRoles: () => call("app_dupla_confirm_roles"),
      connected: () => call("app_dupla_connected"),
      setReady: (ready) => call("app_dupla_ready", { p_ready: Boolean(ready) }),
      setDuration: (ms) => call("app_dupla_set_duration", { p_duration_ms: Math.round(ms) }),
      start: () => call("app_dupla_start"),
      pause: () => call("app_dupla_pause"),
      resume: () => call("app_dupla_resume"),
      adjust: async (deltaMs) => {
        const res = await call("app_dupla_adjust", { p_delta_ms: deltaMs });
        if (res) say(deltaMs < 0 ? "Tempo reduzido em 1 minuto" : "1 minuto adicionado", "success");
        return res;
      },
      release: (pressingId, released) => call("app_dupla_release", { p_pressing_id: pressingId, p_released: Boolean(released) }),
      mark: (itemId, grade, subitems = []) => {
        setMarks((m) => ({ ...m, [itemId]: { grade: grade ?? null, subitems } }));
        const old = pending.current.get(itemId);
        if (old) clearTimeout(old.timer);
        const timer = setTimeout(() => void sendMark(itemId), MARK_DEBOUNCE_MS);
        pending.current.set(itemId, { grade: grade ?? null, subitems, timer });
      },
      flushMarks,
      finish: async () => {
        await flushMarks();
        return call("app_dupla_finish");
      },
      finalize: async (feedback) => {
        await flushMarks();
        const r = roomRef.current;
        const res = await call("app_dupla_finalize", { p_feedback: { pos: feedback?.pos ?? "", neg: feedback?.neg ?? "", gen: feedback?.gen ?? "" } });
        if (res && r) {
          dropDraft(feedbackKey(r.id, r.round));
          dropDraft(notesKey(r.id, r.round));
        }
        return res;
      },
      leave: () => call("app_dupla_leave"),
      requestReview: (reason) => call("app_dupla_request_review", { p_round: round(), p_reason: reason }),
      redoReview: () => call("app_dupla_redo_review", { p_round: round() }),
      // "Treinar outra estação": rodada seguinte com o mesmo par, sem papéis e sem estação (decisão do dono de 16/10: sem
      // inverter papéis na mesma estação, porque o novo candidato já viu o tema como avaliador).
      nextStation: () => call("app_dupla_next_station"),
      printUrl: (pressingId) => fetchPrintUrl(backend, roomId, pressingId).catch(() => null),
    };
  }, [backend, roomId, say]);

  // Marcação pendente vai na hora quando a página some (troca de aba para a chamada, celular, fechar).
  React.useEffect(() => {
    const flush = () => void actions.flushMarks();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [actions]);

  const contentReady = !contentKey || content.key === contentKey || content.data != null;
  return {
    room,
    content: room?.phase === "closed" ? null : content.data,
    marks,
    result,
    error: live.error,
    loading: !live.error && (!room || !contentReady),
    reload: () => void live.refresh(),
    actions,
    notice,
    offsetMs: live.offsetMs,
    live: live.live,
    channelReady: live.channelReady,
    partnerPresent: live.partnerPresent,
    partnerAway: live.partnerAway,
  };
}
