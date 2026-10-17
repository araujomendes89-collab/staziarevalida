// Resultado de um treino ou simulado: placar, desempenho por área e revisão questão a questão.
// O protótipo não tem esta tela; ela usa só componentes do design system.
import React from "react";
import { Badge, Banner, Button, Card, Icon, ProgressBar, StatCard, Tabs } from "../../ds";
import { useMQ } from "../Shell.jsx";
import { PreliminarySeal, isAnnulled } from "./Correction.jsx";
import { areaLabel, areaOf, formatClock, formatWhen, percent } from "./format.js";
import { QuestionReview } from "./tela/QuestionReview.jsx";
import { TriResult } from "./TriResult.jsx";
import { MiniTutor, contextoDaRevisao } from "../tutor/mini";

// Anulada pela banca: fora de certas, erradas e em branco (não conta como acerto nem erro).
const stateOf = (question) =>
  isAnnulled(question.correction) ? "annulled" : question.selected == null ? "blank" : question.correction.is_correct ? "right" : "wrong";
const STATE = {
  right: { icon: "circle-check", color: "var(--success-text)", label: "Certa" },
  wrong: { icon: "circle-x", color: "var(--danger-text)", label: "Errada" },
  blank: { icon: "circle-minus", color: "var(--text-tertiary)", label: "Em branco" },
  annulled: { icon: "ban", color: "var(--text-tertiary)", label: "Anulada" },
};

