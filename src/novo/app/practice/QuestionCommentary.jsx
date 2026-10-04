// Análise Stazia da questão (SQIE): pergunta real, dados-chave e análise de cada alternativa.
// O banco só devolve análise PUBLICADA por revisor médico e só depois de responder; sem ela, nada aparece.
// O gabarito oficial é o da prova. "Conduta atual" só aparece quando uma fonte vigente foi conferida e aprovada.
import React from "react";
import { Badge, Button } from "../../ds";
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
