// Prévia do nivelamento com dados simulados (nada é gravado).
// Parâmetros: ?estado=parcial|concluido · ?modo=rota (dentro da casca do app, como /nivelamento) · ?tela=convite (cartão no Início,
// dentro da casca) · ?tela=simulador · ?tema=escuro. Sem ?modo=rota: a primeira tela do aluno novo (antes de entrar no app).
import "../../src/novo/ds/styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../../src/novo/app/Shell.jsx";
import { Nivelamento } from "../../src/novo/app/nivelamento/Nivelamento.jsx";
import { NivelamentoConvite } from "../../src/novo/app/nivelamento/NivelamentoConvite.jsx";
import { Simulador } from "../../src/novo/app/nivelamento/Simulador.jsx";
import { SessionProvider, useSession } from "./sessaoSimulada.jsx";

const params = new URLSearchParams(window.location.search);
const TITULOS = {
  nivelamento: ["Diagnóstico de nivelamento", "Evolução · o seu nível e por onde começar"],
  home: ["Bom dia, Aluno", "Prévia do cartão no Início"],
};

function NaCasca() {
  const session = useSession();
  const [route, setRoute] = React.useState(params.get("tela") === "convite" ? "home" : "nivelamento");
  const [etapa, setEtapa] = React.useState(null);
  const tema = params.get("tema") === "escuro" ? "dark" : "light";
  const go = (next, query) => {
    setRoute(next);
    setEtapa(query?.etapa ?? null);
    window.scrollTo(0, 0);
  };
  // como no App.jsx: as questões abrem em tela cheia (sem a casca), o resto dentro dela
  if (route === "nivelamento" && etapa === "questoes") return <Nivelamento key="questoes" modo="rota" go={go} />;
  const [title, sub] = TITULOS[route] ?? TITULOS.nivelamento;
  return (
    <AppShell route={route} go={go} phase={1} setPhase={() => {}} theme={tema} setTheme={() => {}} title={title} sub={sub} info={{ name: "Aluno de prévia", isStaff: false, flashcardsDue: 0 }}>
      {route === "home" ? (
        session.boot?.nivelamento ? <NivelamentoConvite estado={session.boot.nivelamento} go={go} /> : null
      ) : route === "nivelamento" ? (
        <Nivelamento key="rota" modo="rota" go={go} />
      ) : (
        <p style={{ padding: 24 }}>Prévia: esta tela não faz parte da demonstração. Volte para o nivelamento.</p>
      )}
    </AppShell>
  );
}

function AppContent() {
  if (params.get("tela") === "simulador") return <Simulador />;
  if (params.get("modo") === "rota" || params.get("tela") === "convite") return <NaCasca />;
  return <Nivelamento modo="primeira" go={() => {}} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <MemoryRouter>
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  </MemoryRouter>
);
