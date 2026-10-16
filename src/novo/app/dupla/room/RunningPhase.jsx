// Fase "running" (Room.jsx:71-135 do protótipo): cabeçalho com cronômetro, o que cada papel vê e a barra de baixo.
// O restante do tempo vem parado do servidor (`remainingMs`); a contagem viva e os eventos são da Etapa 5.
import React from "react";
import { Accordion, Avatar, Badge, Button, Card, IconButton, PepTable, PrintItem, Textarea, Timer } from "../../../ds";
import { formatDecimal } from "../../../ds/format.js";
import { areaVars, sourceLabel } from "../labels.js";
import { isTaskNote, maxScoreOf, splitActorScript, splitBlocks, splitTasks, toPepItems } from "../content.js";
import { ActorScript, PressingBody, PressingImage, Scene, roleLabel, stationTitle } from "./parts.jsx";

const MIN_KEY = "sz-timer-min";
const HIDE_KEY = "sz-timer-hidden";

function readFlag(key) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key, on) {
  try {
    window.localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* sem armazenamento: vale só nesta tela */
  }
}
/** Marca guardada no aparelho (minimizar / esconder o cronômetro). */
function useFlag(key) {
  const [on, setOn] = React.useState(() => readFlag(key));
  const toggle = () => {
    writeFlag(key, !on);
    setOn(!on);
  };
  return [on, toggle];
}

const overline = { font: "var(--type-overline)", letterSpacing: "var(--tracking-overline)", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 10 };

function RoomHeader({ room, remainingMs, actions }) {
  const [minimized, toggleMin] = useFlag(MIN_KEY);
  const [hidden, toggleHide] = useFlag(HIDE_KEY);
  const station = room.station;
  const isEval = room.me.role === "evaluator";
  const paused = typeof room.paused_left_ms === "number";
  const expired = !paused && Boolean(room.ends_at) && remainingMs === 0;
  const state = paused ? "paused" : expired ? "expired" : "running";
  const origin = sourceLabel(station);
  const vars = areaVars(station?.area_code);
  const seconds = Math.floor((remainingMs ?? 0) / 1000);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 28px",
        background: "var(--surface-card)",
        borderBottom: "1px solid var(--border-subtle)",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: vars.solid,
          color: "var(--surface-card)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          font: "800 13px var(--font-sans)",
        }}
      >
        {station?.area_code}
      </span>
      <div style={{ minWidth: 0 }}>
        {/* Avaliador: nome da estação. Candidato: "Estação N · Área" (o tema só aparece no resultado). */}
        <div style={{ font: "var(--type-h3)", color: "var(--text-primary)" }}>{isEval && station?.name ? station.name : stationTitle(station)}</div>
        <div style={{ font: "var(--text-xs) var(--font-sans)", color: "var(--text-secondary)" }}>{origin ? `${station.area} · ${origin}` : station?.area}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 12 }}>
        <Avatar name={room.me.public_name} size={26} />
        <Avatar name={room.partner.public_name} size={26} />
      </div>
      <Badge tone={isEval ? "actor" : "candidate"} icon={isEval ? "drama" : "stethoscope"}>
        {roleLabel(room.me.role)}
      </Badge>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Badge tone={paused ? "warning" : expired ? "danger" : "success"}>{paused ? "Pausada" : expired ? "Tempo esgotado" : "Em andamento"}</Badge>
        {isEval && !expired && !minimized && !hidden && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: 3, borderRadius: 10, background: "var(--surface-sunken)" }}>
            <IconButton icon="minus" label="Reduzir 1 minuto" size="sm" disabled={(remainingMs ?? 0) <= 60000} onClick={() => actions.adjust(-60000)} />
            <span style={{ font: "600 11px var(--font-sans)", color: "var(--text-secondary)", padding: "0 2px" }}>1 min</span>
            <IconButton icon="plus" label="Adicionar 1 minuto" size="sm" onClick={() => actions.adjust(60000)} />
          </div>
        )}
        {hidden ? (
          <button
            type="button"
            onClick={toggleHide}
            aria-label="Mostrar cronômetro"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 40,
              padding: "0 14px",
              borderRadius: "var(--radius-md)",
              border: "2px dashed var(--border-strong)",
              background: "var(--surface-card)",
              cursor: "pointer",
              font: "600 var(--text-sm) var(--font-sans)",
              color: "var(--text-secondary)",
            }}
          >
            Cronômetro oculto · mostrar
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Timer seconds={seconds} state={state} size={minimized ? 14 : 26} />
            <IconButton icon={minimized ? "maximize-2" : "minimize-2"} label={minimized ? "Expandir cronômetro" : "Minimizar cronômetro"} size="sm" onClick={toggleMin} />
            <IconButton icon="eye-off" label="Esconder cronômetro" size="sm" onClick={toggleHide} />
          </div>
        )}
      </div>
    </div>
  );
}

