// Etapa 2: atendimento por escrito. Enunciado, relato do caso (impresso inicial), uma caixa de texto por tarefa e os impressos.
// O texto é salvo sozinho 800 ms depois de parar de digitar, antes de entregar e ao sair da página; recarregar volta com o texto.
// Em 00:00 o treino NÃO se encerra: a pessoa pode continuar e entregar.
import React from "react";
import { Banner, Button, Card, Dialog, Textarea } from "../../../ds";
import { formatDecimal } from "../../../ds/format.js";
import { messageOf } from "../../admin/common.jsx";
import { splitBlocks } from "../../dupla/content.js";
import { InitialPrint, PrintList } from "./SoloPrints.jsx";
import { MAX_TOTAL_CHARS, answersFromTexts, buildTaskModel, charLimit, textsFromAnswers } from "./tasks.js";

/** Espera depois da última tecla antes de salvar. */
export const SAVE_DELAY_MS = 800;
/** Se o salvamento falhar, tenta de novo depois deste tempo. */
const RETRY_MS = 5000;

export const PLACEHOLDER = "Escreva aqui como você faria e o que diria ao paciente.";

const SAVE_NOTE = {
  dirty: "Alterações ainda não salvas.",
  saving: "Salvando…",
  saved: "Texto salvo.",
  error: "Não foi possível salvar agora. Vamos tentar de novo.",
};

/**
 * Guarda os textos e os salva no servidor: 800 ms depois de parar de digitar, ao esconder a página (pagehide / aba em segundo
 * plano) e ao sair da tela. Salvamentos nunca se atropelam (um de cada vez, o último texto vence).
 */
function useAutosave(api, attemptId, initial) {
  const [texts, setTexts] = React.useState(initial);
  const [state, setState] = React.useState("idle"); // idle | dirty | saving | saved | error
  const textsRef = React.useRef(initial);
  const dirty = React.useRef(false);
  const timer = React.useRef(null);
  const queue = React.useRef(Promise.resolve());
  const alive = React.useRef(true);

  const save = React.useCallback(() => {
    clearTimeout(timer.current);
    queue.current = queue.current.then(async () => {
      if (!dirty.current) return;
      dirty.current = false;
      if (alive.current) setState("saving");
      try {
        await api.saveAnswers(attemptId, answersFromTexts(textsRef.current));
        if (alive.current) setState(dirty.current ? "dirty" : "saved");
      } catch {
        dirty.current = true;
        if (alive.current) {
          setState("error");
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(), RETRY_MS);
        }
      }
    });
    return queue.current;
  }, [api, attemptId]);

  const change = React.useCallback(
    (index, value) => {
      const next = textsRef.current.map((text, i) => (i === index ? value : text));
      textsRef.current = next;
      setTexts(next);
      dirty.current = true;
      setState("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
    },
    [save]
  );

  React.useEffect(() => {
    alive.current = true;
    const flush = () => {
      if (dirty.current) void save();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      clearTimeout(timer.current);
      // ao sair da tela o que sobrou vai para o servidor (sem esperar resposta)
      if (dirty.current) {
        dirty.current = false;
        api.saveAnswers(attemptId, answersFromTexts(textsRef.current)).catch(() => undefined);
      }
      alive.current = false;
    };
  }, [api, attemptId, save]);

  /** Para o salvamento e espera o que estava a caminho; o chamador entrega os textos junto. */
  const settle = React.useCallback(async () => {
    clearTimeout(timer.current);
    await queue.current.catch(() => undefined);
  }, []);

  /** A entrega falhou: o texto continua pendente e volta a ser salvo sozinho. */
  const keepDirty = React.useCallback(() => {
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
  }, [save]);

  /** A entrega deu certo: o servidor já tem o texto. */
  const delivered = React.useCallback(() => {
    dirty.current = false;
    clearTimeout(timer.current);
  }, []);

  return { texts, state, change, settle, textsRef, keepDirty, delivered };
}

