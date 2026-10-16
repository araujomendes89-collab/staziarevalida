import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../../../src/novo/ds/styles.css";
import { QuestionBuilder } from "../../../src/novo/app/practice/QuestionBuilder.jsx";
import { HomeScreen } from "../../../src/novo/app/home/HomeScreen.jsx";
import { TodayPlan } from "../../../src/novo/app/home/TodayPlan.jsx";
import { PracticeSession } from "../../../src/novo/app/practice/PracticeSession.jsx";
import { useMobile } from "./mock-shell.jsx";
import { preview } from "./mock-session.jsx";

const PERFIS = [["teste", "Teste grátis (20 liberadas)"], ["pago_limite", "Pago com limite (40 liberadas)"], ["pro", "Pago com todas"], ["vencido", "Sem acesso (teste vencido)"], ["sem_inedita", "Nenhuma inédita publicada"]];
const TELAS = [["banco", "Banco de Questões"], ["inicio", "Início (diagnóstico feito)"], ["inicio-novo", "Início (aluno novo)"], ["hoje", "Plano de Hoje"], ["resolucao", "Resolução (selo)"], ["correcao", "Correção (selo)"]];

function Harness() {
  const params = new URLSearchParams(location.search);
  const [tela, setTela] = React.useState(params.get("tela") || "banco");
  const [perfil, setPerfil] = React.useState(params.get("perfil") || "teste");
  const [tema, setTema] = React.useState(params.get("tema") || "light");
  const [log, setLog] = React.useState("");
  const mobile = useMobile();
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    document.body.style.background = "var(--bg-app)";
    document.body.style.color = "var(--text-primary)";
  }, [tema]);
  Object.assign(preview.get(), { profile: perfil, novo: tela === "inicio-novo", answered: tela === "correcao" }); // antes de montar a tela (sem avisar ninguém)
  const go = (rota, q) => setLog(`go("${rota}"${q ? ", " + JSON.stringify(q) : ""})`);
  const sel = { padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-card)", color: "var(--text-primary)", font: "var(--type-body-sm)" };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--border-default)", background: "var(--surface-card)", alignItems: "center" }}>
        <b style={{ font: "var(--type-body-sm)" }}>Prévia (dados simulados)</b>
        <select aria-label="Tela" style={sel} value={tela} onChange={(e) => setTela(e.target.value)}>{TELAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="Perfil" style={sel} value={perfil} onChange={(e) => setPerfil(e.target.value)}>{PERFIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="Tema" style={sel} value={tema} onChange={(e) => setTema(e.target.value)}><option value="light">Tema claro</option><option value="dark">Tema escuro</option></select>
        {log && <span style={{ font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>{log}</span>}
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }} key={tela + perfil}>
        <MemoryRouter initialEntries={[tela === "resolucao" || tela === "correcao" ? "/?s=s1" : "/"]}>
          {tela === "banco" && <QuestionBuilder go={go} mode="q" />}
          {(tela === "inicio" || tela === "inicio-novo") && <HomeScreen go={go} mobile={mobile} />}
          {tela === "hoje" && <TodayPlan go={go} />}
          {(tela === "resolucao" || tela === "correcao") && <PracticeSession go={go} />}
        </MemoryRouter>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<Harness />);
