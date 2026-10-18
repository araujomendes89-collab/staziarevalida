// PRÉVIA da tela de questão (porta 31942): dados simulados, sem login e sem banco.
//   /?modo=treino|simulado  &q=inedita|oficial|tabela|quadro|anulada  &estado=respondendo|certo|errado  &tema=escuro  &total=20
// Sem parâmetros: treino com a Questão Inédita do modelo, ainda sem responder.
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../../src/novo/ds/styles.css";
import { PracticeSession } from "../../src/novo/app/practice/PracticeSession.jsx";
import { TutorDockProvider } from "../../src/novo/app/tutor/TutorDrawer.jsx";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("tema") === "escuro" ? "dark" : "light";
// servidor do Tutor simulado: a dica fica liberada na prévia (no servidor de verdade ela nasce desligada)
const realFetch = window.fetch.bind(window);
window.fetch = (url, init) => {
  const u = String(url);
  if (u.endsWith("/api/tutor/status")) return Promise.resolve(new Response(JSON.stringify({ ready: true, question_hint: true }), { status: 200 }));
  if (u.endsWith("/api/tutor/question-hint"))
    return new Promise((r) => setTimeout(() => r(new Response(JSON.stringify({ hint: "Releia a última frase do enunciado e diga com suas palavras o que ela pede. Depois, pense em qual dado do caso muda a conduta (dica de exemplo da prévia).", source: "ia" }), { status: 200 })), 600));
  return realFetch(url, init);
};
const go = (route) => console.info("[prévia] navegação:", route);

createRoot(document.getElementById("root")).render(
  <MemoryRouter initialEntries={["/sessao?s=s-previa"]}>
    <TutorDockProvider go={go}>
      <PracticeSession go={go} />
    </TutorDockProvider>
  </MemoryRouter>
);
