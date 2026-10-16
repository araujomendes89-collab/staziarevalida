// Estação (Room.jsx do protótipo de 11/10). Vale para a fase "running" e para a "sala do avaliador" aberta antes do início
// (fase "setup", `started` falso: o avaliador lê tudo, ajusta o tempo e inicia pelo rodapé; liberar e marcar só depois).
//  - Avaliador: cabeçalho com o nome da estação; duas colunas com rolagem própria (resumo, orientações do ator, impressos,
//    anotações, materiais e feedback à esquerda; PEP com a soma à direita) e o rodapé com o cronômetro (D9 do dono).
//  - Candidato: cabeçalho "Estação N · Área" com a origem (nunca o tema), cronômetro que pode esconder só nesta aba, a folha
//    (imagem ou texto) e a lista de impressos liberados. Não finaliza a estação (D8): só "Sair da sala".
import React from "react";
import "./sala.css";
import { Accordion, Avatar, Badge, Button, Icon, PepTable, PrintImage, PrintItem, ScrollPane, Textarea, Timer } from "../../../ds";
import { areaVars, sourceLabel } from "../labels.js";
import { maxScoreOf, splitActorScript, splitBlocks, splitTasks, toPepItems } from "../content.js";
import { ActorScript, Scene, roleLabel, stationTitle } from "./parts.jsx";
import { CandidatePrints, CandidateSheet, PressingMedia, useImageUrl } from "./CandidateSheet.jsx";
import { EvaluatorFooter } from "./EvaluatorFooter.jsx";
import { notesKey, readDraft, writeDraft } from "./useRoom.js";

/** Cronômetro escondido pelo candidato: só nesta aba (sessionStorage); o tempo continua contando. */
export const HIDE_TIMER_KEY = "smn-dupla-cron-oculto";
export const NOT_STARTED_HINT = "Disponível depois de iniciar a estação.";

