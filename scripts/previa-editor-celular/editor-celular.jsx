// Prévia (só para as capturas a 390 px): o editor profissional como cada tela da Administração usa. Todas passam pelo mesmo
// EditorDocumento: Questões, Atualizações e Comunicados com o CampoRico (campo curto), Podcasts com o CampoRico só texto (fala) e
// Aulas com o documento inteiro (EditorAula). ?tela=questoes|atualizacoes|comunicados|podcasts|aulas
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/novo/ds/styles.css";
import { CampoRico } from "../../src/novo/app/editorPro/CampoRico.jsx";
import { campoDoDoc } from "../../src/shared/docRico/campos";

const EditorDocumento = React.lazy(() => import("../../src/novo/app/editorPro/EditorDocumento.jsx"));
const DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Sepse: o que mudou" }] },
    { type: "paragraph", content: [{ type: "text", text: "Antibiótico " }, { type: "text", text: "na primeira hora", marks: [{ type: "bold" }] }, { type: "text", text: " e reavaliação do lactato." }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Culturas antes do antibiótico" }] }] }] },
  ],
};
const C = campoDoDoc(DOC);
const TELAS = {
  questoes: ["Questões", "Enunciado", false],
  atualizacoes: ["Atualizações", "O que mudou", false],
  comunicados: ["Comunicados", "Texto", false],
  podcasts: ["Podcasts", "Fala", true],
};

function Pagina() {
  const tela = new URLSearchParams(location.search).get("tela") || "questoes";
  const [v, setV] = React.useState({ texto: C.texto, rico: C.rico });
  const [doc, setDoc] = React.useState(DOC);
  return (
    <div style={{ padding: 16, background: "var(--bg-app)", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ font: "700 12px var(--font-sans)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 12 }}>
        Administração › {tela === "aulas" ? "Aulas (documento da aula)" : TELAS[tela][0]}
      </div>
      <div style={{ background: "var(--surface-card)", borderRadius: 16, padding: 16, border: "1px solid var(--border-default)" }} data-testid="area">
        {tela === "aulas" ? (
          <React.Suspense fallback={null}>
            <EditorDocumento valor={doc} aoMudar={setDoc} rotulo="Documento da aula" />
          </React.Suspense>
        ) : (
          <CampoRico label={TELAS[tela][1]} somenteTexto={TELAS[tela][2]} texto={TELAS[tela][2] ? "Bom dia! Hoje vamos falar de sepse." : v.texto} rico={TELAS[tela][2] ? null : v.rico} onChange={setV} />
        )}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<Pagina />);