function TaskBoxes({ model, texts, onChange }) {
  const total = texts.reduce((sum, text) => sum + text.length, 0);
  return (
    <>
      {model.single ? (
        <Textarea
          rows={10}
          aria-label="Sua resposta"
          placeholder={PLACEHOLDER}
          value={texts[0] ?? ""}
          maxLength={charLimit(texts, 0)}
          onChange={(e) => onChange(0, e.target.value)}
        />
      ) : (
        <ol className="f2-solo-tasks">
          {model.tasks.map((task, index) => (
            <li key={index} className="f2-solo-task">
              <div className="f2-solo-task__head">
                <span className="f2-solo-task__n">{String(index + 1).padStart(2, "0")}</span>
                <span>{task}</span>
              </div>
              <Textarea
                rows={5}
                aria-label={`Sua resposta à tarefa ${index + 1}`}
                placeholder={PLACEHOLDER}
                value={texts[index] ?? ""}
                maxLength={charLimit(texts, index)}
                onChange={(e) => onChange(index, e.target.value)}
              />
            </li>
          ))}
        </ol>
      )}
      {model.notes.map((note, index) => (
        <p key={index} className="f2-solo-muted" style={{ margin: "var(--space-3) 0 0" }}>
          {note}
        </p>
      ))}
      <p className="f2-solo-muted f2-solo-count" aria-live="off">
        {`${formatDecimal(total, 0)} de ${formatDecimal(MAX_TOTAL_CHARS, 0)} caracteres`}
      </p>
    </>
  );
}

export function SoloAttending({ api, attempt, mobile, busy, expired, onDeliver, onOpenPressing }) {
  const attemptId = attempt.attempt_id;
  const pressings = attempt.pressings || [];
  const model = React.useMemo(() => buildTaskModel(attempt.tasks, pressings), [attempt.tasks, attempt.pressings]);
  const initial = React.useMemo(() => textsFromAnswers(attempt.answers, model.count), []); // eslint-disable-line react-hooks/exhaustive-deps
  const auto = useAutosave(api, attemptId, initial);
  const [confirm, setConfirm] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [sending, setSending] = React.useState(false);

  const deliver = async () => {
    setSending(true);
    setError(null);
    try {
      await auto.settle();
      // o texto vai junto da entrega; daqui em diante não há mais o que salvar sozinho (nem ao sair da tela)
      const answers = answersFromTexts(auto.textsRef.current);
      auto.delivered();
      await onDeliver(answers);
    } catch (err) {
      auto.keepDirty();
      setError(messageOf(err, "Não foi possível entregar agora. Seu texto está salvo; tente de novo."));
      setConfirm(false);
    } finally {
      setSending(false);
    }
  };

  const initialPrints = pressings.filter((p) => p.initial);
  return (
    <>
      <main className="f2-player-content f2-solo-wide">
        {expired && (
          <Banner tone="warning" icon="timer">
            O tempo acabou. Você ainda pode concluir e entregar.
          </Banner>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="f2-solo-grid">
          <div className="f2-solo-col">
            <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
              <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>
                Enunciado
              </span>
              <div className="f2-solo-prose" style={{ font: "var(--type-body-lg)" }}>
                {splitBlocks(attempt.scene).length > 0
                  ? splitBlocks(attempt.scene).map((block, i) => (
                      <p key={i} style={{ margin: i === 0 ? 0 : "var(--space-2) 0 0", whiteSpace: "pre-wrap" }}>
                        {block}
                      </p>
                    ))
                  : "Nenhum cenário cadastrado para esta estação."}
              </div>
            </Card>

            {initialPrints.map((p) => (
              <InitialPrint key={p.id} api={api} attemptId={attemptId} pressing={p} />
            ))}

            <Card padding={mobile ? 20 : 24} style={{ borderRadius: "var(--radius-xl)" }}>
              <h2 className="f2-solo-h2">Tarefas</h2>
              {model.single && model.raw && <div className="f2-solo-prose f2-solo-prose--tight">{model.raw}</div>}
              <TaskBoxes model={model} texts={auto.texts} onChange={auto.change} />
            </Card>
          </div>

          <aside className="f2-solo-col" aria-label="Impressos">
            <PrintList api={api} attemptId={attemptId} pressings={pressings} onOpen={onOpenPressing} />
          </aside>
        </div>
      </main>

      <div className="f2-player-toolbar" role="toolbar" aria-label="Ações da estação">
        <span className="f2-solo-toolbar-note" role="status">
          {SAVE_NOTE[auto.state] || "Atendimento em andamento."}
        </span>
        <Button icon="send" disabled={busy || sending} onClick={() => setConfirm(true)} style={{ borderRadius: "var(--radius-pill)" }}>
          Entregar
        </Button>
      </div>

      <Dialog
        open={confirm}
        title="Entregar o atendimento?"
        description="Depois de entregar, você não poderá mais editar o texto. Em seguida você escolhe como corrigir."
        onClose={() => !sending && setConfirm(false)}
        actions={
          <>
            <Button variant="ghost" disabled={sending} onClick={() => setConfirm(false)}>
              Voltar
            </Button>
            <Button icon="send" loading={sending} onClick={deliver}>
              Sim, entregar
            </Button>
          </>
        }
      />
    </>
  );
}