function useTabFlag(key) {
  const [on, setOn] = React.useState(() => {
    try {
      return window.sessionStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    try {
      window.sessionStorage.setItem(key, on ? "0" : "1");
    } catch {
      /* sem armazenamento: vale só enquanto a tela está aberta */
    }
    setOn(!on);
  };
  return [on, toggle];
}

function RoomHeader({ room, remainingMs, started }) {
  const [hidden, toggleHide] = useTabFlag(HIDE_TIMER_KEY);
  const station = room.station;
  const isEval = room.me.role === "evaluator";
  const paused = typeof room.paused_left_ms === "number";
  const expired = started && !paused && Boolean(room.ends_at) && remainingMs === 0;
  const origin = sourceLabel(station);
  const vars = areaVars(station?.area_code);
  const badge = !started
    ? ["warning", "Aguardando início"]
    : paused
      ? ["warning", "Pausada"]
      : expired
        ? ["danger", "Tempo esgotado"]
        : ["success", "Em andamento"];

  return (
    <header
      className="dupla-head"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 28px",
        boxSizing: "border-box",
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
        <h1 style={{ margin: 0, font: "var(--type-h3)", color: "var(--text-primary)" }}>{isEval && station?.name ? station.name : stationTitle(station)}</h1>
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
        <Badge tone={badge[0]}>{badge[1]}</Badge>
        {!isEval && started && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!hidden && <Timer seconds={Math.floor((remainingMs ?? 0) / 1000)} state={paused ? "paused" : expired ? "expired" : "running"} size={26} />}
            <Button
              size="sm"
              variant="secondary"
              icon={hidden ? "eye" : "eye-off"}
              aria-label={hidden ? "Mostrar cronômetro" : "Esconder cronômetro"}
              title={hidden ? "Mostrar o tempo restante" : "Esconder apenas nesta tela. O tempo continua contando."}
              onClick={toggleHide}
            >
              {hidden ? "Mostrar cronômetro" : "Ocultar"}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

/** Resumo da estação (Materiais), como a Montagem o grava: texto em parágrafos ou lista. */
function Summary({ value }) {
  if (typeof value === "string") return <Scene blocks={splitBlocks(value)} />;
  const items = (Array.isArray(value) ? value : [])
    .map((x) => (typeof x === "string" ? x : x?.text ?? x?.content ?? x?.title ?? ""))
    .filter((x) => String(x).trim());
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}
/**
 * Nome do impresso inicial na visão do avaliador, sem número: "Relato do caso (na folha do candidato)". Se a estação tiver mais
 * de um impresso inicial que não seja o relato, cada um leva o próprio nome, também sem número.
 */
export function initialLabel(pressing, count = 1) {
  const name = String(pressing?.name ?? "").trim();
  const isReport = count === 1 || /relato/i.test(name);
  return `${isReport ? "Relato do caso" : name || "Texto inicial"} (na folha do candidato)`;
}
const hasSummary = (v) => (typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) && v.length > 0);

function SheetImageForEvaluator({ actions }) {
  const img = useImageUrl("candidate_sheet", true, actions);
  if (!img.url) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <PrintImage src={img.url} alt="Folha do candidato: instruções e relato do caso clínico" />
    </div>
  );
}

function EvaluatorView({ room, content, marks, actions, started }) {
  const st = content.station;
  const notesId = notesKey(room.id, room.round);
  const [notes, setNotes] = React.useState(() => readDraft(notesId, ""));
  React.useEffect(() => setNotes(readDraft(notesId, "")), [notesId]);
  const tasks = splitTasks(st.doctor_tasks);
  const released = room.released_pressings || [];
  const items = toPepItems(content.checklist_items);
  const initial = (content.pressings || []).filter((p) => p.initially_visible);
  const releasable = (content.pressings || []).filter((p) => !p.initially_visible);

  const mark = (itemId, grade) => actions.mark(itemId, grade, marks[itemId]?.subitems ?? []);
  const toggleSubitem = (itemId, subId) => {
    const current = marks[itemId]?.subitems ?? [];
    actions.mark(itemId, marks[itemId]?.grade ?? null, current.includes(subId) ? current.filter((s) => s !== subId) : [...current, subId]);
  };

  return (
    <div className="dupla-aval">
      <div className="dupla-aval__col">
        <ScrollPane label="Estação: cenário, orientações e impressos">
          <div className="dupla-aval__left">
            <Accordion icon="clipboard-list" title="Cenário e tarefas" defaultOpen={!started}>
              <Scene blocks={splitBlocks(st.doctor_scene)} />
              {tasks.length > 0 && <ul style={{ paddingLeft: 18, margin: "10px 0 0" }}>{tasks.map((t, i) => <li key={i}>{t}</li>)}</ul>}
              {st.candidate_sheet?.has_image && <SheetImageForEvaluator actions={actions} />}
            </Accordion>
            <Accordion icon="drama" title="Orientações do Ator/Atriz" defaultOpen>
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
              {!started && releasable.length > 0 && (
                <div className="dupla-hint" style={{ marginBottom: 8 }}>
                  <Icon name="lock" size={14} />
                  {NOT_STARTED_HINT}
                </div>
              )}
              {/* Impresso inicial (já está na folha do candidato): sem número, para não repetir o "Impresso 1" dos liberáveis
                  (decisão do dono de 16/10). Os liberáveis seguem 1, 2, 3, com o número do documento oficial ao lado. */}
              {initial.map((p) => (
                <div key={p.id} style={{ display: "grid", gap: 4 }}>
                  <PrintItem index={p.display_number ?? p.index} title={p.name} label={initialLabel(p, initial.length)} released>
                    <PressingMedia pressing={p} actions={actions} />
                  </PrintItem>
                  <div style={{ font: "var(--text-xs) var(--font-sans)", color: "var(--text-secondary)", padding: "0 4px 6px" }}>O candidato já lê este texto na folha dele, desde o início.</div>
                </div>
              ))}
              {releasable.map((p) => {
                const isReleased = released.includes(p.id);
                return (
                  <PrintItem
                    key={p.id}
                    index={p.display_number ?? p.index}
                    sourceNumber={p.source_number}
                    title={p.name}
                    canRelease
                    released={isReleased}
                    releaseDisabled={!started}
                    releaseHint={NOT_STARTED_HINT}
                    onToggleRelease={() => actions.release(p.id, !isReleased)}
                  >
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ whiteSpace: "pre-wrap" }}>{p.content}</div>
                      {p.has_image && <PressingMedia pressing={{ ...p, content: "" }} actions={actions} />}
                    </div>
                  </PrintItem>
                );
              })}
            </Accordion>
            <Accordion icon="notebook-pen" title="Anotações">
              <Textarea
                rows={3}
                placeholder="Anote o que observar durante o atendimento"
                hint="Anotações ficam só neste aparelho."
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  writeDraft(notesId, e.target.value);
                }}
              />
            </Accordion>
            {/* Materiais (D9): o servidor só manda o resumo ao avaliador e só depois de aprovado pela revisão médica (013380). */}
            {hasSummary(st.summary) && (
              <Accordion icon="book-open" title="Materiais">
                <div style={{ font: "600 var(--text-sm) var(--font-sans)", color: "var(--text-primary)", marginBottom: 6 }}>Resumo sobre o tema</div>
                <Summary value={st.summary} />
                <div style={{ marginTop: 8, font: "var(--text-xs) var(--font-sans)", color: "var(--text-secondary)" }}>Conferido pela revisão médica. O candidato não vê este resumo.</div>
              </Accordion>
            )}
            <Accordion icon="message-circle" title="Feedback">
              <div style={{ color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>
                Registre observações sobre a atuação e revise o feedback após a finalização da estação.
              </div>
            </Accordion>
          </div>
        </ScrollPane>
      </div>
      <div className="dupla-aval__col dupla-aval__pep">
        {!started && (
          <div className="dupla-hint">
            <Icon name="lock" size={14} />
            {NOT_STARTED_HINT}
          </div>
        )}
        <ScrollPane label="Checklist PEP">
          <PepTable
            stationNumber={st.number}
            area={st.area}
            items={items}
            marks={marks}
            onMark={started ? mark : undefined}
            onToggleSubitem={started ? toggleSubitem : undefined}
            maxScore={maxScoreOf(content.checklist_items) || undefined}
          />
        </ScrollPane>
      </div>
    </div>
  );
}

