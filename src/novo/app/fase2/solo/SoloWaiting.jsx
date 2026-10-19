// Avaliação por IA em andamento. Sem contador falso: a tela só espera o servidor. Recarregar a página volta aqui enquanto o
// treino estiver em avaliação (a consulta é refeita de tempos em tempos pelo useAttempt).
import React from "react";
import { Card } from "../../../ds";

export function SoloWaiting({ mobile }) {
  return (
    <main className="f2-player-content">
      <Card padding={mobile ? 24 : 40} style={{ borderRadius: "var(--radius-2xl)", textAlign: "center" }}>
        <div role="status" aria-live="polite" className="f2-solo-waiting">
          <span className="sm-spin f2-solo-waiting__spin" aria-hidden="true" />
          <h2 className="f2-solo-h2">Avaliando…</h2>
          <p className="f2-solo-muted" style={{ margin: 0, maxWidth: 420 }}>
            A inteligência artificial está comparando o seu texto com o PEP da estação. Pode levar um pouco; se você recarregar a
            página, voltamos para esta tela.
          </p>
        </div>
      </Card>
    </main>
  );
}
