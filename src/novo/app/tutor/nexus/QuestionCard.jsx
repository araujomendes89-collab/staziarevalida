// Cartão da questão na conversa da Nexus (modos Questões e Meus erros), ao lado da esfera no computador e abaixo dela no celular
// (prévia aprovada em 2026-10-08). O enunciado aparece aqui e não é lido em voz alta. Tocar uma alternativa só marca; "Responder"
// manda a marcada (quem corrige é o banco, pelo gabarito oficial).
import React from "react";
import { AnswerOption, Badge, Button } from "../../../ds";
import { examLabel, splitStatement } from "../../practice/format.js";

export function QuestionCard({ session, marked, busy = false, gate = null, onMark, onAnswer, onHint, onReveal, onNext }) {
  const q = session.question;
  if (!q) return null;
  const open = q.state === "open";
  const parts = splitStatement(q.statement ?? "");
  const answered = session.last_answer;
  const stateOf = (id) => {
    if (open) return id === marked ? "selected" : "idle";
    if (id === q.correct_option) return "correct";
    if (answered && id === answered.selected) return "incorrect";
    return "dimmed";
  };
  return (
    <section className="nx-q" aria-label="Questão">
      <div className="nx-q__head">
        <span className="nx-q__over">Questão</span>
        <span className="nx-q__ref">{q.exam ? examLabel(q.exam) : "Questão"}{q.number ? ` · nº ${q.number}` : ""}{q.topic ? ` · ${q.topic}` : ""}</span>
      </div>
      <p className="nx-q__stem">{parts.stem}</p>
      {parts.ask && <p className="nx-q__ask">{parts.ask}</p>}
      <div role="radiogroup" aria-label="Alternativas" className="nx-q__alts">
        {(q.options ?? []).map((o) => (
          <AnswerOption key={o.id} letter={o.id} state={stateOf(o.id)} onClick={() => open && onMark(o.id)}>
            {o.text}
          </AnswerOption>
        ))}
      </div>
      {open ? (
        <>
          <p className="nx-q__tip">Diga “confirmo” para responder ou “cancela” para desmarcar.</p>
          <div className="nx-q__actions">
            <Button disabled={!marked || busy} onClick={() => onAnswer(marked)}>Responder</Button>
            <Button variant="secondary" disabled={busy || session.hint_level >= 5} onClick={onHint}>{session.hint_level >= 5 ? "Sem mais ajuda" : "Pedir ajuda"}</Button>
            <Button variant="ghost" disabled={busy} onClick={onReveal}>Ver resolução</Button>
          </div>
        </>
      ) : (
        <div className="nx-q__result">
          {q.state === "revealed" && <Badge tone="warning">O professor contou a resposta: não conta no seu histórico</Badge>}
          {answered && <Badge tone={answered.is_correct ? "success" : "danger"}>{answered.is_correct ? "Você acertou" : `Você marcou ${answered.selected}; a correta é ${q.correct_option}`}</Badge>}
          {session.status === "active" && <Button size="sm" iconRight="arrow-right" disabled={busy || gate === "explain"} onClick={onNext}>Próxima</Button>}
          {gate === "explain" && <span className="nx-q__tip">Antes da próxima: explique ao professor o seu raciocínio nesta questão.</span>}
        </div>
      )}
    </section>
  );
}
