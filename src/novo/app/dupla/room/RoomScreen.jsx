// Sala do Treinamento em Dupla, ao vivo: escolhe a fase a partir do que o servidor gravou (`room.phase`) e entrega a cada fase
// ({ room, content, marks, result, actions, go, remainingMs, askLeave, … }). O estado vem só das funções do banco (tempo real só
// avisa); o cronômetro conta a partir de `ends_at`/`paused_left_ms` do servidor corrigidos pela diferença de relógio.
// Aqui também: sinal de presença na sala, apito (início e fim do tempo), aviso "Reconectando…" e confirmação de saída. Fluxo simples (19/10): em "setup", o ator com a estação escolhida vê direto a sala do avaliador (RunningPhase antes do início) com "Iniciar estação".
import React from "react";
import { Button, Dialog, Icon, useToast } from "../../../ds";
import { LoadError } from "../../admin/common.jsx";
import { useSession } from "../../session.jsx";
import { useHeartbeat } from "../live.js";
import { installAudioWake, playWhistle } from "../sound.js";
import { remainingMs as remainingFrom } from "../clock.js";
import { deveApitar, entrada, tempoMostrado } from "../porta.js";
import { PortaEntrada } from "./Porta.jsx";
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
 * Apito (dono, 19/10), nos DOIS aparelhos (DONO-1: o ator não vê a porta, mas ouve o apito). O do início toca quando a porta
 * começa a abrir, pelo relógio do SERVIDOR (deveApitar, porta.js): uma vez por rodada e só com atraso de até 1 s (rede lenta,
 * aba no fundo, sala aberta depois: a porta abre sem som). O efeito depende só da etapa e da hora do apito (ruling D4), não do
 * objeto `porta` (novo a cada 250 ms). O do fim toca uma vez por rodada ao chegar a 00:00 e volta a armar se o tempo passar de
 * zero de novo (+1 min). Abrir já em 00:00 não apita. Som desligado: playWhistle não toca (sound.js), e a porta abre no mesmo
 * tempo.
 */
function useWhistle(room, porta, serverNowMs, remaining) {
  const inicio = React.useRef({ round: null, feito: false });
  const agora = React.useRef(serverNowMs);
  agora.current = serverNowMs;
  const armed = React.useRef({ round: null, on: false });
  const phase = room?.phase ?? null;
  const round = room?.round ?? null;
  const { etapa, apitoEm } = porta;
  React.useEffect(() => {
    if (inicio.current.round !== round) inicio.current = { round, feito: false };
    if (deveApitar({ etapa, apitoEm }, agora.current, inicio.current.feito)) playWhistle();
    if (etapa !== "fechada") inicio.current.feito = true;
  }, [round, etapa, apitoEm]);
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
 * DONO-2 (dono, 19/10): o servidor só entrega a estação ao candidato depois do início marcado, e abrir a porta não muda o `rev`
 * da sala (a consulta "mudou algo?" diria que não). Quando a porta abre e o estado ainda está sem a estação, pede o estado
 * INTEIRO de novo (`reload` = app_dupla_room sem p_since_rev) na hora e a cada 1 s até chegar; com a estação no estado, a chave
 * do conteúdo muda (useRoom) e a folha é pedida.
 */
function useEstacaoAoAbrir(aguardando, reload) {
  const reloadRef = React.useRef(reload);
  reloadRef.current = reload;
  React.useEffect(() => {
    if (!aguardando) return undefined;
    reloadRef.current();
    const t = setInterval(() => reloadRef.current(), 1000);
    return () => clearInterval(t);
  }, [aguardando]);
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

  // DONO-2: durante o apito o candidato ainda não tem `ends_at` (só `started_at`); o relógio anda do mesmo jeito para a porta abrir.
  const ticking = room?.phase === "running" && Boolean(room.ends_at || room.started_at) && typeof room.paused_left_ms !== "number";
  const now = useNow(ticking);
  // Entrada na estação (dono, 19/10): apito (nos dois aparelhos) e porta (só no do candidato) pelo relógio do SERVIDOR (porta.js).
  const serverNow = now + (Number.isFinite(offsetMs) ? offsetMs : 0);
  const porta = entrada(room, serverNow);
  const fromServer = remainingFrom(room, now, offsetMs);
  const remaining = tempoMostrado(porta, fromServer, typeof room?.duration_ms === "number" ? room.duration_ms : null);
  useWhistle(room, porta, serverNow, fromServer);
  // DONO-2: a porta abriu e o estado do candidato ainda não tem a estação → pede o estado de novo até chegar.
  useEstacaoAoAbrir(room?.phase === "running" && room.me?.role !== "evaluator" && !room.station && porta.etapa === "aberta", reload);

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
  // Fluxo simples: o ator com a estação escolhida vai direto à sala do avaliador (lê roteiro, impressos e PEP e inicia).
  const inEvaluatorRoom = room.phase === "setup" && isEval && Boolean(room.station);
  const Phase = inEvaluatorRoom ? RunningPhase : PHASES[room.phase];
  if (!Phase) return null;
  // Porta só na tela do CANDIDATO (DONO-1): enquanto abre (apito tocando) e até a estação chegar (DONO-2). O ator segue na
  // tela de trabalho (RunningPhase), com o cronômetro em 10:00 até a porta abrir.
  const entrando = room.phase === "running" && !isEval && (porta.etapa !== "aberta" || !room.station);
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
      {entrando ? (
        <PortaEntrada room={room} entrada={porta} />
      ) : (
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
        progress={{ access, channelReady, partnerPresent: partnerPresent === true }}
        entradaAberta={porta.etapa === "aberta"}
      />
      )}
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