function ReviewRow({ question, position, first, open, onToggle, go, showDifficulty }) {
  const state = STATE[stateOf(question)];
  return (
    <div style={{ borderTop: first ? 0 : "1px solid var(--border-subtle)" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 0", border: 0, background: "transparent", cursor: "pointer", font: "inherit", color: "var(--text-primary)", textAlign: "left" }}
      >
        <Icon name={state.icon} size={20} label={state.label} style={{ color: state.color, flex: "none" }} />
        <span style={{ font: "600 13px var(--font-mono)", color: "var(--text-tertiary)", width: 28, flex: "none" }}>{position}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", font: "var(--type-body-sm)" }}>{question.statement}</span>
        <PreliminarySeal info={question.preliminary} compact />
        <Badge size="sm">{areaLabel(question.area)}</Badge>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={18} style={{ color: "var(--text-tertiary)", flex: "none" }} />
      </button>
      {open && (
        <div style={{ padding: "4px 0 24px" }}>
          <QuestionReview question={question} selected={question.selected} correction={question.correction} go={go} showDifficulty={showDifficulty} />
        </div>
      )}
    </div>
  );
}

export function SessionResult({ session, go, timeUp = false }) {
  const mobile = useMQ("(max-width: 860px)");
  const sim = session.kind === "simulado";
  const result = session.result;
  // No simulado, em branco conta como erro; no treino, só entram as respondidas.
  const base = sim ? result.total : result.answered;
  // o placar já vem sem as anuladas (…7700); elas aparecem à parte no filtro "Anuladas"
  const wrong = result.answered - result.correct;
  const blank = result.total - result.answered;
  const annulled = session.questions.filter((question) => stateOf(question) === "annulled").length;
  const score = percent(result.correct, base);
  // quantas eram Questões Inéditas (à parte do placar): só aparece quando a sessão mistura as duas coleções
  const ineditas = result.ineditas && result.ineditas.total > 0 && result.ineditas.total < result.total ? result.ineditas : null;

  const [filter, setFilter] = React.useState("all");
  const [openId, setOpenId] = React.useState(null);
  const rows = session.questions.map((question, index) => ({ question, position: index + 1 }));
  const visible = rows.filter((row) => filter === "all" || stateOf(row.question) === filter);
  const back = sim ? "simulados" : "questoes";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-app)" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 5, height: 68, display: "flex", alignItems: "center", gap: 16, padding: mobile ? "0 12px" : "0 32px", borderBottom: "1px solid var(--border-subtle)", background: "color-mix(in oklab,var(--surface-card) 90%,transparent)", backdropFilter: "blur(12px)" }}>
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={() => go(back)}>
          Voltar
        </Button>
        <span style={{ font: "var(--type-label)", color: "var(--text-secondary)" }}>
          {sim ? "Resultado do simulado" : "Resultado do treino"} · {formatWhen(session.started_at)}
        </span>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: mobile ? "20px 16px 48px" : "32px 32px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
        {timeUp && (
          <Banner tone="warning" title="Tempo encerrado">
            O simulado foi finalizado com as respostas que estavam marcadas.
          </Banner>
        )}

        {/* simulado corrigido em TRI (opcional): a estimativa vem em cima; o placar clássico continua logo abaixo */}
        {sim && <TriResult sessionId={session.id} mobile={mobile} />}

        <Card style={{ borderRadius: 24 }} padding={mobile ? 22 : 32}>
          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
                Aproveitamento
              </span>
              <h1 style={{ margin: "8px 0 0", font: "700 56px/1 var(--font-sans)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
                {base > 0 ? `${score}%` : "—"}
              </h1>
              <p style={{ margin: "10px 0 0", color: "var(--text-secondary)" }}>
                {base > 0
                  ? `${result.correct} de ${base} ${sim ? "questões" : base === 1 ? "respondida" : "respondidas"} · ${areaLabel(session.filters?.area)}`
                  : "Nenhuma questão respondida nesta sessão."}
              </p>
              {ineditas && (
                <p style={{ margin: "6px 0 0", color: "var(--text-secondary)" }}>
                  Questões Inéditas: {ineditas.total} {ineditas.total === 1 ? "questão" : "questões"} neste {sim ? "simulado" : "treino"} · {ineditas.correct} {ineditas.correct === 1 ? "certa" : "certas"} de {ineditas.answered} {ineditas.answered === 1 ? "respondida" : "respondidas"}
                </p>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button iconRight="arrow-right" onClick={() => go(back)}>
                {sim ? "Novo simulado" : "Novo treino"}
              </Button>
              <Button variant="secondary" onClick={() => go("home")}>
                Início
              </Button>
            </div>
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))", gap: 16 }}>
          <StatCard label="Acertos" value={result.correct} icon="circle-check" tone="success" />
          <StatCard label="Erros" value={wrong} icon="circle-x" tone="danger" />
          <StatCard label="Em branco" value={blank} icon="circle-minus" tone="neutral" />
          <StatCard label="Tempo" value={formatClock(sim ? result.elapsed_seconds : result.active_seconds)} icon="timer" tone="info" caption={sim ? (result.paused_seconds > 0 ? "do início ao fim, sem as pausas" : "do início ao fim") : "respondendo"} />
        </div>

        {result.by_area.length > 1 && (
          <Card style={{ borderRadius: 24 }} padding={mobile ? 22 : 28}>
            <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
              Por grande área
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
              {result.by_area.map((area) => {
                const areaBase = sim ? area.total : area.answered;
                return (
                  <ProgressBar
                    key={area.area}
                    label={areaLabel(area.area)}
                    value={area.correct}
                    max={Math.max(areaBase, 1)}
                    valueLabel={areaBase ? `${area.correct}/${areaBase} · ${percent(area.correct, areaBase)}%` : "sem respostas"}
                    color={`var(${areaOf(area.area)?.tone ?? "--chart-1"})`}
                  />
                );
              })}
            </div>
          </Card>
        )}

        <Card style={{ borderRadius: 24 }} padding={mobile ? 22 : 28}>
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
            Revisão
          </span>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <Tabs
              label="Filtrar questões"
              value={filter}
              onChange={(value) => {
                setFilter(value);
                setOpenId(null);
              }}
              tabs={[
                { value: "all", label: "Todas", count: session.questions.length },
                { value: "wrong", label: "Erradas", count: wrong },
                { value: "blank", label: "Em branco", count: blank },
                { value: "right", label: "Certas", count: result.correct },
                ...(annulled ? [{ value: "annulled", label: "Anuladas", count: annulled }] : []),
              ]}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            {visible.length === 0 && <p style={{ margin: "16px 0 0", color: "var(--text-secondary)" }}>Nenhuma questão neste filtro.</p>}
            {visible.map((row, index) => (
              <ReviewRow
                key={row.question.id}
                question={row.question}
                position={row.position}
                open={openId === row.question.id}
                onToggle={() => setOpenId(openId === row.question.id ? null : row.question.id)}
                first={index === 0}
                go={go}
                showDifficulty={!sim}
              />
            ))}
          </div>
        </Card>
      </main>
      {/* mini tutor: a questão aberta na revisão (simulado já entregue: explica tudo) */}
      <MiniTutor contexto={contextoDaRevisao(session.questions.find((q) => q.id === openId), { simulado: sim })} go={go} />
    </div>
  );
}
