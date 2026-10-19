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
  // o elemento que tinha o foco ao abrir (o botão "Discutir/Conversar com o Tutor"): ao fechar a camada (Fechar, Esc, "Voltar para a
  // questão"), o foco volta para ele; se ele sumiu, vai para o título da questão (teclado e leitor de tela não perdem o lugar)
  const volta = React.useRef(null);
  const open = React.useCallback((req) => {
    volta.current = document.activeElement;
    setRequest({ ...req, key: Date.now() });
  }, []);
  const close = React.useCallback(() => setRequest(null), []);
  // depois que a camada saiu da tela (e a tela de voz devolveu o que era dela)
  React.useEffect(() => {
    if (request || !volta.current) return;
    const antes = volta.current;
    volta.current = null;
    devolverFoco(antes);
  }, [request]);
  return (
    <Dock.Provider value={open}>
      {children}
      {request && <NexusScreen key={request.key} go={go} overlay request={request} onClose={close} />}
    </Dock.Provider>
  );
}

/** Foco de volta para quem abriu o Tutor; se ele saiu da tela, para o título da questão (ou o primeiro título da tela). */
function devolverFoco(antes) {
  if (typeof document === "undefined") return;
  if (antes && antes.isConnected && antes !== document.body && antes !== document.documentElement && typeof antes.focus === "function") {
    antes.focus();
    if (document.activeElement === antes) return;
  }
  const titulo = document.querySelector("main h1") ?? document.querySelector("h1");
  if (!titulo) return;
  if (!titulo.hasAttribute("tabindex")) titulo.setAttribute("tabindex", "-1");
  titulo.focus({ preventScroll: true });
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
  // variant "roxo": botão largo roxo das telas novas (Desempenho: "Me teste nos pontos fracos"; estilo em review/desempenho.css)
  if (variant === "roxo")
    return (
      <button type="button" className="ev-ia" onClick={() => open(request)}>
        <Icon name="sparkles" size={20} />
        {label}
      </button>
    );
  return (
    <Button size={size} variant={variant} icon={icon} className={className} onClick={() => open(request)}>
      {label}
    </Button>
  );
}
