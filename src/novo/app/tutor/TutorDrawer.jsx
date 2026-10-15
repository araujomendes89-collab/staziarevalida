// Tutor em qualquer tela: o Nexus abre por cima da tela (que continua montada por baixo) com o contexto que ela já conhece (a
// questão, o erro, o tema, a área). O aluno não copia nem cola nada: quem abre passa o contexto; o modo vem travado e o aluno só
// escolhe o professor. Nenhuma conversa começa antes do "Começar".
import React from "react";
import { Button, Icon } from "../../ds";
import { NexusScreen } from "./nexus/NexusScreen.jsx";

const Dock = React.createContext(null);

/**
 * openTutor({ mode, questionId?, topic?, context?: { type, id?, label?, area? }, title? })
 *   mode: "questao" | "erros" | "perguntas" | "livre"
 */
export function TutorDockProvider({ children, go = null }) {
  const [request, setRequest] = React.useState(null);
  const open = React.useCallback((req) => setRequest({ ...req, key: Date.now() }), []);
  const close = React.useCallback(() => setRequest(null), []);
  return (
    <Dock.Provider value={open}>
      {children}
      {request && <NexusScreen key={request.key} go={go} overlay request={request} onClose={close} />}
    </Dock.Provider>
  );
}

export const useTutorDock = () => React.useContext(Dock);

/** Botão para abrir o Tutor com o contexto da tela. Fora do app (sem o provedor), não aparece. */
export function TutorButton({ request, label = "Discutir com o Tutor", size = "sm", variant = "secondary", icon = "sparkles", className }) {
  const open = useTutorDock();
  if (!open) return null;
  // variant "modelo": o botão roxo do painel da questão (modelo "Tela de Questão"; estilo em practice/tela/tela-questao.css)
  if (variant === "modelo")
    return (
      <button type="button" className="tq-tutor" onClick={() => open(request)}>
        <Icon name="sparkles" size={18} />
        {label}
      </button>
    );
  return (
    <Button size={size} variant={variant} icon={icon} className={className} onClick={() => open(request)}>
      {label}
    </Button>
  );
}
