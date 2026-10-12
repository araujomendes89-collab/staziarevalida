// Histórico de mudanças da questão no editor (Q12, leva 3): visível a toda a equipe. Mostra quem mudou, quando, o motivo e o antes
// e o depois de cada campo. "Voltar para este texto" só COPIA o texto antigo para o formulário: nada é salvo até a pessoa conferir
// e clicar em "Salvar questão". Gabarito e situação só mudam pelo registro do gabarito oficial, então não têm botão.
import React from "react";
import { Banner, Button, Card } from "../../ds";
import { useSession } from "../session.jsx";
import { dateBR, dateTimeBR, messageOf, QUESTION_STATUS_LABEL } from "./common.jsx";

const PAGE = 50;
const LETTERS = ["A", "B", "C", "D"];
// a ordem e o nome de cada campo na tela (o banco guarda os nomes em inglês)
const FIELDS = [
  ["statement", "Enunciado"], ["options", "Alternativas"], ["correct_option", "Gabarito"], ["status", "Situação"], ["prova", "Prova e número"],
  ["topic", "Tema"], ["subtopic", "Subtema"], ["expected_conduct", "Conduta esperada"], ["inep_intent", "O que a questão avalia"],
  ["figura", "Figura"], ["needs_image", "Marca “Cita figura”"],
];
const LABEL = Object.fromEntries(FIELDS);
const RESTORABLE = new Set(["statement", "topic", "subtopic", "expected_conduct", "inep_intent"]);
const summaryOf = (changes) => FIELDS.filter(([key]) => changes?.[key]).map(([, label]) => label).join(", ");
const textOf = (value) => (value == null || String(value).trim() === "" ? "(vazio)" : String(value));

function Side({ title, children }) {
  return (
    <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="sm-field__label">{title}</div>
      <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{children}</p>
    </div>
  );
}

/** Um campo que mudou: antes e depois lado a lado; se for texto, com o botão que copia o texto de antes para o formulário. */
function ChangedField({ label, before, after, restore, note, nameOf = textOf }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 0", borderTop: "1px solid var(--border-default)" }}>
      <div style={{ font: "var(--type-label)" }}>{label}</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Side title="Antes">{nameOf(before)}</Side>
        <Side title="Depois">{nameOf(after)}</Side>
      </div>
      {restore && (
        <div>
          <Button size="sm" variant="secondary" aria-label={`Voltar para este texto: ${label}`} onClick={restore}>
            Voltar para este texto
          </Button>
        </div>
      )}
      {note && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{note}</div>}
    </div>
  );
}

