// Rodapé da sala do avaliador (Room.jsx:205-250 do protótipo de 11/10): cronômetro com o painel "Ajustar tempo", Iniciar,
// Pausar/Retomar, Finalizar estação e Sair da sala. O tempo mostrado vem do servidor (`remainingMs`); antes do início, a duração
// escolhida para a rodada. Sem o botão de sinalizar problema (D10: a janela de suporte é outra tarefa).
import React from "react";
import { Button, Icon, IconButton, SegmentedControl } from "../../../ds";
import { formatDecimal } from "../../../ds/format.js";
import { formatClock } from "../clock.js";
import { firstName } from "./parts.jsx";
import { StationPicker } from "./StationPicker.jsx";

const MIN_MS = 60000;
const STEP_SETUP = 30000;
const STEP_RUN = 60000;

/**
 * @param {{ room: object, remainingMs: number | null, actions: object, started: boolean, onLeave: () => void }} props
 */
export function EvaluatorFooter({ room, remainingMs, actions, started, onLeave, entradaAberta = true }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const boxRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const closeRef = React.useRef(null);
  const duration = typeof room.duration_ms === "number" ? room.duration_ms : room.station?.duration_ms ?? 0;
  const official = room.station?.duration_ms ?? duration;
  const paused = typeof room.paused_left_ms === "number";
  const left = started ? remainingMs ?? 0 : duration;
  const expired = started && left <= 0;
  // Fluxo simples (19/10): um toque do ator. Precisa só da estação e do convite aceito (o servidor confere de novo).
  const canStart = Boolean(room.station) && !room.invite_pending;
  const shown = formatClock(left);

  const close = React.useCallback((focusBack = true) => {
    setOpen(false);
    if (focusBack) triggerRef.current?.focus();
  }, []);
  React.useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onDown = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  React.useEffect(() => setOpen(false), [started]);

  const once = (fn) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const mode = started ? (expired ? "expired" : paused ? "paused" : "running") : duration === official ? "official" : "reduced";
  const modeText = { expired: "Tempo esgotado", paused: "Pausada", running: "Em andamento", official: "Tempo oficial", reduced: "Tempo reduzido" }[mode];
  const options = [
    ["Oficial", official],
    ["−1 min", official - 60000],
    ["−2 min", official - 120000],
    ["−3 min", official - 180000],
  ].map(([label, ms]) => ({ value: String(ms), label, disabled: ms < MIN_MS }));
  const minutes = official / 60000;

  return (
    <div className="dupla-foot" role="region" aria-label="Controles da estação">
      <div className="dupla-time" ref={boxRef}>
        <span className="dupla-time__label">
          <Icon name="timer" size={18} />
          <span className="dupla-time__text">Cronômetro</span>
        </span>
        <button
          ref={triggerRef}
          type="button"
          className="dupla-time__btn"
          aria-label={`Ajustar tempo, ${shown}`}
          aria-expanded={open}
          aria-controls="dupla-ajustar-tempo"
          onClick={() => setOpen((v) => !v)}
        >
          <span role="timer" aria-live="off">{shown}</span>
          <Icon name={open ? "chevron-down" : "chevron-up"} size={14} />
        </button>
        <span className="dupla-time__mode" data-state={mode}>
          {modeText}
        </span>
        {open && (
          <section id="dupla-ajustar-tempo" className="dupla-time__panel" aria-label="Ajustar tempo">
            <div className="dupla-time__head">
              <span>Ajustar tempo</span>
              <IconButton ref={closeRef} icon="x" label="Fechar ajustes de tempo" size="sm" onClick={() => close()} />
            </div>
            {started && expired ? (
              <p className="dupla-time__note">O tempo acabou. Finalize a estação quando terminar a avaliação.</p>
            ) : (
              <div className="dupla-time__stepper">
                <IconButton
                  icon="minus"
                  variant="secondary"
                  label={started ? "Reduzir 1 minuto" : "Reduzir 30 segundos"}
                  disabled={started ? left <= STEP_RUN : duration <= MIN_MS}
                  onClick={() => (started ? actions.adjust(-STEP_RUN) : actions.setDuration(Math.max(MIN_MS, duration - STEP_SETUP)))}
                />
                <output className="dupla-time__value" aria-label="Tempo selecionado">
                  {shown}
                </output>
                <IconButton
                  icon="plus"
                  variant="secondary"
                  label={started ? "Adicionar 1 minuto" : "Aumentar 30 segundos"}
                  disabled={!started && duration >= official}
                  onClick={() => (started ? actions.adjust(STEP_RUN) : actions.setDuration(Math.min(official, duration + STEP_SETUP)))}
                />
              </div>
            )}
            {!started && (
              <>
                <div style={{ font: "var(--type-label)", color: "var(--text-primary)" }}>Desafio de tempo</div>
                <SegmentedControl fullWidth label="Duração" value={String(duration)} onChange={(v) => actions.setDuration(Number(v))} options={options} />
                <p className="dupla-time__note">
                  {`Tempo oficial: ${formatDecimal(minutes, Number.isInteger(minutes) ? 0 : 1)} min. Reduzir o tempo não altera a nota.`}
                </p>
              </>
            )}
            {started && !expired && <p className="dupla-time__note">Ajuste o tempo restante em intervalos de 1 minuto.</p>}
          </section>
        )}
      </div>
      <div className="dupla-foot__spacer" />
      <IconButton icon="log-out" label="Sair da sala" variant="ghost" onClick={onLeave} />
      {started ? (
        <>
          <Button variant="secondary" icon={paused ? "play" : "pause"} disabled={expired || busy} onClick={once(() => (paused ? actions.resume() : actions.pause()))}>
            {paused ? "Retomar" : "Pausar"}
          </Button>
          <Button variant="danger" icon="square" disabled={busy || !entradaAberta} onClick={once(() => actions.finish())}>
            Finalizar estação
          </Button>
        </>
      ) : (
        <>
          {room.invite_pending && (
            <span role="status" className="dupla-time__mode" data-state="reduced">
              {`Aguardando ${firstName(room.partner.public_name)} aceitar`}
            </span>
          )}
          <Button variant="ghost" icon="clipboard-list" disabled={busy} onClick={() => setPicking(true)}>
            Trocar estação
          </Button>
          <Button icon="play" disabled={!canStart || busy} onClick={once(() => actions.start())}>
            Iniciar estação
          </Button>
        </>
      )}
      {picking && (
        <StationPicker
          roomId={room.id}
          title="Trocar estação"
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setPicking(false);
            actions.setStation(id);
          }}
        />
      )}
    </div>
  );
}
