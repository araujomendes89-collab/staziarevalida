// Etapa 3: depois de entregar. Janela "Como você quer corrigir?" com dois caminhos: avaliar com IA (desligado, com o motivo que
// o servidor manda, quando não está disponível) ou "Eu mesmo avalio com o PEP". Falha anterior da IA aparece com
// "Tentar de novo" e "Corrigir eu mesmo". O aluno não vê empresa, modelo, prompt nem custo: só o que o servidor diz em `ia`.
import React from "react";
import { Accordion, Banner, Button, Card, Dialog, Icon } from "../../../ds";
import { buildTaskModel } from "./tasks.js";

function Option({ icon, title, note, extra, action }) {
  return (
    <div className="f2-solo-option">
      <Icon name={icon} size={22} />
      <div className="f2-solo-option__text">
        <div className="f2-solo-option__title">{title}</div>
        {note && <div className="f2-solo-muted">{note}</div>}
        {extra}
      </div>
      {action}
    </div>
  );
}

/** Janela da escolha. `failure` é a mensagem da falha anterior (do servidor ou da rota) ou null. */
export function SoloChoose({ ia, failure, busy, onIa, onSelf, onConsent, onClose }) {
  const available = ia?.available === true;
  const retry = Boolean(failure);
  const reason = !available ? ia?.reason || "A avaliação por IA está indisponível agora." : null;
  return (
    <Dialog
      title="Como você quer corrigir?"
      description="Seu atendimento foi entregue. Escolha como a correção será feita."
      onClose={onClose}
      actions={
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="f2-solo-options">
        {failure && <Banner tone="warning">{failure}</Banner>}
        <Option
          icon="sparkles"
          title="Inteligência artificial"
          note="Compara o seu texto com o PEP da estação e mostra o trecho e a razão de cada item."
          extra={
            reason && (
              <div id="f2-solo-ia-reason" className="f2-solo-reason">
                <Icon name="lock" size={14} />
                <span>{reason}</span>
                {ia?.consent_required && (
                  <Button size="sm" variant="secondary" onClick={onConsent}>
                    Ler e aceitar o aviso
                  </Button>
                )}
              </div>
            )
          }
          action={
            <Button disabled={!available || busy} onClick={onIa} aria-describedby={reason ? "f2-solo-ia-reason" : undefined}>
              {retry ? "Tentar de novo" : "Avaliar com IA"}
            </Button>
          }
        />
        <Option
          icon="clipboard-list"
          title="Autoavaliação"
          note="Você marca cada item do PEP e vê a nota."
          action={
            <Button variant="secondary" disabled={busy} onClick={onSelf}>
              {retry ? "Corrigir eu mesmo" : "Eu mesmo avalio com o PEP"}
            </Button>
          }
        />
      </div>
    </Dialog>
  );
}

/** Página atrás da janela: o que foi entregue (só leitura) e o botão para reabrir a escolha. */
export function SoloDelivered({ attempt, mobile, onChoose }) {
  const model = React.useMemo(() => buildTaskModel(attempt.tasks, attempt.pressings), [attempt.tasks, attempt.pressings]);
  const byTask = new Map((attempt.answers || []).map((a) => [Number(a.task), a.text]));
  const boxes = model.single ? [["", byTask.get(1) ?? ""]] : model.tasks.map((task, i) => [task, byTask.get(i + 1) ?? ""]);
  return (
    <main className="f2-player-content">
      <Card padding={mobile ? 20 : 28} style={{ borderRadius: "var(--radius-xl)" }}>
        <div className="f2-solo-done-head">
          <Icon name="circle-check" size={28} />
          <div>
            <h2 className="f2-solo-h2">Atendimento entregue</h2>
            <p className="f2-solo-muted" style={{ margin: 0 }}>
              Falta escolher como corrigir.
            </p>
          </div>
        </div>
        <div style={{ marginTop: "var(--space-4)" }}>
          <Button icon="arrow-right" onClick={onChoose}>
            Escolher como corrigir
          </Button>
        </div>
      </Card>
      <Accordion icon="file-text" title="Seu texto entregue">
        {boxes.map(([task, text], i) => (
          <div key={i} className="f2-solo-delivered">
            {task && <div className="f2-solo-delivered__task">{task}</div>}
            <div className="f2-solo-prose f2-solo-prose--tight">{text.trim() ? text : "Sem texto nesta tarefa."}</div>
          </div>
        ))}
      </Accordion>
    </main>
  );
}
