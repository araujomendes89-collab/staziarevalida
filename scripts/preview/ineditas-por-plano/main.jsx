import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../../../src/novo/ds/styles.css";
import { QuestionBuilder } from "../../../src/novo/app/practice/QuestionBuilder.jsx";
import { AdminPlans } from "../../../src/novo/app/admin/AdminPanels.jsx";
import { preview } from "./mock-session.jsx";

const PERFIS = [["teste", "Aluno em teste de 7 dias (20 liberadas)"], ["pro", "Aluno Pro (todas)"], ["vencido", "Teste vencido (nenhuma)"]];

function Harness() {
  const params = new URLSearchParams(location.search);
  const [tela, setTela] = React.useState(params.get("tela") || "aluno");
  const [perfil, setPerfil] = React.useState(params.get("perfil") || "teste");
  const [tema, setTema] = React.useState(params.get("tema") || "light");
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => preview.subscribe(force), []);
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    document.body.style.background = "var(--bg-app)";
  }, [tema]);
  React.useEffect(() => preview.set({ profile: perfil }), [perfil]);
  const sel = { padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-card)", color: "var(--text-primary)", font: "var(--type-body-sm)" };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--border-default)", background: "var(--surface-card)", alignItems: "center" }}>
        <b style={{ font: "var(--type-body-sm)" }}>Prévia (dados simulados)</b>
        <select aria-label="Tela" style={sel} value={tela} onChange={(e) => setTela(e.target.value)}>
          <option value="aluno">Aluno: montador de questões</option>
          <option value="admin">Administração: Planos</option>
        </select>
        {tela === "aluno" && (
          <select aria-label="Perfil" style={sel} value={perfil} onChange={(e) => setPerfil(e.target.value)}>
            {PERFIS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        )}
        <select aria-label="Tema" style={sel} value={tema} onChange={(e) => setTema(e.target.value)}>
          <option value="light">Tema claro</option>
          <option value="dark">Tema escuro</option>
        </select>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }} key={tela + perfil}>
        <MemoryRouter initialEntries={[tela === "aluno" ? "/?exam=staziamed" : "/"]}>
          {tela === "aluno" ? <QuestionBuilder go={(d) => console.log("go", d)} mode="q" /> : <AdminPlans />}
        </MemoryRouter>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<Harness />);
