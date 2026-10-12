// Sala do Treinamento em Dupla: escolhe a fase a partir do que o servidor gravou (`room.phase`) e entrega a cada fase
// ({ room, content, marks, result, actions, go, remainingMs }). O estado vem só das funções do banco: montar de novo
// numa fase desenha a mesma fase. Tempo real e relógio do servidor são da Etapa 5 (Tarefas 15 a 17).
import React from "react";
import { LoadError } from "../../admin/common.jsx";
import { ClosedPhase } from "./ClosedPhase.jsx";
import { ConnectingPhase } from "./ConnectingPhase.jsx";
import { ResultPhase } from "./ResultPhase.jsx";
import { ReviewPhase } from "./ReviewPhase.jsx";
import { RolesPhase } from "./RolesPhase.jsx";
import { RunningPhase } from "./RunningPhase.jsx";
import { SetupPhase } from "./SetupPhase.jsx";
import { remainingOf, useRoom } from "./useRoom.js";

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

/**
 * @param {{ roomId: string, go: (route: string, query?: Record<string, string>) => void }} props
 */
export function RoomScreen({ roomId, go }) {
  const { room, content, marks, result, error, loading, reload, actions } = useRoom(roomId);
  const closedByMe = room?.phase === "closed" && Boolean(room.closed_by?.me);

  // Sala encerrada por mim: volta direto ao Praticar.
  React.useEffect(() => {
    if (closedByMe) go("dupla");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedByMe]);

  if (error) {
    return (
      <div style={{ ...frame, padding: "32px 28px", boxSizing: "border-box" }}>
        <LoadError error={error} retry={reload} />
      </div>
    );
  }
  if (loading || !room || closedByMe) {
    return <div aria-busy="true" style={frame} />;
  }

  const Phase = PHASES[room.phase];
  if (!Phase) return null;
  return (
    <div style={frame}>
      <Phase room={room} content={content} marks={marks} result={result} actions={actions} go={go} remainingMs={remainingOf(room)} />
    </div>
  );
}
