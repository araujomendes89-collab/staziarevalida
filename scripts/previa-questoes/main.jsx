// PRÉVIA da tela de questão (porta 31942): dados simulados, sem login e sem banco.
//   /?modo=treino|simulado  &q=inedita|oficial|tabela|anulada  &estado=respondendo|certo|errado  &tema=escuro  &total=20
// Sem parâmetros: treino com a Questão Inédita do modelo, ainda sem responder.
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../../src/novo/ds/styles.css";
import { PracticeSession } from "../../src/novo/app/practice/PracticeSession.jsx";
import { TutorDockProvider } from "../../src/novo/app/tutor/TutorDrawer.jsx";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("tema") === "escuro" ? "dark" : "light";
const go = (route) => console.info("[prévia] navegação:", route);

createRoot(document.getElementById("root")).render(
  <MemoryRouter initialEntries={["/sessao?s=s-previa"]}>
    <TutorDockProvider go={go}>
      <PracticeSession go={go} />
    </TutorDockProvider>
  </MemoryRouter>
);
