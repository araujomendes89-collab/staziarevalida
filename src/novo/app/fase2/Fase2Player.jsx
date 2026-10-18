import React from "react";
import { useSearchParams } from "react-router-dom";
import { Card, Button, Badge, Icon, Banner, ProgressBar } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { Loading, LoadError, dateTimeBR } from "../admin/common.jsx";
import { fase2Api } from "./api.js";
import { fmtScore, fmtMinutes, getArea, GRADE_LABEL } from "./labels.js";
import "./fase2.css";

export function Fase2Player({ go }) {
  const [searchParams] = useSearchParams();
  const stationId = searchParams.get("id");
  const attemptIdParam = searchParams.get("tentativa");

  const { backend } = useSession();
  const mobile = useMobile();
  const api = React.useMemo(() => fase2Api(backend), [backend]);

  const [attempt, setAttempt] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  // Diferença entre relógio do servidor e do cliente em ms
  const [clockOffset, setClockOffset] = React.useState(0);
  const [secondsRemaining, setSecondsRemaining] = React.useState(600);
  const autoFinishedRef = React.useRef(false);

  // Abas durante leitura e atendimento
  const [activeTab, setActiveTab] = React.useState("cenario"); // cenario | tarefas | impressos

  // Impressos solicitados pelo aluno durante o atendimento
  const [unlockedPressings, setUnlockedPressings] = React.useState(new Set());

  // Marcações do PEP no status scoring: { [order]: 'correct' | 'partial' | 'incorrect' }
  const [marks, setMarks] = React.useState({});

  // Carrega ou inicia a tentativa
  const loadAttempt = React.useCallback(async () => {
    if (!stationId && !attemptIdParam) {
      setError(new Error("Estação ou tentativa não informada na URL."));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      let payload;
      if (attemptIdParam) {
        payload = await api.attempt(attemptIdParam);
      } else {
        payload = await api.start(stationId);
      }

      const serverNow = payload.server_now ? Date.parse(payload.server_now) : Date.now();
      setClockOffset(serverNow - Date.now());
      setAttempt(payload);

      // Se já estava em atendimento, inicializa o cronômetro
      if (payload.status === "attending" && payload.attendance_started_at) {
        const startedAt = Date.parse(payload.attendance_started_at);
        const duration = payload.station?.duration_ms || 600_000;
        const remaining = Math.max(0, Math.floor((startedAt + duration - serverNow) / 1000));
        setSecondsRemaining(remaining);
      } else if (payload.station?.duration_ms) {
        setSecondsRemaining(Math.round(payload.station.duration_ms / 1000));
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [api, stationId, attemptIdParam]);

  React.useEffect(() => {
    loadAttempt();
  }, [loadAttempt]);

  // Transição: leitura -> atendimento
  const handleBegin = async () => {
    if (!attempt?.attempt_id || busy) return;
    try {
      setBusy(true);
      const updated = await api.begin(attempt.attempt_id);
      const serverNow = updated.server_now ? Date.parse(updated.server_now) : Date.now();
      setClockOffset(serverNow - Date.now());
      setAttempt(updated);
      setActiveTab("cenario");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  // Transição: atendimento -> avaliação PEP
  const handleFinish = React.useCallback(async (skipConfirm = false) => {
    if (!attempt?.attempt_id || busy) return;
    if (!skipConfirm) {
      const confirmEnd = window.confirm(
        "Deseja encerrar o atendimento e abrir o PEP? Esta ação não pode ser desfeita."
      );
      if (!confirmEnd) return;
    }

    try {
      setBusy(true);
      const updated = await api.finish(attempt.attempt_id);
      setAttempt(updated);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, [api, attempt?.attempt_id, busy]);

  // Cronômetro regressivo durante atendimento
  React.useEffect(() => {
    if (!attempt || attempt.status !== "attending" || !attempt.attendance_started_at) {
      return;
    }

    const startedAt = Date.parse(attempt.attendance_started_at);
    const duration = attempt.station?.duration_ms || 600_000;
    const endAt = startedAt + duration;

    const timer = setInterval(() => {
      const currentServerNow = Date.now() + clockOffset;
      const left = Math.max(0, Math.floor((endAt - currentServerNow) / 1000));
      setSecondsRemaining(left);

      if (left <= 0 && !autoFinishedRef.current) {
        autoFinishedRef.current = true;
        clearInterval(timer);
        handleFinish(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [attempt?.status, attempt?.attendance_started_at, attempt?.station?.duration_ms, clockOffset, handleFinish]);

  // Submissão do PEP preenchido
  const handleSubmitScoring = async () => {
    if (!attempt?.attempt_id || busy) return;
    try {
      setBusy(true);
      const updated = await api.submit(attempt.attempt_id, marks);
      setAttempt(updated);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  // Botão Sair no cabeçalho
  const handleExit = async () => {
    if (!attempt) {
      go("estacoes");
      return;
    }

    // Na leitura ou concluído sai direto sem abandonar
    if (attempt.status === "reading" || attempt.status === "done") {
      go("estacoes");
      return;
    }

    // No atendimento ou scoring pergunta se deseja abandonar
    const confirmAbandon = window.confirm(
      "Deseja sair da estação? Seu progresso nesta tentativa será cancelado."
    );
    if (!confirmAbandon) return;

    try {
      setBusy(true);
      await api.abandon(attempt.attempt_id);
    } catch {
      // Ignora erro no abandono ao sair
    } finally {
      setBusy(false);
      go("estacoes");
    }
  };

  // Solicitar impresso
  const handleRequestPressing = (pressingId) => {
    setUnlockedPressings((prev) => {
      const next = new Set(prev);
      next.add(pressingId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="f2-player" style={{ alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
        <Loading />
      </div>
    );
  }

  if (error && !attempt) {
    return (
      <div className="f2-player" style={{ padding: "var(--space-8) var(--space-4)" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", width: "100%" }}>
          <LoadError error={error} retry={loadAttempt} />
          <div style={{ marginTop: "var(--space-4)", textAlign: "center" }}>
            <Button variant="secondary" onClick={() => go("estacoes")}>
              Voltar ao banco de estações
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="f2-player" style={{ alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
        <p style={{ color: "var(--text-secondary)" }}>Nenhuma tentativa encontrada.</p>
        <Button variant="secondary" onClick={() => go("estacoes")}>
          Voltar ao banco de estações
        </Button>
      </div>
    );
  }

  const { status, station, scene, tasks, pressings = [], checklist = [], result } = attempt;
  const areaInfo = getArea(station?.area);

  // Formatação do cronômetro mm:ss
  const formatTimer = (sec) => {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  };

  const timerWarn = status === "attending" && secondsRemaining <= 120;

  // Cálculo da prévia da nota no status scoring
  let previewEarned = 0;
  let previewMax = 0;
  for (const item of checklist) {
    const grade = marks[String(item.order)];
    const itemMax = Number(item.max) || 0;
    previewMax += itemMax;
    if (grade === "correct") {
      previewEarned += itemMax;
    } else if (grade === "partial") {
      previewEarned += Number(item.partial) || 0;
    }
  }
  const previewScore10 = previewMax > 0 ? (previewEarned / previewMax) * 10 : 0;
  const allChecklistMarked = checklist.length > 0 && checklist.every((i) => marks[String(i.order)] != null);

  return (
    <div className="f2-player">
      {/* Cabeçalho fixo sem moldura */}
      <header className="f2-player-header">
        <Button variant="ghost" size="sm" icon="x" onClick={handleExit} disabled={busy}>
          Sair
        </Button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "var(--type-label)", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {station?.name}
          </div>
          {!mobile && (
            <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
              {station?.area} {station?.setting ? `· ${station.setting}` : ""}
            </div>
          )}
        </div>

        {/* Indicador visual das 3 etapas */}
        <div className="f2-player-stage-pills" role="tablist" aria-label="Etapas da estação">
          <span
            className={`f2-player-stage-pill${status === "reading" ? " f2-player-stage-pill--active" : ""}`}
          >
            Leitura
          </span>
          <span
            className={`f2-player-stage-pill${status === "attending" ? " f2-player-stage-pill--active" : ""}`}
          >
            Atendimento
          </span>
          <span
            className={`f2-player-stage-pill${status === "scoring" || status === "done" ? " f2-player-stage-pill--active" : ""}`}
          >
            PEP
          </span>
        </div>

        {/* Cronômetro */}
        <span
          role="timer"
          aria-live="polite"
          className={`f2-player-timer${timerWarn ? " f2-player-timer--warn" : ""}`}
        >
          <Icon name="timer" size={16} />
          {status === "attending"
            ? formatTimer(secondsRemaining)
            : status === "reading"
              ? formatTimer(Math.round((station?.duration_ms || 600_000) / 1000))
              : attempt?.attendance_started_at && attempt?.attendance_ended_at
                ? `Usou ${formatTimer(Math.max(0, Math.round((Date.parse(attempt.attendance_ended_at) - Date.parse(attempt.attendance_started_at)) / 1000)))}`
                : "—"}
        </span>
      </header>

      {/* Erro eventual durante transições */}
      {error && (
        <div style={{ maxWidth: 860, margin: "var(--space-4) auto 0", width: "100%", padding: "0 var(--space-4)" }}>
          <LoadError error={error} retry={loadAttempt} />
        </div>
      )}

      {/* Conteúdo da Estação */}
      <main className="f2-player-content">
        {/* ETAPA 1 E 2: LEITURA OU ATENDIMENTO */}
        {(status === "reading" || status === "attending") && (
          <>
            {/* Navegação por abas */}
            <div style={{ display: "flex", gap: "var(--space-2)", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "var(--space-2)" }}>
              <button
                type="button"
                className={`sm-tab${activeTab === "cenario" ? " sm-tab--active" : ""}`}
                onClick={() => setActiveTab("cenario")}
              >
                <Icon name="file-text" size={16} />
                Cenário
              </button>
              <button
                type="button"
                className={`sm-tab${activeTab === "tarefas" ? " sm-tab--active" : ""}`}
                onClick={() => setActiveTab("tarefas")}
              >
                <Icon name="list-todo" size={16} />
                Tarefas
              </button>
              {status === "attending" && (
                <button
                  type="button"
                  className={`sm-tab${activeTab === "impressos" ? " sm-tab--active" : ""}`}
                  onClick={() => setActiveTab("impressos")}
                >
                  <Icon name="paperclip" size={16} />
                  Impressos ({pressings.length})
                </button>
              )}
            </div>

            {/* Aba Cenário */}
            {activeTab === "cenario" && (
              <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
                <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
                  Cenário de atuação
                </span>
                <div style={{ font: "var(--type-body-lg)", color: "var(--text-primary)", marginTop: "var(--space-3)", whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
                  {scene || "Nenhum cenário cadastrado para esta estação."}
                </div>
              </Card>
            )}

            {/* Aba Tarefas */}
            {activeTab === "tarefas" && (
              <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
                <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
                  Tarefas a serem executadas
                </span>
                <div style={{ font: "var(--type-body)", color: "var(--text-primary)", marginTop: "var(--space-3)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {tasks || "Nenhuma tarefa cadastrada para esta estação."}
                </div>
              </Card>
            )}

            {/* Aba Impressos (somente em atendimento) */}
            {activeTab === "impressos" && status === "attending" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
                  Solicite os exames ou impressos conforme a condução clínica da consulta.
                </p>

                {pressings.length === 0 ? (
                  <Card padding={24} style={{ borderRadius: "var(--radius-lg)" }}>
                    <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                      Esta estação não possui impressos adicionais.
                    </p>
                  </Card>
                ) : (
                  pressings.map((p, idx) => {
                    const isUnlocked = unlockedPressings.has(p.id);
                    return (
                      <Card key={p.id || idx} padding={20} style={{ borderRadius: "var(--radius-lg)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                          <div>
                            <span className="sm-overline" style={{ color: "var(--text-tertiary)" }}>
                              Impresso {idx + 1}
                            </span>
                            <div style={{ font: "var(--type-h4)", color: "var(--text-primary)", marginTop: 2 }}>
                              {p.name}
                            </div>
                          </div>

                          {!isUnlocked && (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon="eye"
                              onClick={() => handleRequestPressing(p.id)}
                            >
                              Solicitar este impresso
                            </Button>
                          )}
                        </div>

                        {isUnlocked && (
                          <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border-subtle)", font: "var(--type-body)", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                            {p.content}
                          </div>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            )}

            {/* Aviso na leitura */}
            {status === "reading" && (
              <Banner tone="info" icon="info">
                Os impressos e o PEP só aparecem depois que você iniciar e encerrar o atendimento.
              </Banner>
            )}
          </>
        )}

        {/* ETAPA 3: AVALIAÇÃO PELO PEP (SCORING) */}
        {status === "scoring" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
            <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "var(--space-4)", flexWrap: "wrap" }}>
                <div>
                  <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
                    Padrão Esperado de Procedimentos
                  </span>
                  <div style={{ font: "var(--type-display)", fontSize: 36, color: "var(--text-primary)", marginTop: "var(--space-2)" }}>
                    {fmtScore(previewScore10)}{" "}
                    <span style={{ font: "var(--type-h3)", color: "var(--text-tertiary)" }}>/ 10</span>
                  </div>
                  <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                    Prévia da nota calculada localmente
                  </span>
                </div>

                <div style={{ minWidth: 220, flex: mobile ? "1 1 100%" : "none" }}>
                  <ProgressBar
                    value={Object.keys(marks).length}
                    max={checklist.length}
                    label="Itens avaliados"
                    valueLabel={`${Object.keys(marks).length} de ${checklist.length}`}
                    color="var(--action-primary)"
                  />
                </div>
              </div>
            </Card>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {checklist.map((item) => {
                const orderKey = String(item.order);
                const currentGrade = marks[orderKey];
                const hasPartial = item.partial != null;

                return (
                  <div key={item.order} className="f2-pep-item-card">
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", flexWrap: "wrap" }}>
                      <span style={{ font: "var(--type-data)", color: "var(--text-tertiary)", width: 24, flexShrink: 0, paddingTop: 2 }}>
                        {item.order}
                      </span>

                      <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          {item.phase && <Badge size="sm">{item.phase}</Badge>}
                          <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                            Máximo: {fmtScore(item.max)} pt{hasPartial ? ` · Parcial: ${fmtScore(item.partial)} pt` : ""}
                          </span>
                        </div>

                        <div style={{ font: "var(--type-body)", color: "var(--text-primary)", lineHeight: 1.5 }}>
                          {item.content}
                        </div>

                        {/* Subitens se houver */}
                        {Array.isArray(item.subitems) && item.subitems.length > 0 && (
                          <ul style={{ margin: "var(--space-2) 0 0", paddingLeft: 20, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
                            {item.subitems.map((sub, sIdx) => (
                              <li key={sIdx}>{typeof sub === "string" ? sub : (sub?.text ?? "")}</li>
                            ))}
                          </ul>
                        )}

                        {/* Critérios recolhíveis se houver */}
                        {item.criteria && Object.keys(item.criteria).length > 0 && (
                          <details style={{ marginTop: "var(--space-2)", font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>
                            <summary style={{ cursor: "pointer" }}>Critérios detalhados</summary>
                            <pre style={{ margin: "var(--space-1) 0 0", padding: "var(--space-2)", borderRadius: "var(--radius-sm)", background: "var(--surface-sunken)", font: "var(--font-mono)", fontSize: 12, whiteSpace: "pre-wrap" }}>
                              {JSON.stringify(item.criteria, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>

                      {/* Botões de rádio para o item */}
                      <div
                        role="radiogroup"
                        aria-label={`Item ${item.order}`}
                        className="f2-pep-radiogroup"
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={currentGrade === "correct"}
                          className={`f2-pep-radio${currentGrade === "correct" ? " f2-pep-radio--correct" : ""}`}
                          onClick={() => setMarks((prev) => ({ ...prev, [orderKey]: "correct" }))}
                        >
                          <Icon name="check" size={14} />
                          {GRADE_LABEL.correct}
                        </button>

                        {hasPartial && (
                          <button
                            type="button"
                            role="radio"
                            aria-checked={currentGrade === "partial"}
                            className={`f2-pep-radio${currentGrade === "partial" ? " f2-pep-radio--partial" : ""}`}
                            onClick={() => setMarks((prev) => ({ ...prev, [orderKey]: "partial" }))}
                          >
                            <Icon name="minus" size={14} />
                            {GRADE_LABEL.partial}
                          </button>
                        )}

                        <button
                          type="button"
                          role="radio"
                          aria-checked={currentGrade === "incorrect"}
                          className={`f2-pep-radio${currentGrade === "incorrect" ? " f2-pep-radio--incorrect" : ""}`}
                          onClick={() => setMarks((prev) => ({ ...prev, [orderKey]: "incorrect" }))}
                        >
                          <Icon name="x" size={14} />
                          {GRADE_LABEL.incorrect}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ETAPA 4: CONCLUÍDO (DONE) */}
        {status === "done" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
            <Card padding={mobile ? 24 : 32} style={{ borderRadius: "var(--radius-2xl)", textAlign: "center" }}>
              <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
                Resultado oficial da estação
              </span>
              <div style={{ font: "var(--type-display)", fontSize: 48, color: Number(result?.score10) >= 7 ? "var(--success-text)" : "var(--warning-text)", marginTop: "var(--space-2)" }}>
                {fmtScore(result?.score10)}{" "}
                <span style={{ font: "var(--type-h2)", color: "var(--text-tertiary)" }}>/ 10</span>
              </div>
              <p style={{ margin: "var(--space-2) 0 0", font: "var(--type-body)", color: "var(--text-secondary)" }}>
                Pontuação total: {fmtScore(result?.score)} de {fmtScore(result?.max_score)} pontos
              </p>
              {result?.finished_at && (
                <span style={{ display: "inline-block", marginTop: "var(--space-1)", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                  Concluído em {dateTimeBR(result.finished_at)}
                </span>
              )}
            </Card>

            {/* Detalhamento dos itens do PEP com destaques de perda */}
            <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
              <h3 style={{ margin: "0 0 var(--space-4)", font: "var(--type-h4)", color: "var(--text-primary)" }}>
                Padrão Esperado de Procedimentos avaliado
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {(result?.marks || []).map((m) => {
                  const lostPoints = Number(m.points) < Number(m.max);
                  return (
                    <div
                      key={m.order}
                      className={`f2-pep-item-card${lostPoints ? " f2-pep-item-card--lost" : ""}`}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 240 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ font: "var(--type-data)", color: "var(--text-tertiary)" }}>
                              Item {m.order}
                            </span>
                            {m.phase && <Badge size="sm">{m.phase}</Badge>}
                          </div>
                          <div style={{ font: "var(--type-body)", color: "var(--text-primary)" }}>
                            {m.content}
                          </div>
                        </div>

                        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                          <Badge
                            tone={m.grade === "correct" ? "success" : m.grade === "partial" ? "warning" : "danger"}
                            size="sm"
                          >
                            {GRADE_LABEL[m.grade] || m.grade}
                          </Badge>
                          <span style={{ font: "var(--type-data)", color: lostPoints ? "var(--warning-text)" : "var(--text-secondary)" }}>
                            {fmtScore(m.points)} / {fmtScore(m.max)} pt
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Ações após conclusão */}
            <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
              <Button
                variant="primary"
                icon="rotate-ccw"
                onClick={() => go("estacao", { id: station?.id })}
              >
                Treinar de novo
              </Button>
              <Button
                variant="secondary"
                icon="list-checks"
                onClick={() => go("peps")}
              >
                Meus PEPs
              </Button>
              <Button
                variant="ghost"
                onClick={() => go("estacoes")}
              >
                Voltar ao banco de estações
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Barra de Ações Fixa (Toolbar) nas etapas ativas */}
      {status !== "done" && (
        <div className="f2-player-toolbar" role="toolbar" aria-label="Ações da estação">
          {status === "reading" && (
            <>
              <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", padding: "0 var(--space-2)" }}>
                Leia o cenário e as tarefas antes de iniciar.
              </span>
              <Button
                icon="play"
                disabled={busy}
                onClick={handleBegin}
                style={{ borderRadius: "var(--radius-pill)" }}
              >
                Iniciar atendimento
              </Button>
            </>
          )}

          {status === "attending" && (
            <>
              <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", padding: "0 var(--space-2)" }}>
                Atendimento em andamento.
              </span>
              <Button
                iconRight="arrow-right"
                disabled={busy}
                onClick={() => handleFinish(false)}
                style={{ borderRadius: "var(--radius-pill)" }}
              >
                Encerrar atendimento e abrir o PEP
              </Button>
            </>
          )}

          {status === "scoring" && (
            <>
              <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", padding: "0 var(--space-2)" }}>
                {allChecklistMarked
                  ? "Todos os itens avaliados."
                  : "Marque todos os itens para salvar."}
              </span>
              <Button
                iconRight="check"
                disabled={!allChecklistMarked || busy}
                onClick={handleSubmitScoring}
                style={{ borderRadius: "var(--radius-pill)" }}
              >
                Concluir e ver a nota
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
