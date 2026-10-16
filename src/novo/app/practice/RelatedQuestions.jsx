// "Questões relacionadas" (Motor de Similaridade Clínica e Pedagógica, pedido do dono de 2026-10-12): depois de responder, outras
// questões do mesmo assunto com abordagens diferentes, cada uma com o motivo. Aparece na correção da questão (treino), na revisão
// do resultado e no caderno de erros. Só é carregado quando a correção já está na tela (nunca antes de responder).
// O banco (app_related_questions) devolve só o que serve para escolher a próxima: prova, número, assunto e o motivo. Esta tela
// nunca mostra gabarito, explicação nem enunciado de outra questão, mesmo que venham na resposta. Nada aqui chama IA.
// Banco ainda sem a função, erro ou lista vazia: o bloco não aparece e o resto da correção segue igual.
import React from "react";
import { Badge, Button, Chip } from "../../ds";
import { useSession } from "../session.jsx";
import { explainError } from "../../../shared/errors/explicarErro";

const LIMIT = 8;

/** Rótulo de cada tipo de relação para o aluno. Outros tipos (duplicada, não relacionada) nunca aparecem aqui. */
export const RELATION_LABEL = {
  mesmo_raciocinio: "Raciocínio semelhante",
  complementar: "Questão complementar",
  mesmo_subtema: "Mesmo assunto",
  mesmo_tema: "Mesmo assunto",
};

const FILTERS = [
  { value: "todas", label: "Todas", keep: () => true },
  { value: "semelhantes", label: "Semelhantes", keep: (relation) => relation === "mesmo_raciocinio" || relation === "mesmo_subtema" },
  { value: "complementares", label: "Complementares", keep: (relation) => relation === "complementar" },
];

const LOCK_TEXT = "As Questões Inéditas são abertas a quem tem plano pago ou teste grátis em dia. As questões das provas oficiais continuam abertas.";
const NOT_YET = "Abrir esta questão por aqui ainda não está disponível. Tente mais tarde.";
const missingFunction = (error) => /could not find the function|schema cache|PGRST202|42883|does not exist/i.test(String(error?.message ?? error ?? ""));
const box = { padding: "14px 16px", borderRadius: 14, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", fontSize: 14, lineHeight: 1.5 };

/** Só os campos que o aluno pode ver, dos tipos de relação conhecidos, sem a própria questão. */
export function relatedItems(result, questionId) {
  const list = Array.isArray(result?.items) ? result.items : [];
  const seen = new Set();
  return list
    .filter((i) => i && i.id && i.id !== questionId && RELATION_LABEL[i.relation] && !seen.has(i.id) && seen.add(i.id))
    .map((i) => ({
      id: i.id,
      exam_label: i.exam_label ?? "",
      number: i.number ?? null,
      relation: i.relation,
      subtema: i.subtema || i.tema || "",
      reason: i.reason ?? "",
      answered: i.answered === true,
      locked: i.locked === true,
      lock_message: i.lock_message ?? null,
    }));
}

/** "Revalida 2024/1 • Questão 51 — Raciocínio semelhante" */
export function relatedTitle(item) {
  const where = [item.exam_label, item.number != null ? `Questão ${item.number}` : null].filter(Boolean).join(" • ");
  return `${where} — ${RELATION_LABEL[item.relation]}`;
}

export function RelatedQuestions({ questionId, go, inSession = false }) {
  const { backend } = useSession();
  const [items, setItems] = React.useState(null);
  const [filter, setFilter] = React.useState("todas");
  const [opening, setOpening] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setItems(null);
    setFilter("todas");
    setError(null);
    Promise.resolve()
      .then(() => backend.rpc("app_related_questions", { p_question_id: questionId, p_limit: LIMIT }))
      .then(
        (result) => alive && setItems(relatedItems(result, questionId)),
        () => alive && setItems([]) // banco sem a função ou falha: o bloco some, sem aviso técnico
      );
    return () => {
      alive = false;
    };
  }, [backend, questionId]);

  if (!items || items.length === 0) return null;
  const keep = FILTERS.find((f) => f.value === filter).keep;
  const shown = items.filter((i) => keep(i.relation));

  // o caminho de sempre para resolver: o banco abre uma sessão de treino só com esta questão e a tela da sessão a mostra
  const open = async (item) => {
    setOpening(item.id);
    setError(null);
    try {
      const started = await backend.rpc("app_start_related_question", { p_question_id: item.id });
      if (!started?.session_id) throw new Error(NOT_YET);
      go("sessao", { s: started.session_id });
    } catch (e) {
      setError(missingFunction(e) ? NOT_YET : explainError(e, "Não foi possível abrir esta questão. Tente de novo."));
      setOpening(null);
    }
  };

  return (
    <section aria-label="Questões relacionadas" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div>
        <div className="sm-overline">Questões relacionadas</div>
        <p style={{ margin: "4px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Mesmo assunto, diferentes abordagens</p>
      </div>
      <div role="group" aria-label="Filtrar questões relacionadas" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <Chip key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </Chip>
        ))}
      </div>
      {shown.length === 0 ? (
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Nenhuma questão neste filtro.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map((item) => {
            const title = relatedTitle(item);
            return (
              <li key={item.id} style={{ ...box, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <div style={{ font: "600 14px/1.4 var(--font-sans)", overflowWrap: "anywhere" }}>{title}</div>
                {item.subtema && <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>{item.subtema}</div>}
                {item.reason && <div style={{ overflowWrap: "anywhere" }}>{item.reason}</div>}
                {item.locked && <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{item.lock_message || LOCK_TEXT}</div>}
                <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginTop: 2 }}>
                  {item.answered ? (
                    <Badge size="sm" tone="success" icon="circle-check">
                      já respondida
                    </Badge>
                  ) : (
                    <span />
                  )}
                  {item.locked ? (
                    <Button size="sm" variant="secondary" icon="lock" onClick={() => go("planos")}>
                      Ver planos
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      iconRight="arrow-right"
                      loading={opening === item.id}
                      disabled={opening != null && opening !== item.id}
                      onClick={() => open(item)}
                      aria-label={`Resolver: ${title}`}
                    >
                      Resolver
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <div role="alert" style={{ font: "var(--type-body-sm)", color: "var(--danger-text)" }}>
          {error}
        </div>
      )}
      {inSession && (
        <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
          Abrir outra questão sai deste treino. Suas respostas ficam guardadas e você continua pela tela inicial.
        </p>
      )}
    </section>
  );
}