function Detail({ entry, onRestore }) {
  const c = entry.changes ?? {};
  const optionOf = (list, id) => (Array.isArray(list) ? list.find((o) => o?.id === id) : null) ?? {};
  const LOCKED = "Gabarito e situação só mudam pelo registro do gabarito oficial (administrador): aqui não dá para voltar.";
  return (
    <div role="group" aria-label={`O que mudou em ${dateBR(entry.at)}`}>
      {FIELDS.map(([key, label]) => {
        const change = c[key];
        if (!change) return null;
        if (key === "options") {
          return LETTERS.flatMap((id) => {
            const before = optionOf(change.de, id);
            const after = optionOf(change.para, id);
            const parts = [];
            if ((before.text ?? "") !== (after.text ?? "")) {
              parts.push(<ChangedField key={`${id}-t`} label={`Alternativa ${id}`} before={before.text} after={after.text} restore={() => onRestore({ option: id, field: "text" }, before.text ?? "")} />);
            }
            if ((before.explanation ?? "") !== (after.explanation ?? "")) {
              parts.push(<ChangedField key={`${id}-e`} label={`Explicação da ${id}`} before={before.explanation} after={after.explanation} restore={() => onRestore({ option: id, field: "explanation" }, before.explanation ?? "")} />);
            }
            return parts;
          });
        }
        if (key === "status") return <ChangedField key={key} label={label} before={change.de} after={change.para} nameOf={(v) => QUESTION_STATUS_LABEL[v] ?? textOf(v)} />;
        if (key === "correct_option") return <ChangedField key={key} label={label} before={change.de} after={change.para} nameOf={(v) => (v ? String(v) : "(sem gabarito)")} />;
        if (key === "figura") return <ChangedField key={key} label={label} before={change.de} after={change.para} nameOf={(v) => v || "(sem figura)"} />;
        if (key === "needs_image") return <ChangedField key={key} label={label} before={change.de} after={change.para} nameOf={(v) => (v ? "marcada" : "desmarcada")} />;
        return <ChangedField key={key} label={label} before={change.de} after={change.para} restore={RESTORABLE.has(key) ? () => onRestore({ field: key }, change.de ?? "") : undefined} />;
      })}
      {(c.correct_option || c.status) && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", paddingTop: 8, borderTop: "1px solid var(--border-default)" }}>{LOCKED}</div>}
    </div>
  );
}

export function QuestionHistory({ questionId, onRestore, refreshKey = 0 }) {
  const { backend } = useSession();
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState({ items: [], total: 0, loading: false, error: null, loaded: false });
  const [shown, setShown] = React.useState({}); // id da mudança → detalhe aberto
  const [note, setNote] = React.useState(null);

  const load = async (offset) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await backend.rpc("app_admin_question_history", { p_question_id: questionId, p_limit: PAGE, p_offset: offset });
      setState((s) => ({ items: offset === 0 ? page.items : s.items.concat(page.items.filter((i) => !s.items.some((x) => x.id === i.id))), total: page.total, loading: false, error: null, loaded: true }));
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error: messageOf(error, "Não foi possível carregar o histórico. Tente de novo.") }));
    }
  };
  const show = () => {
    setOpen(true);
    if (!state.loaded) load(0);
  };
  // uma mudança feita no próprio editor (salvar, figura, decisão do revisor) invalida o que já foi carregado: aberto, recarrega
  // agora; fechado, recarrega na próxima vez que abrir
  const lastKey = React.useRef(refreshKey);
  React.useEffect(() => {
    if (lastKey.current === refreshKey) return;
    lastKey.current = refreshKey;
    if (open) load(0);
    else setState((s) => ({ ...s, loaded: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
  const restore = (target, value) => {
    onRestore(target, value);
    setNote("Texto copiado para o formulário. Confira e clique em “Salvar questão”: nada foi salvo ainda.");
  };

  return (
    <section aria-label="Histórico de mudanças">
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Histórico de mudanças</h3>
            {!open ? (
              <Button size="sm" variant="secondary" onClick={show}>
                Ver histórico de mudanças
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Esconder histórico
              </Button>
            )}
          </div>
          {open && (
            <>
              <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
                Toda a equipe vê quem mudou a questão e quando. “Voltar para este texto” só copia o texto de antes para o formulário; a questão só muda quando você salva.
              </p>
              {note && (
                <div role="status" style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>
                  {note}
                </div>
              )}
              {state.error && (
                <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={() => load(state.items.length)}>Tentar de novo</Button>}>
                  {state.error}
                </Banner>
              )}
              {state.loading && state.items.length === 0 && <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>}
              {state.loaded && state.total === 0 && <p style={{ margin: 0, color: "var(--text-secondary)" }}>Esta questão ainda não foi alterada depois de criada.</p>}
              {state.items.length > 0 && (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                  {state.items.map((entry) => {
                    const when = dateBR(entry.at);
                    const isOpen = Boolean(shown[entry.id]);
                    return (
                      <li key={entry.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border-default)" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", font: "var(--type-body-sm)" }}>
                          <b>{dateTimeBR(entry.at)}</b>
                          <span>{entry.by ?? "Alteração feita direto no banco"}</span>
                          {entry.reason && <span style={{ color: "var(--text-secondary)" }}>{entry.reason}</span>}
                        </div>
                        <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{summaryOf(entry.changes) || "Mudança sem campo conhecido"}</div>
                        <div>
                          <Button size="sm" variant="ghost" aria-expanded={isOpen} aria-label={`${isOpen ? "Esconder" : "Ver"} o que mudou em ${when}`} onClick={() => setShown((s) => ({ ...s, [entry.id]: !s[entry.id] }))}>
                            {isOpen ? "Esconder" : "Ver o que mudou"}
                          </Button>
                        </div>
                        {isOpen && <Detail entry={entry} onRestore={restore} />}
                      </li>
                    );
                  })}
                </ul>
              )}
              {state.items.length > 0 && state.items.length < state.total && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Button variant="secondary" onClick={() => load(state.items.length)} loading={state.loading}>
                    Carregar mais
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </section>
  );
}
