// Caderno de erros com dados do banco (app_error_notebook).
// Mesma marcação da ErrorsScreen do kit (prototype/ReviewScreens.jsx), que só tinha o estado
// vazio; a lista, o detalhe com a correção e a anotação usam componentes do design system.
import React from "react";
import { AnswerOption, Badge, Banner, Button, Card, Chip, EmptyState, Icon, SelectField, StatCard, Tabs } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { Correction } from "../practice/Correction.jsx";
import { AREAS, areaLabel, examLabel, formatWhen, splitStatement } from "../practice/format.js";

const REASONS = [
  { value: "conhecimento", label: "Não sabia o conteúdo" },
  { value: "interpretacao", label: "Interpretei mal" },
  { value: "atencao", label: "Falta de atenção" },
  { value: "chute", label: "Chutei" },
  { value: "outro", label: "Outro" },
];
const ORDERS = [
  { value: "recent", label: "Mais recentes" },
  { value: "old", label: "Mais antigas" },
  { value: "count", label: "Maior incidência" },
];
const NOTE_LIMIT = 2000;
const REVIEW_SIZE = 20;

function NoteEditor({ questionId, initial, onSaved }) {
  const { backend } = useSession();
  const [note, setNote] = React.useState(initial.note ?? "");
  const [reason, setReason] = React.useState(initial.reason ?? "");
  const [state, setState] = React.useState("idle"); // idle | saving | saved | error
  const dirty = note.trim() !== (initial.note ?? "") || reason !== (initial.reason ?? "");

  const save = async () => {
    setState("saving");
    try {
      const saved = await backend.rpc("app_save_error_note", { p_question_id: questionId, p_note: note, p_reason: reason || null });
      onSaved(saved);
      setState("saved");
    } catch {
      setState("error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
      <span className="sm-field__label">Por que errei?</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Motivo do erro">
        {REASONS.map((r) => (
          <Chip key={r.value} selected={reason === r.value} onClick={() => (setReason(reason === r.value ? "" : r.value), setState("idle"))}>
            {r.label}
          </Chip>
        ))}
      </div>
      <div className="sm-field">
        <label className="sm-field__label" htmlFor={`nota-${questionId}`}>
          Anotação
        </label>
        <div className="sm-input" style={{ height: "auto" }}>
          <textarea
            id={`nota-${questionId}`}
            rows={3}
            maxLength={NOTE_LIMIT}
            value={note}
            onChange={(e) => (setNote(e.target.value), setState("idle"))}
            placeholder="O que levar desta questão para a prova."
            style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", resize: "vertical", padding: "12px 16px", font: "400 15px/1.5 var(--font-sans)", color: "var(--text-primary)" }}
          />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
        <span style={{ font: "var(--type-body-sm)", color: state === "error" ? "var(--danger-text)" : "var(--text-tertiary)" }} aria-live="polite">
          {state === "saved" && "Anotação salva."}
          {state === "error" && "Não foi possível salvar. Tente de novo."}
        </span>
        <Button variant="secondary" size="sm" onClick={save} loading={state === "saving"} disabled={!dirty}>
          Salvar anotação
        </Button>
      </div>
    </div>
  );
}

function ErrorRow({ item, first, open, onToggle, onNote }) {
  const { backend } = useSession();
  const [detail, setDetail] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const pending = item.status === "para_revisar";

  React.useEffect(() => {
    if (!open || detail) return undefined;
    let alive = true;
    setFailed(false);
    backend
      .rpc("app_error_detail", { p_question_id: item.question_id })
      .then((result) => alive && (result ? setDetail(result) : setFailed(true)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [open, detail, backend, item.question_id]);

  const parts = detail ? splitStatement(detail.statement) : null;
  return (
    <div style={{ borderTop: first ? 0 : "1px solid var(--border-subtle)" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 0", border: 0, background: "transparent", cursor: "pointer", font: "inherit", color: "var(--text-primary)", textAlign: "left" }}
      >
        <Icon name={pending ? "rotate-ccw" : "circle-check"} size={20} label={pending ? "Para revisar" : "Superada"} style={{ color: pending ? "var(--warning-text)" : "var(--success-text)", flex: "none" }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", font: "600 15px/1.35 var(--font-sans)" }}>{item.topic}</span>
          <span style={{ display: "block", font: "var(--type-body-sm)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.excerpt}</span>
          <span style={{ display: "block", font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 2 }}>
            {areaLabel(item.area)} · {examLabel(item.exam)} · Q{item.number} · {formatWhen(item.last_attempt_at)}
          </span>
        </span>
        {item.has_note && <Icon name="notebook-pen" size={16} label="Tem anotação" style={{ color: "var(--text-tertiary)", flex: "none" }} />}
        {item.wrong_count >= 2 && (
          <Badge tone="danger" size="sm">
            {item.wrong_count}× errada
          </Badge>
        )}
        <Icon name={open ? "chevron-up" : "chevron-down"} size={18} style={{ color: "var(--text-tertiary)", flex: "none" }} />
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "4px 0 24px" }}>
          {failed && <Banner tone="danger">Não foi possível abrir esta questão. Tente de novo.</Banner>}
          {!detail && !failed && <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>}
          {detail && (
            <>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, textWrap: "pretty" }}>{parts.stem}</p>
              {parts.ask && <p style={{ margin: 0, font: "600 16px/1.45 var(--font-sans)" }}>{parts.ask}</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detail.options.map((option) => (
                  <AnswerOption key={option.id} letter={option.id} state={option.id === detail.correction.correct_option ? "correct" : option.id === detail.selected ? "incorrect" : "dimmed"}>
                    {option.text}
                  </AnswerOption>
                ))}
              </div>
              <Correction selected={detail.selected} correction={detail.correction} question={detail} />
              <NoteEditor
                questionId={item.question_id}
                initial={detail}
                onSaved={(saved) => {
                  setDetail((current) => ({ ...current, ...saved }));
                  onNote(item.question_id, saved.note !== null || saved.reason !== null);
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ErrorNotebook({ go }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [book, setBook] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [tab, setTab] = React.useState("para_revisar");
  const [order, setOrder] = React.useState("recent");
  const [area, setArea] = React.useState("");
  const [openId, setOpenId] = React.useState(null);
  const [starting, setStarting] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    backend
      .rpc("app_error_notebook")
      .then((result) => alive && setBook(result))
      .catch(() => alive && setError("Não foi possível carregar o caderno de erros. Recarregue a página."));
    return () => {
      alive = false;
    };
  }, [backend]);

  if (!book) return error ? <Banner tone="danger">{error}</Banner> : <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;

  const { counts, items } = book;
  const inArea = items.filter((i) => !area || i.area === area);
  const visible = inArea
    .filter((i) => tab === "all" || i.status === tab)
    .sort((a, b) =>
      order === "count"
        ? b.wrong_count - a.wrong_count || b.last_attempt_at.localeCompare(a.last_attempt_at)
        : order === "old"
          ? a.last_attempt_at.localeCompare(b.last_attempt_at)
          : b.last_attempt_at.localeCompare(a.last_attempt_at)
    );
  const pendingHere = inArea.filter((i) => i.status === "para_revisar").length;

  const review = async () => {
    setStarting(true);
    setError(null);
    try {
      const started = await backend.rpc("app_start_session", { p_kind: "questoes", p_filters: { status: "wrong", area }, p_count: REVIEW_SIZE });
      go("sessao", { s: started.session_id });
    } catch {
      setError("Não foi possível abrir a revisão. Tente de novo.");
      setStarting(false);
    }
  };
  const markNote = (questionId, hasNote) =>
    setBook((current) => ({ ...current, items: current.items.map((i) => (i.question_id === questionId ? { ...i, has_note: hasNote } : i)) }));

  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 320px" }}>
            <span className="sm-overline">
              Revisão ativa · {counts.pending} {counts.pending === 1 ? "caso" : "casos"} para revisar
            </span>
            <h2 style={{ margin: "6px 0 4px", font: "var(--type-h2)" }}>Caderno de erros</h2>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>Revise os erros que ainda precisam ser corrigidos e consolide lacunas clínicas.</p>
          </div>
          {pendingHere > 0 && (
            <Button iconRight="arrow-right" onClick={review} loading={starting}>
              Revisar {Math.min(pendingHere, REVIEW_SIZE)} {Math.min(pendingHere, REVIEW_SIZE) === 1 ? "questão" : "questões"}
            </Button>
          )}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3,1fr)", gap: 16 }}>
        <StatCard label="Para revisar" value={counts.pending} caption="Casos ainda não superados em novos testes" tone="warning" icon="rotate-ccw" />
        <StatCard label="Superados" value={counts.overcome} caption="Acertados em revisões posteriores" tone="success" icon="circle-check" />
        <StatCard label="Questões recorrentes" value={counts.recurrent} caption="Erradas 2 ou mais vezes" tone="danger" icon="repeat" />
      </div>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: mobile ? 0 : 280 }}>
              <Tabs
                label="Status"
                value={tab}
                onChange={(value) => (setTab(value), setOpenId(null))}
                tabs={[
                  { value: "para_revisar", label: "Para revisar", count: counts.pending },
                  { value: "superada", label: "Superados", count: counts.overcome },
                  { value: "all", label: "Todos", count: items.length },
                ]}
              />
            </div>
            <div style={{ width: mobile ? "100%" : 220 }}>
              <SelectField aria-label="Ordenar" value={order} onChange={(e) => setOrder(e.target.value)} options={ORDERS} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Área:</span>
            {[{ id: "", label: "Todas" }, ...AREAS].map((a) => (
              <Chip key={a.id || "todas"} selected={area === a.id} onClick={() => (setArea(a.id), setOpenId(null))}>
                {a.label}
              </Chip>
            ))}
          </div>
          {items.length === 0 ? (
            <EmptyState
              icon="notebook-pen"
              title="Nenhum erro registrado no caderno"
              description="Continue praticando. Conforme você responder simulados e questões, os erros aparecem aqui para revisão."
              action={
                <Button iconRight="arrow-right" onClick={() => go("questoes")}>
                  Praticar questões
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>Nenhuma questão neste filtro.</p>
          ) : (
            <div>
              {visible.map((item, index) => (
                <ErrorRow
                  key={item.question_id}
                  item={item}
                  first={index === 0}
                  open={openId === item.question_id}
                  onToggle={() => setOpenId(openId === item.question_id ? null : item.question_id)}
                  onNote={markNote}
                />
              ))}
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
