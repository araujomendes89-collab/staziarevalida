// Aceite do aviso antes da primeira avaliação por IA. Reaproveita o aceite do Tutor (decisão do dono de 12/10, D13): o cartão
// grava o aceite por `session.acceptTerms({ document: "tutor_ia", ... })` na versão vigente, que vem do servidor.
import React from "react";
import { Banner, Button, Dialog } from "../../../ds";
import { messageOf } from "../../admin/common.jsx";
import { useSession } from "../../session.jsx";
import { TutorConsentCard } from "../../tutor/TutorConsentCard.jsx";

export function IaConsentDialog({ onAccepted, onClose }) {
  const { backend } = useSession();
  const [version, setVersion] = React.useState(null);
  const [error, setError] = React.useState(null);

  const loadVersion = React.useCallback(async () => {
    try {
      const status = await backend.rpc("app_tutor_status");
      setVersion(status?.consent_version ?? null);
      setError(status?.consent_version ? null : new Error("Não foi possível carregar o aviso agora. Tente de novo."));
    } catch (err) {
      setError(err);
    }
  }, [backend]);

  React.useEffect(() => {
    void loadVersion();
  }, [loadVersion]);

  return (
    <Dialog
      title="Aviso sobre a inteligência artificial"
      description="Para usar a avaliação por IA, leia e aceite o aviso abaixo."
      onClose={onClose}
      actions={
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {error && (
        <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={loadVersion}>Tentar de novo</Button>}>
          {messageOf(error, "Não foi possível carregar o aviso agora. Tente de novo.")}
        </Banner>
      )}
      {version && <TutorConsentCard version={version} onAccepted={onAccepted} onOutdated={loadVersion} />}
    </Dialog>
  );
}
