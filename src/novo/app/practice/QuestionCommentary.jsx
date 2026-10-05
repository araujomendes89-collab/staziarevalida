// Análise Stazia da questão (SQIE): pergunta real, dados-chave e análise de cada alternativa.
// O banco só devolve análise PUBLICADA por revisor médico e só depois de responder; sem ela, nada aparece.
// O gabarito oficial é o da prova. "Conduta atual" só aparece quando uma fonte vigente foi conferida e aprovada.
import React from "react";
import { Badge, Button, SegmentedControl } from "../../ds";
import { useSession } from "../session.jsx";

const ROLE = { CRITICAL: "danger", SUPPORTIVE: "info", NEUTRAL: "neutral", DISTRACTOR_INFORMATION: "warning" };
const KIND = { CORRECT: "Correta (gabarito oficial)", WRONG: "Errada", TRUE_BUT_NOT_BEST: "Verdadeira, mas não é a melhor" };
const TEMPORAL = {
  UPDATED_BUT_SAME_ANSWER: "A conduta foi atualizada, mas a resposta oficial continua sendo a melhor.",
  PARTIALLY_OUTDATED: "Parte desta questão está desatualizada.",
  OUTDATED_EXPLANATION: "A explicação da prova está desatualizada; o gabarito oficial permanece como era.",
  OFFICIAL_ANSWER_DIFFERS_FROM_CURRENT: "O gabarito oficial da prova permanece, mas a conduta atual conferida é outra.",
  NO_CURRENT_VALID_OPTION: "Hoje, nenhuma das alternativas representa a conduta atual.",
  CURRENTLY_AMBIGUOUS: "Com as fontes atuais, a questão ficou ambígua.",
  MAJOR_GUIDELINE_CHANGE: "Houve mudança importante de diretriz desde a prova.",
};
const EVENT = {
  OFFICIAL_ANSWER: "Gabarito oficial registrado",
  ANALYSIS_PUBLISHED: "Análise Stazia publicada",
  UPDATE_CARD: "Atualização de conduta publicada",
};
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
const box = { padding: "14px 16px", borderRadius: 14, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", fontSize: 14, lineHeight: 1.55 };

export function useCommentary(questionId) {
  const { backend } = useSession();
  const [state, setState] = React.useState({ id: null, data: null });
  React.useEffect(() => {
    let alive = true;
    if (!questionId) return undefined;
    backend.rpc("app_question_commentary", { p_question_id: questionId, p_level: "full" }).then(
      (data) => {
        if (!alive) return;
        setState({ id: questionId, data });
        // verificar ao servir: com a conferência da fonte vencida, antecipa a verificação (não muda nada sozinho)
        if (data && data.freshness && data.freshness.score < 80) backend.rpc("app_question_verify_on_serve", { p_question_id: questionId }).catch(() => {});
      },
      () => alive && setState({ id: questionId, data: null })
    );
    return () => {
      alive = false;
    };
  }, [backend, questionId]);
  return state.id === questionId ? state.data : null;
}

export function QuestionCommentary({ commentary: c }) {
  const [mode, setMode] = React.useState("exam"); // exam | today | changed
  if (!c) return null;
  const others = c.options.filter((o) => !o.is_official_correct);
  const right = c.options.find((o) => o.is_official_correct);
  const reviewed = c.reviewed_at ? new Date(c.reviewed_at).toLocaleDateString("pt-BR") : null;
  const card = c.update_card;
  const hasCard = Boolean(card);
  return (
    <section aria-label="Análise Stazia da questão" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="sm-overline">Análise Stazia{reviewed ? ` · revisada em ${reviewed}` : ""}</div>
      <Freshness c={c} />
      {hasCard && (
        <SegmentedControl
          label="Ponto de vista"
          value={mode}
          onChange={setMode}
          options={[{ value: "exam", label: "Como caiu na prova" }, { value: "today", label: "Como responder hoje" }, { value: "changed", label: "O que mudou" }]}
        />
      )}
      {hasCard && mode === "today" && <TodayView c={c} />}
      {hasCard && mode === "changed" && <ChangedView c={c} />}
      {(!hasCard || mode === "exam") && (
      <>
      <div style={box}>
        <b>O que a questão pede.</b> {c.question_core}
      </div>
      {c.key_data?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {c.key_data.map((k, i) => (
            <Badge key={i} size="sm" tone={ROLE[k.role] ?? "neutral"} style={{ height: "auto", minHeight: 22, whiteSpace: "normal", lineHeight: 1.3 }}>
              {k.text}
            </Badge>
          ))}
        </div>
      )}
      {right && (
        <div style={box}>
          <b>Por que a {right.option_id} está correta.</b> {right.reasoning}
        </div>
      )}
      {others.map((o) => (
        <div key={o.option_id} style={box}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
            <b>{o.option_id}</b>
            <Badge size="sm" tone={o.distractor_kind === "TRUE_BUT_NOT_BEST" ? "warning" : "neutral"}>{KIND[o.distractor_kind]}</Badge>
          </div>
          {o.why_wrong && <div>{o.why_wrong}</div>}
          {o.why_plausible && <div style={{ color: "var(--text-secondary)" }}><i>Por que atrai:</i> {o.why_plausible}</div>}
          {o.when_correct && <div style={{ color: "var(--text-secondary)" }}><i>Quando estaria correta:</i> {o.when_correct}</div>}
          {o.concept_difference && <div style={{ color: "var(--text-secondary)" }}><i>O que diferencia:</i> {o.concept_difference}</div>}
        </div>
      ))}
      {c.trap && (
        <div style={box}>
          <b>Armadilha de prova.</b> {c.trap}
        </div>
      )}
      {c.golden_rule && (
        <div style={{ ...box, background: "var(--surface-brand-soft)", borderColor: "var(--border-brand)" }}>
          <b>Para lembrar.</b> {c.golden_rule}
        </div>
      )}
      </>
      )}
      {c.sources?.length > 0 && (
        <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>
          <b>Fontes oficiais conferidas.</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {c.sources.map((s, i) => (
              <li key={i}>
                {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title} · {s.organ}
                {s.version ? ` · versão ${s.version}` : ""}
                {s.page != null ? ` · p. ${s.page}` : ""}
                {s.published_on ? ` · publicado em ${new Date(s.published_on + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}
              </li>
            ))}
          </ul>
          {c.sources_checked_at && <div style={{ marginTop: 2 }}>Última conferência: {new Date(c.sources_checked_at).toLocaleDateString("pt-BR")}</div>}
        </div>
      )}
      {c.seal === "UPDATED" && (
        <div style={{ ...box, background: "var(--success-bg)", borderColor: "var(--success-border)" }}>
          <Badge size="sm" tone="success" icon="shield-check">Atualizada</Badge> Conferida com fonte oficial vigente por um revisor médico{c.seal_checked_at ? ` em ${fmt(c.seal_checked_at)}` : ""}.
        </div>
      )}
      {c.update_card && (
        <div style={{ ...box, background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}>
          <div className="sm-overline" style={{ marginBottom: 6 }}>Atualização de conduta</div>
          <div style={{ display: "grid", gap: 4 }}>
            <div><b>Gabarito oficial da prova:</b> alternativa {c.update_card.official_answer}{c.update_card.official_status === "CHANGED_AFTER_APPEAL" ? " (alterado após recurso)" : ""} — registro histórico, não muda.</div>
            <div>
              <b>Conduta atual conferida:</b>{" "}
              {c.update_card.current_answer ? `alternativa ${c.update_card.current_answer}` : "sem alternativa única hoje"}
              {c.update_card.effective_date ? `, em vigor desde ${new Date(c.update_card.effective_date + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}.
            </div>
          </div>
          <p style={{ margin: "8px 0 0" }}>{TEMPORAL[c.update_card.temporal_status]} {c.update_card.what_changed}</p>
          {c.update_card.why_it_matters && <p style={{ margin: "6px 0 0", color: "var(--text-secondary)" }}>{c.update_card.why_it_matters}</p>}
          {c.update_card.options_affected?.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {c.update_card.options_affected.map((o, i) => (
                <li key={i}><b>{o.option_id}:</b> {o.note}</li>
              ))}
            </ul>
          )}
          {c.update_card.sources?.length > 0 && (
            <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)", marginTop: 8 }}>
              Fonte{c.update_card.sources.length > 1 ? "s" : ""}: {c.update_card.sources.map((s) => `${s.title} · ${s.organ}${s.version ? ` · versão ${s.version}` : ""}${s.page != null ? ` · p. ${s.page}` : ""}`).join("; ")}. Conferido em {fmt(c.update_card.verified_at)}.
            </div>
          )}
        </div>
      )}
      {c.update_in_review && (
        <div style={{ ...box, background: "var(--surface-sunken, var(--surface-card))" }}>
          <b>Atualização em revisão.</b> Uma fonte oficial desta questão mudou e está sendo conferida por um revisor médico.{c.update_card ? " Enquanto isso, vale a última conduta revisada acima." : " Enquanto isso, a atualidade desta questão não está conferida."}
        </div>
      )}
      <Timeline questionId={c.question_id} />
    </section>
  );
}

/** Linha do tempo da questão: o que era, o que mudou e quando (só dados públicos para o aluno). */
function Timeline({ questionId }) {
  const { backend } = useSession();
  const [events, setEvents] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const load = async () => {
    setBusy(true);
    try {
      setEvents(await backend.rpc("app_question_timeline", { p_question_id: questionId }));
    } catch {
      setEvents([]);
    } finally {
      setBusy(false);
    }
  };
  if (events === null) {
    return (
      <div>
        <Button size="sm" variant="ghost" icon="history" loading={busy} onClick={load}>Ver o histórico desta questão</Button>
      </div>
    );
  }
  if (events.length === 0) return null;
  return (
    <div style={box}>
      <b>Histórico da questão</b>
      <ol style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 6 }}>
        {events.map((e, i) => (
          <li key={i} style={{ opacity: e.superseded ? 0.65 : 1 }}>
            <b>{fmt(e.at)}</b> · {EVENT[e.type] ?? e.type}
            {e.type === "OFFICIAL_ANSWER" && ` — alternativa ${e.answer ?? "—"}${e.source ? ` (${e.source})` : ""}`}
            {e.type === "UPDATE_CARD" && ` — ${e.current_answer ? `conduta atual: ${e.current_answer}` : "sem alternativa única"}${e.superseded ? " (substituída por versão mais nova)" : ""}`}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Atualidade médica (0–100): só mostra o que o banco calculou; sem fonte oficial conferida o indicador não aparece. */
function Freshness({ c }) {
  const f = c.freshness;
  if (!f || f.sources === 0) return null;
  const tone = f.score >= 80 ? "success" : f.score >= 50 ? "warning" : "danger";
  const label = f.score >= 100 ? "Fonte conferida no prazo" : f.score >= 80 ? "Fonte em dia; nova conferência em breve" : f.score >= 60 ? "Conferência da fonte vencida: verificando" : "Fonte sem conferência em dia";
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", font: "var(--type-caption)", color: "var(--text-secondary)" }}>
      <Badge size="sm" tone={tone}>Atualidade {f.score}%</Badge>
      <span>{label}{f.last_source_check_at ? ` · última verificação ${fmt(f.last_source_check_at)}` : ""}</span>
    </div>
  );
}

/** Como responder hoje: a conduta atual conferida, claramente separada do gabarito da prova. */
function TodayView({ c }) {
  const k = c.update_card;
  return (
    <div style={{ ...box, background: "var(--warning-bg)", borderColor: "var(--warning-border)", display: "grid", gap: 6 }}>
      <div className="sm-overline">Como seria respondida hoje</div>
      {k.current_answer ? (
        <div><b>Pelas recomendações vigentes conferidas, a alternativa {k.current_answer} seria a mais adequada.</b></div>
      ) : (
        <div><b>Nenhuma alternativa representa, sozinha, a conduta atualmente recomendada.</b></div>
      )}
      <div>{TEMPORAL[k.temporal_status]}</div>
      <div style={{ color: "var(--text-secondary)" }}>O gabarito oficial da prova ({k.official_answer}) continua sendo o da prova e não muda.</div>
      <div>{k.what_changed}</div>
    </div>
  );
}

/** O que mudou desde a prova: antes × agora, quando, por quê e a fonte. */
function ChangedView({ c }) {
  const k = c.update_card;
  return (
    <div style={{ ...box, display: "grid", gap: 8 }}>
      <div className="sm-overline">O que mudou desde esta prova</div>
      <div><b>Na época da prova:</b> o gabarito oficial foi a alternativa {k.official_answer}{c.official_status === "FINAL" ? " (definitivo)" : ""}.</div>
      <div><b>Atualmente:</b> {k.current_answer ? `a conduta vigente conferida aponta a alternativa ${k.current_answer}` : "nenhuma alternativa traz integralmente a conduta vigente"}{k.effective_date ? `, em vigor desde ${new Date(k.effective_date + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}.</div>
      <div><b>O que mudou:</b> {k.what_changed}</div>
      {k.why_it_matters && <div><b>Por que importa:</b> {k.why_it_matters}</div>}
      {k.sources?.length > 0 && <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}><b>Fonte:</b> {k.sources.map((x) => `${x.title} · ${x.organ}${x.version ? ` · versão ${x.version}` : ""}${x.page != null ? ` · p. ${x.page}` : ""}`).join("; ")}. Conferido em {fmt(k.verified_at)}.</div>}
    </div>
  );
}
