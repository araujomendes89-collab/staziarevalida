// PRÉVIA do Banco de Questões e dos Simulados (porta 31977): dados simulados, sem login e sem banco.
//   /montagem.html?modo=treino|simulado  &tema=escuro
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../../src/novo/ds/styles.css";
import { AppShell } from "../../src/novo/app/Shell.jsx";
import { QuestionBuilder } from "../../src/novo/app/practice/QuestionBuilder.jsx";

const params = new URLSearchParams(location.search);
const sim = params.get("modo") === "simulado";
function Previa() {
  const [theme, setTheme] = React.useState(params.get("tema") === "escuro" ? "dark" : "light");
  React.useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const go = (route) => console.info("[prévia] navegação:", route);
  return (
    <AppShell route={sim ? "simulados" : "questoes"} title={sim ? "Simulados" : "Banco de Questões"} sub={sim ? "Condições de prova" : "Monte seu treino"} go={go} phase={1} setPhase={() => {}} theme={theme} setTheme={setTheme} info={{ name: "Aluno de prévia", isStaff: false, flashcardsDue: 3 }}>
      <QuestionBuilder go={go} mode={sim ? "sim" : "q"} />
    </AppShell>
  );
}
createRoot(document.getElementById("root")).render(<MemoryRouter><Previa /></MemoryRouter>);
