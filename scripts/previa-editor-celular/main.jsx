// Prévia do editor no celular: as telas de verdade da Administração que usam o editor profissional, com banco simulado.
//   ?tela=questoes   Questões › Editar questão (QuestionEditor; campos curtos com o CampoRico)
//   ?tela=aulas      Central de Conteúdo › Aulas › Editor completo (o documento da aula inteira)
//   ?tela=comunicados  Comunicados › Novo comunicado (CampoRico "Texto")
//   ?tela=atualizacoes Atualizações & Diretrizes › Nova atualização
//   ?tela=podcasts   campo "Fala" como nos Podcasts (CampoRico só texto)
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../../src/novo/ds/styles.css";
import { QuestionEditor } from "../../src/novo/app/admin/AdminQuestions.jsx";
import { Units } from "../../src/novo/app/admin/content/Units.jsx";
import { AdminComunicados } from "../../src/novo/app/admin/AdminComunicados.jsx";
import { AdminUpdates } from "../../src/novo/app/admin/AdminUpdates.jsx";
import { CampoRico } from "../../src/novo/app/editorPro/CampoRico.jsx";

const tela = new URLSearchParams(location.search).get("tela") || "questoes";

function Podcasts() {
  const [t, setT] = React.useState("Bom dia! Hoje vamos falar de bronquiolite, a causa mais comum de chiado no primeiro ano de vida.");
  return (
    <div style={{ background: "var(--surface-card)", borderRadius: 16, padding: 16, border: "1px solid var(--border-default)" }}>
      <h3 style={{ margin: "0 0 12px", font: "var(--type-h4)" }}>Roteiro · fala 1</h3>
      <CampoRico label="Fala" somenteTexto texto={t} maxLength={700} onChange={(c) => setT(c.texto)} />
    </div>
  );
}

function Tela() {
  const ctx = { params: new URLSearchParams({ versao: "v-previa" }), setParams: () => {}, go: () => {}, isAdmin: true, isStaff: true, reviewerAreas: [] };
  if (tela === "questoes") return <QuestionEditor id="q1" onClose={() => {}} onSaved={() => {}} />;
  if (tela === "aulas") return <Units {...ctx} />;
  if (tela === "comunicados") return <AdminComunicados />;
  if (tela === "atualizacoes") return <AdminUpdates />;
  return <Podcasts />;
}

createRoot(document.getElementById("root")).render(
  <MemoryRouter>
    <div style={{ minHeight: "100vh", background: "var(--bg-app)", color: "var(--text-primary)", padding: 16, boxSizing: "border-box", fontFamily: "var(--font-sans)" }}>
      <Tela />
    </div>
  </MemoryRouter>,
);