function EvaluatorView({ room, content, marks, actions }) {
  const st = content.station;
  const [notes, setNotes] = React.useState("");
  const tasks = splitTasks(st.doctor_tasks);
  const released = room.released_pressings || [];
  const items = toPepItems(content.checklist_items);
  const initial = content.pressings.filter((p) => p.initially_visible);
  const releasable = content.pressings.filter((p) => !p.initially_visible);

  const mark = (itemId, grade) => actions.mark(itemId, grade, marks[itemId]?.subitems ?? []);
  const toggleSubitem = (itemId, subId) => {
    const current = marks[itemId]?.subitems ?? [];
    actions.mark(itemId, marks[itemId]?.grade ?? null, current.includes(subId) ? current.filter((s) => s !== subId) : [...current, subId]);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", gap: 20, padding: "20px 28px", alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <Accordion icon="clipboard-list" title="Cenário e tarefas">
          <Scene blocks={splitBlocks(st.doctor_scene)} />
          {tasks.length > 0 && <ul style={{ paddingLeft: 18, margin: "10px 0 0" }}>{tasks.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        </Accordion>
        <Accordion icon="drama" title="Roteiro do ator" defaultOpen>
          <ActorScript
            script={splitActorScript(st.actor_script)}
            fallback="O roteiro do ator não consta nos documentos enviados. Use o cenário, os impressos e o checklist como referência para interpretar o paciente."
          />
        </Accordion>
        <Accordion
          icon="files"
          title="Impressos"
          defaultOpen
          meta={<Badge size="sm" tone="brand">{`${releasable.filter((p) => released.includes(p.id)).length}/${releasable.length}`}</Badge>}
        >
          {initial.map((p) => (
            <div key={p.id} style={{ display: "grid", gap: 4 }}>
              <PrintItem index={p.display_number ?? p.index} sourceNumber={p.source_number} title={p.name} released>
                <PressingBody pressing={p} actions={actions} />
              </PrintItem>
              <div style={{ font: "var(--text-xs) var(--font-sans)", color: "var(--text-secondary)", padding: "0 4px 6px" }}>Este impresso já está visível desde o início.</div>
            </div>
          ))}
          {releasable.map((p) => {
            const isReleased = released.includes(p.id);
            return (
              <PrintItem key={p.id} index={p.display_number ?? p.index} sourceNumber={p.source_number} title={p.name} canRelease released={isReleased} onToggleRelease={() => actions.release(p.id, !isReleased)}>
                <PressingBody pressing={p} actions={actions} />
              </PrintItem>
            );
          })}
        </Accordion>
        <Accordion icon="notebook-pen" title="Anotações">
          <Textarea rows={3} placeholder="Anote o que observar durante o atendimento" hint="Anotações ficam só neste aparelho." value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Accordion>
      </div>
      <div style={{ minWidth: 0 }}>
        <PepTable
          stationNumber={st.number}
          area={st.area}
          items={items}
          marks={marks}
          onMark={mark}
          onToggleSubitem={toggleSubitem}
          maxScore={maxScoreOf(content.checklist_items) || undefined}
        />
      </div>
    </div>
  );
}

function CandidateView({ room, content, actions }) {
  const st = content.station;
  const tasks = splitTasks(st.doctor_tasks);
  const minutes = st.duration_ms / 60000;
  const total = content.pressing_count;
  const released = room.released_pressings || [];
  const initial = content.pressings.filter((p) => p.initially_visible);
  const sheetImage = st.candidate_sheet?.has_image;
  let n = 0;
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", width: "100%", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16, boxSizing: "border-box" }}>
      <Card padding={28} style={{ boxShadow: "var(--shadow-sm)" }}>
        <div style={overline}>Enunciado</div>
        <Scene blocks={splitBlocks(st.doctor_scene)} style={{ font: "400 var(--text-md)/1.6 var(--font-sans)", color: "var(--text-primary)" }} />
      </Card>
      <Card padding={20}>
        <h2 style={{ margin: "0 0 14px", font: "600 var(--text-base)/1.3 var(--font-sans)", color: "var(--text-primary)" }}>
          Nos {Number.isInteger(minutes) ? minutes : formatDecimal(minutes, 1)} minutos de duração, execute:
        </h2>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {tasks.map((t, i) => {
            const note = isTaskNote(t);
            if (!note) n += 1;
            return (
              <li key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", color: "var(--text-primary)" }}>
                {!note && <span style={{ font: "600 var(--text-xs) var(--font-mono)", color: "var(--text-brand)" }}>{String(n).padStart(2, "0")}</span>}
                {t}
              </li>
            );
          })}
        </ol>
        {sheetImage && (
          <div style={{ marginTop: 14 }}>
            <PressingImage pressing={{ id: "candidate_sheet", has_image: true, name: "Folha do candidato", content: "" }} actions={actions} />
          </div>
        )}
      </Card>
      {initial.map((p) => (
        <Card key={p.id} padding={20}>
          <div style={overline}>{`Impresso ${p.display_number} · ${p.name}`}</div>
          <PressingBody pressing={p} actions={actions} />
        </Card>
      ))}
      <Card padding="12px 16px">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 0 8px" }}>
          <h2 style={{ margin: 0, font: "600 var(--text-base)/1.3 var(--font-sans)", color: "var(--text-primary)" }}>Impressos</h2>
          <Badge size="sm" tone="brand">{released.length === 1 ? "1 liberado" : `${released.length} liberados`}</Badge>
        </div>
        {Array.from({ length: total }, (_, k) => k + 1).map((index) => {
          const p = content.pressings.find((x) => !x.initially_visible && x.display_number === index);
          return p ? (
            <PrintItem key={index} index={index} title={p.name} released>
              <PressingBody pressing={p} actions={actions} />
            </PrintItem>
          ) : (
            <PrintItem key={index} index={index} title="Aguardando liberação" />
          );
        })}
      </Card>
    </div>
  );
}

function BottomBar({ room, actions }) {
  const isEval = room.me.role === "evaluator";
  const paused = typeof room.paused_left_ms === "number";
  const link = room.call_link;
  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        minHeight: 64,
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        rowGap: 8,
        padding: "10px 28px",
        background: "var(--surface-card)",
        borderTop: "1px solid var(--border-subtle)",
        zIndex: 5,
      }}
    >
      <Button variant="secondary" icon="video" disabled={!link} onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
        Chamada
      </Button>
      {isEval && (
        <Button variant="ghost" icon={paused ? "play" : "pause"} onClick={() => (paused ? actions.resume() : actions.pause())}>
          {paused ? "Retomar" : "Pausar"}
        </Button>
      )}
      <div style={{ flex: "1 1 0", minWidth: 0 }} />
      <Button variant="ghost" icon="log-out" onClick={() => actions.leave()}>
        Sair da sala
      </Button>
      {isEval && (
        <Button variant="danger" icon="square" onClick={() => actions.finish()}>
          Finalizar estação
        </Button>
      )}
    </div>
  );
}

export function RunningPhase({ room, content, marks, actions, remainingMs }) {
  const isEval = room.me.role === "evaluator";
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: "100%", width: "100%" }}>
      <RoomHeader room={room} remainingMs={remainingMs} actions={actions} />
      <div style={{ flex: 1 }}>
        {content?.station &&
          (isEval ? <EvaluatorView room={room} content={content} marks={marks} actions={actions} /> : <CandidateView room={room} content={content} actions={actions} />)}
      </div>
      <BottomBar room={room} actions={actions} />
    </div>
  );
}
