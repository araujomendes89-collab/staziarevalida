// PRÉVIA da casca nova (ondas 0 e 1). Dados de TESTE, sem banco. Parâmetros:
//   ?tema=escuro  &papel=aluno|equipe|revisor  &fase=1|2  &rota=home|questoes|...
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/novo/ds/styles.css";
import { AppShell } from "../../src/novo/app/Shell.jsx";
import { Banner, Card, Badge, Button, ProgressBar } from "../../src/novo/ds";

const q = new URLSearchParams(location.search);
const papel = q.get("papel") || "aluno";

function Previa() {
  const [route, setRoute] = React.useState(q.get("rota") || "home");
  const [theme, setTheme] = React.useState(q.get("tema") === "escuro" ? "dark" : "light");
  const [phase, setPhase] = React.useState(Number(q.get("fase")) === 2 ? 2 : 1);
  React.useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const info = { name: "Aluno de Teste", streakDays: 0, flashcardsDue: 5, onSignOut: () => alert("Sair (prévia)"), isStaff: papel === "equipe", isReviewer: papel === "revisor", radarGraves: 0 };
  return (
    <AppShell route={route} go={setRoute} theme={theme} setTheme={setTheme} phase={phase} setPhase={setPhase} phase2Locked={papel === "aluno"} info={info} title={route === "home" ? "Boa tarde, Aluno de Teste." : `Tela: ${route}`} sub="Quinta, 15 de outubro">
      <Banner tone="warning">PRÉVIA com dados de teste. O conteúdo de cada tela (rota "{route}") entra nas próximas ondas; aqui só a casca nova.</Banner>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
        <Card><h3 style={{ margin: 0 }}>Plano de hoje</h3><p style={{ color: "var(--text-secondary)" }}>Exemplo de teste · 0 de 2</p><ProgressBar value={0} /><Button>Começar</Button></Card>
        <Card><h3 style={{ margin: 0 }}>Texto de apoio</h3><p style={{ color: "var(--text-tertiary)" }}>Cinza terciário com contraste corrigido (5,3:1).</p><Badge>exemplo</Badge></Card>
      </div>
    </AppShell>
  );
}
createRoot(document.getElementById("root")).render(<Previa />);
