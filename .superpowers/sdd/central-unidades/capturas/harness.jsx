import React from "react";
import { createRoot } from "react-dom/client";
import "../../../../src/novo/ds/styles.css";
import { Units } from "../../../../src/novo/app/admin/content/Units.jsx";
import dados from "./dados.json";

const q = new URLSearchParams(location.search);
document.documentElement.dataset.theme = q.get("tema") ?? "light";
// arquivos protegidos: o servidor devolve o arquivo da aula; aqui as imagens reais da GR-001
const ARQ = { revisao_aula: "GR-001-pagina-a4.png", story: "GR-001-card-story.png", card_feed: "GR-001-card-feed.png", flashcards_a6: "GR-001-F01-digital-frente.png", flashcards_ilustrados: "GR-001-F01-digital-frente.png" };
const fetchReal = window.fetch.bind(window);
window.fetch = (url, opts) => {
  const m = String(url).match(/unit-materials\/([^/]+)\/file\/(\d+)/);
  if (!m) return fetchReal(url, opts);
  const it = dados.materials.find((x) => x.id === m[1]);
  return fetchReal(`./${ARQ[it?.kind] ?? "GR-001-pagina-a4.png"}`);
};
const papel = q.get("papel") ?? "admin";
function App() {
  const [params, setParams] = React.useState(new URLSearchParams(q.get("tela") === "lista" ? "" : `versao=${dados.versionId}`));
  const go = (secao, extra = {}) => setParams(new URLSearchParams(extra));
  return (
    <div style={{ background: "var(--bg-app)", color: "var(--text-primary)", minHeight: "100vh", padding: 16, fontFamily: "var(--font-sans, system-ui)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Units params={params} go={go} isAdmin={papel === "admin"} isStaff={papel !== "revisor"} reviewerAreas={papel === "revisor" ? ["CLINICA_MEDICA"] : []} />
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