function CandidateView({ room, content, actions }) {
  return (
    <div className="dupla-cand">
      <CandidateSheet station={{ ...content.station, duration_ms: room.duration_ms ?? content.station.duration_ms }} content={content} actions={actions} />
      <div className="dupla-cand__col">
        <CandidatePrints content={content} actions={actions} />
      </div>
    </div>
  );
}

function CandidateBar({ onLeave }) {
  return (
    <div className="dupla-foot">
      <div className="dupla-foot__spacer" />
      <Button variant="ghost" icon="log-out" onClick={onLeave}>
        Sair da sala
      </Button>
    </div>
  );
}

export function RunningPhase({ room, content, marks, actions, remainingMs, started = true, askLeave }) {
  const isEval = room.me.role === "evaluator";
  const leave = () => (askLeave ? askLeave("sair") : actions.leave());
  return (
    <div className="dupla-sala">
      <RoomHeader room={room} remainingMs={remainingMs} started={started} />
      <div className="dupla-sala__body">
        {content?.station &&
          (isEval ? (
            <EvaluatorView room={room} content={content} marks={marks} actions={actions} started={started} />
          ) : (
            <CandidateView room={room} content={content} actions={actions} />
          ))}
      </div>
      {isEval ? <EvaluatorFooter room={room} remainingMs={remainingMs} actions={actions} started={started} onLeave={leave} /> : <CandidateBar onLeave={leave} />}
    </div>
  );
}
