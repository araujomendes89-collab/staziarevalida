// Sala do Treinamento em Dupla, ao vivo: escolhe a fase a partir do que o servidor gravou (`room.phase`) e entrega a cada fase
// ({ room, content, marks, result, actions, go, remainingMs, askLeave, … }). O estado vem só das funções do banco (tempo real só
// avisa); o cronômetro conta a partir de `ends_at`/`paused_left_ms` do servidor corrigidos pela diferença de relógio.
// Aqui também: sinal de presença na sala, apito (início e fim do tempo), aviso "Reconectando…", confirmação de saída e a
// "sala do avaliador" aberta antes do início (estado só desta aba, em sessionStorage; o servidor continua em "setup").
import React from "react";
import { Button, Dialog, Icon, useToast } from "../../../ds";
import { LoadError } from "../../admin/common.jsx";
import { useSession } from "../../session.jsx";
import { useHeartbeat } from "../live.js";
import { installAudioWake, playWhistle } from "../sound.js";
import { remainingMs as remainingFrom } from "../clock.js";
import { ClosedPhase } from "./ClosedPhase.jsx";
import { ConnectingPhase } from "./ConnectingPhase.jsx";
import { ResultPhase } from "./ResultPhase.jsx";
import { ReviewPhase } from "./ReviewPhase.jsx";
import { RolesPhase } from "./RolesPhase.jsx";
import { RunningPhase } from "./RunningPhase.jsx";
import { SetupPhase } from "./SetupPhase.jsx";
import { useRoom } from "./useRoom.js";

const PHASES = {
  roles: RolesPhase,
  connecting: ConnectingPhase,
  setup: SetupPhase,
  running: RunningPhase,
  review: ReviewPhase,
  result: ResultPhase,
  closed: ClosedPhase,
};

const frame = { display: "flex", flexDirection: "column", flex: 1, minHeight: "100vh", width: "100%", background: "var(--bg-app)" };

/** Chave da "sala do avaliador" aberta antes do início, por sala e rodada (só nesta aba). */
export const evaluatorRoomKey = (roomId, round) => `smn-dupla-sala-avaliador:${roomId}:${round}`;
function readSession(key) {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeSession(key) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* sem armazenamento: vale enquanto a tela estiver aberta */
  }
}

/** Hora do aparelho atualizada a cada 250 ms enquanto o cronômetro corre (o tempo em si vem do servidor). */
function useNow(running) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    setNow(Date.now());
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  return now;
}

/**
 * Apito: ao ver a fase passar a "running" nesta tela e uma vez por rodada ao chegar a 00:00. Volta a armar se o tempo passar de
 * zero de novo (+1 min). Abrir ou recarregar a sala no meio não apita o início; abrir já em 00:00 não apita.
 */
function useWhistle(room, remaining) {
  const prevPhase = React.useRef(null);
  const armed = React.useRef({ round: null, on: false });
  const phase = room?.phase ?? null;
  const round = room?.round ?? null;
  React.useEffect(() => {
    if (prevPhase.current === "setup" && phase === "running") playWhistle();
    prevPhase.current = phase;
  }, [phase]);
  React.useEffect(() => {
    if (phase !== "running" || remaining == null) return;
    if (armed.current.round !== round) armed.current = { round, on: false };
    if (remaining > 0) armed.current.on = true;
    else if (armed.current.on) {
      armed.current.on = false;
      playWhistle();
    }
  }, [phase, round, remaining]);
}

/**
 * @param {{ roomId: string, go: (route: string, query?: Record<string, string>) => void }} props
 */
export function RoomScreen({ roomId, go }) {
  const session = useSession();
  const room_ = useRoom(roomId);
  const { room, content, marks, result, error, loading, reload, actions, notice, offsetMs, live, channelReady, partnerPresent, partnerAway } = room_;
  const [toast, show] = useToast();
  const [leaveAsk, setLeaveAsk] = React.useState(null); // "sair" | "encerrar"
  const closedByMe = room?.phase === "closed" && Boolean(room.closed_by?.me);

  useHeartbeat("em_estacao", roomId, live ? 45000 : 10000);
  React.useEffect(() => installAudioWake(), []);
  React.useEffect(() => {
    if (notice) show(notice.text, notice.tone);
  }, [notice, show]);

  // Sala encerrada por mim: volta direto ao Praticar.
  React.useEffect(() => {
    if (closedByMe) go("dupla");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedByMe]);

  const ticking = room?.phase === "running" && Boolean(room.ends_at) && typeof room.paused_left_ms !== "number";
  const now = useNow(ticking);
  const fromServer = remainingFrom(room, now, offsetMs);
  const remaining = fromServer ?? (typeof room?.duration_ms === "number" ? room.duration_ms : null);
  useWhistle(room, fromServer);

  // Sala do avaliador aberta antes do início (só nesta aba).
  const evalKey = room ? evaluatorRoomKey(room.id, room.round) : null;
  const [evalOpen, setEvalOpen] = React.useState(false);
  React.useEffect(() => {
    setEvalOpen(evalKey ? readSession(evalKey) : false);
  }, [evalKey]);
  const openEvaluatorRoom = React.useCallback(() => {
    if (evalKey) writeSession(evalKey);
    setEvalOpen(true);
  }, [evalKey]);

  if (error && !room) {
    return (
      <div style={{ ...frame, padding: "32px 28px", boxSizing: "border-box" }}>
        <LoadError error={error} retry={reload} />
      </div>
    );
  }
  if (loading || !room || closedByMe) {
    return <div aria-busy="true" style={frame} />;
  }

  const isEval = room.me.role === "evaluator";
  const inEvaluatorRoom = room.phase === "setup" && isEval && evalOpen;
  const Phase = inEvaluatorRoom ? RunningPhase : PHASES[room.phase];
  if (!Phase) return null;
  const access = Boolean(session?.dupla?.permitido || session?.dupla?.equipe);
  const showAway = partnerAway && ["connecting", "setup", "running", "review"].includes(room.phase);

  return (
    <div style={frame}>
      {toast}
      {showAway && (
        <div
          role="status"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "10px 16px",
            background: "var(--warning-bg)",
            color: "var(--warning-text)",
            font: "600 var(--text-sm)/1.4 var(--font-sans)",
          }}
        >
          <Icon name="wifi-off" size={16} />
          Reconectando…
          <Button size="sm" variant="ghost" icon="log-out" onClick={() => setLeaveAsk("sair")}>
            Sair da sala
          </Button>
        </div>
      )}
      <Phase
        room={room}
        content={content}
        marks={marks}
        result={result}
        actions={actions}
        go={go}
        remainingMs={remaining}
        started={room.phase !== "setup"}
        askLeave={(kind = "sair") => setLeaveAsk(kind)}
        openEvaluatorRoom={openEvaluatorRoom}
        progress={{ access, channelReady, partnerPresent: partnerPresent === true }}
      />
      {leaveAsk && (
        <Dialog
          title={leaveAsk === "encerrar" ? "Encerrar treino?" : "Sair da sala?"}
          description="O treino termina para os dois."
          onClose={() => setLeaveAsk(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setLeaveAsk(null)}>
                Voltar
              </Button>
              <Button
                variant="danger"
                icon="log-out"
                onClick={async () => {
                  setLeaveAsk(null);
                  const res = await actions.leave();
                  if (res) go("dupla");
                }}
              >
                {leaveAsk === "encerrar" ? "Encerrar treino" : "Sair da sala"}
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}
