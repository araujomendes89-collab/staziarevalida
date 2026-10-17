// Treino sozinho (2ª fase): orquestrador. Quem manda na fase é o servidor (`status`):
//   reading -> attending -> submitted -> (autoavaliação) scoring -> done
//                                     -> (IA) evaluating -> done   (se a IA falhar, volta a submitted)
// Cada fase é uma tela pequena em ./solo; aqui ficam só as chamadas ao servidor, o cronômetro e as janelas de sair e de escolha.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Banner, Button, Dialog } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { Loading, LoadError, messageOf } from "../admin/common.jsx";
import { useHeartbeat } from "../dupla/live.js";
import { installAudioWake } from "../dupla/sound.js";
import { fase2Api } from "./api.js";
import { IaConsentDialog } from "./solo/IaConsentDialog.jsx";
import { SoloAttending } from "./solo/SoloAttending.jsx";
import { SoloChoose, SoloDelivered } from "./solo/SoloChoose.jsx";
import { SoloHeader } from "./solo/SoloHeader.jsx";
import { SoloReading } from "./solo/SoloReading.jsx";
import { SoloResult } from "./solo/SoloResult.jsx";
import { SoloSelfGrade } from "./solo/SoloSelfGrade.jsx";
import { SoloWaiting } from "./solo/SoloWaiting.jsx";
import { useAttempt } from "./solo/useAttempt.js";
import { useCountdown } from "./solo/useCountdown.js";
import "./fase2.css";
import "./solo/solo.css";

/** Sinal de que a pessoa está treinando (o servidor mostra "treinando sozinho"); a falha do sinal nunca quebra a tela. */
function SoloPresence() {
  useHeartbeat("sozinho");
  return null;
}

const IN_TRAINING = ["attending", "submitted", "evaluating", "scoring"];

