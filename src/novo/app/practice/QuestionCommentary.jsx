// Análise Stazia da questão (SQIE): pergunta real, dados-chave e análise de cada alternativa.
// O banco só devolve análise PUBLICADA por revisor médico e só depois de responder; sem ela, nada aparece.
// O gabarito oficial é o da prova. "Conduta atual" só aparece quando uma fonte vigente foi conferida e aprovada.
import React from "react";
import { Badge } from "../../ds";
import { useSession } from "../session.jsx";

const ROLE = { CRITICAL: "danger", SUPPORTIVE: "info", NEUTRAL: "neutral", DISTRACTOR_INFORMATION: "warning" };
const KIND = { CORRECT: "Correta (gabarito oficial)", WRONG: "Errada", TRUE_BUT_NOT_BEST: "Verdadeira, mas não é a melhor" };
const box = { padding: "14px 16px", borderRadius: 14, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", fontSize: 14, lineHeight: 1.55 };

export function useCommentary(questionId) {
  const { backend } = useSession();
  const [state, setState] = React.useState({ id: null, data: null });
  React.useEffect(() => {
    let alive = true;
    if (!questionId) return undefined;
    backend.rpc("app_question_commentary", { p_question_id: questionId, p_level: "full" }).then(
      (data) => alive && setState({ id: questionId, data }),
      () => alive && setState({ id: questionId, data: null })
    );
    return () => {
      alive = false;
    };
  }, [backend, questionId]);
  return state.id === questionId ? state.data : null;
}

export function QuestionCommentary({ commentary: c }) {
  if (!c) return null;
  const others = c.options.filter((o) => !o.is_official_correct);
  const right = c.options.find((o) => o.is_official_correct);
  const updated = c.current_best_answer && c.official_answer && c.current_best_answer !== c.official_answer;
  const reviewed = c.reviewed_at ? new Date(c.reviewed_at).toLocaleDateString("pt-BR") : null;
  return (
    <section aria-label="Análise Stazia da questão" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="sm-overline">Análise Stazia{reviewed ? ` · revisada em ${reviewed}` : ""}</div>
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
      {updated && (
        <div style={{ ...box, background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}>
          <b>Atualização de diretriz.</b> O gabarito oficial da prova ({c.official_answer}) permanece. Segundo a recomendação vigente conferida, a alternativa {c.current_best_answer} seria a mais adequada hoje.
        </div>
      )}
    </section>
  );
}
