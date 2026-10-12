// Portão do Tutor: as mesmas telas de antes para carregando, Tutor desligado, aceite do §34 (cartão) e plano (teste terminado ou
// só para planos pagos). Passou por tudo, mostra o conteúdo com o status do Tutor e um "refresh" para reler.
import React from "react";
import { Banner, Button, EmptyState } from "../../../ds";
import { useSession } from "../../session.jsx";
import { TutorConsentCard } from "../TutorConsentCard.jsx";
import { tutorAvailable } from "../api.js";
import { usePlanLock } from "../../plan/planAccess.js";
import { askForAccess, useSupportEmail } from "../../support/supportContact.jsx";

const messageOf = (error) => error?.message || "Não foi possível concluir. Tente de novo.";

/** frame: embrulha as telas do portão (carregando, desligado, aceite, plano); a Nexus por cima usa para pôr o "Fechar". */
export function TutorGate({ go, children, frame = (node) => node }) {
  const { backend } = useSession();
  const planLock = usePlanLock();
  const supportEmail = useSupportEmail();
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    const st = await backend.rpc("app_tutor_status");
    setStatus(st);
    return st;
  }, [backend]);

  React.useEffect(() => {
    let alive = true;
    refresh().then(
      () => alive && setLoading(false),
      (e) => alive && (setError(messageOf(e)), setLoading(false))
    );
    return () => {
      alive = false;
    };
  }, [refresh]);

  if (loading) return frame(<p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>);
  if (!status) return frame(<Banner tone="danger">{error ?? "Não foi possível carregar o Tutor."}</Banner>);
  if (!status.enabled) {
    return frame(<EmptyState icon="sparkles" title="O Tutor ainda não está ligado" description="O professor de IA entra no ar quando a equipe StaziaMed ligar. Enquanto isso, as questões, o caderno de erros e a revisão seguem funcionando." />);
  }
  if (status.consent_required) {
    return frame(<TutorConsentCard version={status.consent_version} onAccepted={() => refresh().catch(() => {})} onOutdated={() => refresh()} />);
  }
  if (!status.available) {
    const expired = status.entitlement?.block_reason === "trial_expired";
    // conta sem plano pago e sem teste grátis valendo (PL02): diz o que fica aberto; ainda não há tela de assinatura
    if (status.entitlement?.plan_locked) {
      return frame(
        <EmptyState
          icon="lock"
          title={planLock?.title ?? "O Tutor faz parte dos planos pagos"}
          description={`O Tutor faz parte dos planos pagos; as questões e os flashcards continuam abertos. ${askForAccess(supportEmail)}`}
        />
      );
    }
    return frame(
      <EmptyState
        icon="lock"
        title={expired ? "Seu teste grátis do Tutor terminou" : "O Tutor faz parte dos planos pagos"}
        description={`Com um plano ativo você conversa com o professor por texto ou por voz, com as suas questões, os seus erros e os seus temas. ${askForAccess(supportEmail)}`}
        action={<Button iconRight="arrow-right" onClick={() => go?.("perfil")}>Ver meu plano</Button>}
      />
    );
  }
  if (!tutorAvailable(backend)) return frame(<Banner tone="warning" title="Servidor necessário">O Tutor responde pelo servidor. Entre de novo na sua conta.</Banner>);
  return children(status, refresh);
}