export function Fase2Player({ go }) {
  const [searchParams] = useSearchParams();
  const stationId = searchParams.get("id");
  const attemptIdParam = searchParams.get("tentativa");

  const { backend } = useSession();
  const mobile = useMobile();
  const api = React.useMemo(() => fase2Api(backend), [backend]);

  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState(null);
  const [waiting, setWaiting] = React.useState(false); // a IA foi pedida nesta tela e ainda não respondeu
  const [evalError, setEvalError] = React.useState(null);
  const [chooser, setChooser] = React.useState(null); // null | "choose" | "consent"
  const [exitOpen, setExitOpen] = React.useState(false);

  const { attempt, loading, error, offsetMs, run, reload, setAttempt } = useAttempt(api, { stationId, attemptId: attemptIdParam }, waiting);
  const { remaining, expired } = useCountdown(attempt, offsetMs);
  const status = attempt?.status;
  const attemptId = attempt?.attempt_id;

  React.useEffect(() => {
    installAudioWake();
  }, []);

  // Outro treino na mesma tela: recomeça os avisos e as janelas.
  React.useEffect(() => {
    setActionError(null);
    setEvalError(null);
    setWaiting(false);
    setExitOpen(false);
  }, [attemptId]);

  // Entregou: a janela "Como você quer corrigir?" abre sozinha (e também ao recarregar a página já entregue).
  React.useEffect(() => {
    setChooser(status === "submitted" ? "choose" : null);
  }, [status, attemptId]);

  // Roda uma ação que muda a fase; o erro vira aviso em português e a tela continua onde estava.
  const act = async (call, fallback) => {
    if (busy) return null;
    setBusy(true);
    setActionError(null);
    try {
      return await run(call);
    } catch (err) {
      setActionError(messageOf(err, fallback));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const begin = () => act(() => api.begin(attemptId), "Não foi possível iniciar o atendimento. Tente de novo.");
  const finishSelf = () => act(() => api.finish(attemptId), "Não foi possível abrir o PEP. Tente de novo.");
  const submitMarks = (marks) => act(() => api.submit(attemptId, marks), "Não foi possível salvar a nota. Tente de novo.");

  // Entrega: o erro sobe para a tela do atendimento, que mantém o texto e avisa.
  const deliver = (answers) => run(() => api.deliver(attemptId, answers));

  // Impresso pedido: o texto chega do servidor e fica na lista; a hora é registrada lá.
  const openPressing = async (pressingId) => {
    const opened = await api.openPressing(attemptId, pressingId);
    setAttempt((current) =>
      current && opened
        ? {
            ...current,
            pressings: (current.pressings || []).map((p) =>
              p.id === opened.id ? { ...p, opened: true, content: opened.content ?? p.content, has_image: opened.has_image ?? p.has_image } : p
            ),
          }
        : current
    );
  };

  // Avaliar com IA: a rota confere tudo e pode demorar; enquanto isso a tela espera ("Avaliando…") e consulta o servidor.
  const evaluate = async () => {
    setChooser(null);
    setEvalError(null);
    setActionError(null);
    setWaiting(true);
    let next = "submitted";
    try {
      await api.evaluate(attemptId);
    } catch (err) {
      setEvalError(messageOf(err, "Não foi possível avaliar agora. Tente de novo."));
    }
    try {
      const payload = await run(() => api.attempt(attemptId));
      next = payload?.status ?? next;
    } catch {
      // o próximo ciclo da consulta refaz
    }
    setWaiting(false);
    if (next === "submitted") setChooser("choose");
  };

  // Aceite gravado: relê a tentativa (a IA passa a valer) e volta à escolha.
  const consentDone = async () => {
    try {
      await run(() => api.attempt(attemptId));
    } catch {
      // a janela volta e a tela segue com o que tinha
    }
    setChooser("choose");
  };

  // Sair: na leitura, no resultado e durante a avaliação sai direto; nas demais fases pergunta se descarta o treino.
  const exit = () => {
    if (!attempt || status === "reading" || status === "done" || status === "evaluating" || waiting) {
      go("estacoes");
      return;
    }
    setExitOpen(true);
  };
  const discard = async () => {
    setBusy(true);
    try {
      await api.abandon(attemptId);
    } catch {
      // sair não pode ficar preso a um erro do descarte
    } finally {
      setBusy(false);
      go("estacoes");
    }
  };

  if (loading) {
    return (
      <div className="f2-player f2-solo-center">
        <Loading />
      </div>
    );
  }

  if (error && !attempt) {
    return (
      <div className="f2-player f2-solo-center">
        <div style={{ maxWidth: 600, width: "100%", display: "grid", gap: "var(--space-4)" }}>
          <LoadError error={error} retry={reload} />
          <div style={{ textAlign: "center" }}>
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
      <div className="f2-player f2-solo-center">
        <p style={{ color: "var(--text-secondary)" }}>Nenhuma tentativa encontrada.</p>
        <Button variant="secondary" onClick={() => go("estacoes")}>
          Voltar ao banco de estações
        </Button>
      </div>
    );
  }

  const showWaiting = (waiting && status !== "done") || status === "evaluating";
  const failure = evalError ?? attempt.ia_message ?? null;

  return (
    <div className="f2-player">
      {IN_TRAINING.includes(status) && <SoloPresence />}
      <SoloHeader attempt={attempt} remaining={remaining} expired={expired} mobile={mobile} busy={busy} onExit={exit} />

      {actionError && (
        <div className="f2-solo-alert">
          <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={() => setActionError(null)}>Fechar</Button>}>
            {actionError}
          </Banner>
        </div>
      )}

      {status === "reading" && <SoloReading attempt={attempt} mobile={mobile} busy={busy} onBegin={begin} />}

      {status === "attending" && (
        <SoloAttending
          key={attemptId}
          api={api}
          attempt={attempt}
          mobile={mobile}
          busy={busy}
          expired={expired}
          onDeliver={deliver}
          onOpenPressing={openPressing}
        />
      )}

      {status === "submitted" && !showWaiting && <SoloDelivered attempt={attempt} mobile={mobile} onChoose={() => setChooser("choose")} />}
      {showWaiting && <SoloWaiting mobile={mobile} />}

      {status === "scoring" && <SoloSelfGrade key={attemptId} checklist={attempt.checklist || []} mobile={mobile} busy={busy} onSubmit={submitMarks} />}

      {status === "done" && <SoloResult attempt={attempt} go={go} onReport={(order, note) => api.reportIa(attemptId, order, note)} />}

      {status === "submitted" && !showWaiting && chooser === "choose" && (
        <SoloChoose
          ia={attempt.ia}
          failure={failure}
          busy={busy}
          onIa={evaluate}
          onSelf={() => {
            setChooser(null);
            finishSelf();
          }}
          onConsent={() => setChooser("consent")}
          onClose={() => setChooser(null)}
        />
      )}
      {status === "submitted" && chooser === "consent" && <IaConsentDialog onAccepted={consentDone} onClose={() => setChooser("choose")} />}

      <Dialog
        open={exitOpen}
        title="Descartar este treino?"
        description="Seu progresso nesta tentativa será cancelado."
        onClose={() => !busy && setExitOpen(false)}
        actions={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setExitOpen(false)}>
              Continuar treinando
            </Button>
            <Button variant="danger" loading={busy} onClick={discard}>
              Descartar
            </Button>
          </>
        }
      />
    </div>
  );
}
