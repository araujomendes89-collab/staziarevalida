// Prévia: cabeçalho do Início com a sequência ("0 dias") e o chip do saldo ao lado. ?situacao=sombra|creditos|equipe|esgotado · ?tema=escuro
import "../../src/novo/ds/styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../../src/novo/app/Shell.jsx";
import { Card } from "../../src/novo/ds";
import { SessionProvider } from "./sessaoSimulada.jsx";

const params = new URLSearchParams(window.location.search);
const tema = params.get("tema") === "escuro" ? "dark" : "light";
document.documentElement.dataset.theme = tema;

function Previa() {
  const [route, setRoute] = React.useState("home");
  return (
    <AppShell route={route} go={setRoute} phase={1} setPhase={() => {}} theme={tema} setTheme={() => {}} title="Boa tarde, João." sub="Sábado, 17 de outubro · faltam 120 dias" headerKind="inicio"
      info={{ name: "João", streakDays: 0, isStaff: false, flashcardsDue: 0 }}>
      <Card>
        <p style={{ margin: 0, color: "var(--text-secondary)" }}>{route === "home" ? "Prévia: o resto do Início não faz parte desta demonstração." : `Tocar no saldo abriria: ${route}`}</p>
      </Card>
    </AppShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <MemoryRouter>
    <SessionProvider>
      <Previa />
    </SessionProvider>
  </MemoryRouter>
);
