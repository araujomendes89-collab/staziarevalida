// "Travou? Peça uma dica ao Tutor" (modelo "Tela de Questão"): só no treino do Banco de Questões, só ANTES de responder e só quando o
// servidor liberou (nasce desligada). A dica não revela gabarito, explicação nem fontes (o servidor só lê enunciado e alternativas
// e barra o que cita letra de alternativa). Sem servidor liberado, o botão nem aparece.
import React from "react";
import { Icon } from "../../../ds";
import { useSession } from "../../session.jsx";
import { tutorAvailable, tutorQuestionHint, tutorServerStatus } from "../../tutor/api.js";
import "./tela-questao.css";

/** O servidor liberou a dica? (uma consulta por tela de sessão; nasce desligada no servidor) */
export function useHintAvailable(backend) {
  const [ok, setOk] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    if (!backend || !tutorAvailable(backend)) return undefined;
    tutorServerStatus(backend).then(
      (s) => alive && setOk(s?.question_hint === true),
      () => alive && setOk(false)
    );
    return () => {
      alive = false;
    };
  }, [backend]);
  return ok;
}

export function TutorHint({ questionId }) {
  const { backend } = useSession();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [text, setText] = React.useState(null);
  const [error, setError] = React.useState(null);
  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (text || loading) return;
    setLoading(true);
    setError(null);
    try {
      const out = await tutorQuestionHint(backend, questionId);
      setText(out.hint);
    } catch (e) {
      setError(e?.message || "Não foi possível pedir a dica agora. Tente de novo.");
    }
    setLoading(false);
  };
  return (
    <div className="tq-hint">
      <button type="button" className="tq-hint__btn" onClick={toggle} aria-expanded={open}>
        <Icon name="lightbulb" size={18} />
        {open ? "Esconder dica do Tutor" : "Travou? Peça uma dica ao Tutor"}
      </button>
      {open && (
        <div aria-live="polite">
          {loading && <p className="tq-hint__t">O Tutor está pensando…</p>}
          {text && <p className="tq-hint__t">{text}</p>}
          {error && (
            <p className="tq-hint__t" role="alert" style={{ color: "var(--danger-text)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
