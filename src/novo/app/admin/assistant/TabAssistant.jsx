// Liga o painel do assistente a uma aba: lê a situação das IAs, manda o formulário atual ao servidor e entrega o "Usar" à aba.
// Nada é salvo aqui; quem salva é o formulário da aba.
import React from "react";
import { Banner } from "../../../ds";
import { useSession } from "../../session.jsx";
import { AssistantPanel } from "./AssistantPanel.jsx";
import { assistantAvailable, assistantErrorText, fetchAssistantStatus, postAssistantRun } from "./assistantApi.js";
import { ASSIST_ERRORS } from "../../../../shared/adminAssistant/errors";

export function TabAssistant({ spec, title, notice, form, materialLink, onUse, onClose }) {
  const { backend } = useSession();
  const available = assistantAvailable(backend);
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    if (!available) return undefined;
    let alive = true;
    fetchAssistantStatus(backend, spec.tab).then(
      (s) => alive && setStatus(s),
      (e) => alive && setError(assistantErrorText(e, ASSIST_ERRORS.status)),
    );
    return () => {
      alive = false;
    };
  }, [backend, spec.tab, available]);

  if (!available) return <Banner tone="warning">O assistente precisa do servidor (não funciona no banco local do navegador).</Banner>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && <Banner tone="danger">{error}</Banner>}
      <AssistantPanel
        title={title}
        notice={notice}
        fields={spec.fields}
        values={spec.values(form)}
        material={spec.material}
        materialLink={materialLink}
        status={status?.modes ?? null}
        run={(mode, req) => postAssistantRun(backend, { tab: spec.tab, mode, form, ...req })}
        onUse={onUse}
        onClose={onClose}
      />
    </div>
  );
}
