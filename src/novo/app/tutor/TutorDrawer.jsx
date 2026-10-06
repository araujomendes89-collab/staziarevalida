// Tutor em qualquer tela: um painel lateral que abre com o contexto que a tela já conhece (a questão, o erro, o tema, a área).
// O aluno não copia nem cola nada: quem abre passa o contexto, e o painel cria a sessão de estudo com ele.
import React from "react";
import { Banner, Button, IconButton } from "../../ds";
import { useSession } from "../session.jsx";
import { tutorAvailable, tutorServerStatus } from "./api.js";
import { Chat } from "./TutorScreen.jsx";

const Dock = React.createContext(null);

/**
 * openTutor({ mode, questionId?, topic?, context?: { type, id?, label?, area? }, title? })
 *   mode: "questao" | "erros" | "perguntas" | "livre"
 */
export function TutorDockProvider({ children }) {
  const [request, setRequest] = React.useState(null);
  const open = React.useCallback((req) => setRequest({ ...req, key: Date.now() }), []);
  return (
    <Dock.Provider value={open}>
      {children}
      {request && <TutorDrawer key={request.key} request={request} onClose={() => setRequest(null)} />}
    </Dock.Provider>
  );
}

export const useTutorDock = () => React.useContext(Dock);

/** Botão para abrir o Tutor com o contexto da tela. Fora do app (sem o provedor), não aparece. */
export function TutorButton({ request, label = "Discutir com o Tutor", size = "sm", variant = "secondary" }) {
  const open = useTutorDock();
  if (!open) return null;
  return (
    <Button size={size} variant={variant} icon="sparkles" onClick={() => open(request)}>
      {label}
    </Button>
  );
}

const messageOf = (e) => e?.message || "Não foi possível abrir o Tutor agora.";

function TutorDrawer({ request, onClose }) {
  const { backend } = useSession();
  const [status, setStatus] = React.useState(null);
  const [session, setSession] = React.useState(null);
  const [server, setServer] = React.useState({ realtime: false, neural: false });
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const st = await backend.rpc("app_tutor_status");
        if (!alive) return;
        setStatus(st);
        if (!st.enabled || !st.available) return;
        const s = await backend.rpc("app_tutor_start", {
          p_mode: request.mode, p_topic: request.topic ?? null, p_question_id: request.questionId ?? null, p_context: request.context ?? null,
        });
        if (alive) setSession(s);
        if (tutorAvailable(backend)) {
          tutorServerStatus(backend).then((x) => alive && setServer({ realtime: Boolean(x?.realtime_voice), neural: Boolean(x?.neural_voice) }), () => {});
        }
      } catch (e) {
        if (alive) setError(messageOf(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [backend, request]);

  React.useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  let body;
  if (error) body = <Banner tone="danger">{error}</Banner>;
  else if (!status) body = <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Abrindo o Tutor…</p>;
  else if (!status.enabled) body = <Banner tone="info" title="O Tutor ainda não está ligado">Ele entra no ar quando a equipe StaziaMed ligar.</Banner>;
  else if (!status.available)
    body = (
      <Banner tone="warning" title={status.entitlement?.block_reason === "trial_expired" ? "Seu teste grátis do Tutor terminou" : "O Tutor faz parte dos planos pagos"}>
        Com um plano ativo você conversa com o professor por texto ou por voz.
      </Banner>
    );
  else if (!session) body = <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Preparando a sessão…</p>;
  else
    body = (
      <Chat
        session={session}
        setSession={setSession}
        status={status}
        neural={server.neural}
        realtime={server.realtime}
        onUsage={(used) => setStatus((s) => ({ ...s, used_today: used }))}
        mobile
        compact
      />
    );

  return (
    <div role="dialog" aria-modal="true" aria-label="Stazia Tutor" style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "var(--overlay, rgba(15,23,42,.35))" }} aria-hidden="true" />
      <div style={{ position: "relative", width: "min(480px, 100vw)", height: "100%", background: "var(--surface-page, var(--surface-card))", boxShadow: "var(--shadow-lg, 0 10px 40px rgba(0,0,0,.25))", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "600 16px var(--font-sans)" }}>Stazia Tutor</div>
            <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session?.title ?? request.title ?? "Seu professor particular para o Revalida."}</div>
          </div>
          <IconButton icon="x" label="Fechar o Tutor" variant="ghost" onClick={onClose} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>{body}</div>
      </div>
    </div>
  );
}
