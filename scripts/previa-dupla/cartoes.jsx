// PRÉVIA dos cartões do Banco de estações (porta 31997): os 179 cartões do catálogo, agrupados por área, com filtro por edição.
// Dados do catálogo (catalogo-cartoes.json, cópia de .tmp-aulas/estacoes-inep/catalogo/catalogo.json). Sem login e sem banco.
//   /cartoes.html  [?ver=aluno]  [&edicao=2022-2]  [&tema=escuro]
// O selo "Aguardando conteúdo" é só da equipe. O aluno não vê cartão em montagem (como no banco: medical_review = 'pending').
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/novo/ds/styles.css";
import { StationCard } from "../../src/novo/ds/components/osce/StationCard.jsx";
import { AREAS } from "../../src/novo/ds/areas.js";
import CATALOGO from "./catalogo-cartoes.json";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("tema") === "escuro" ? "dark" : "light";

const EDICOES = [];
for (const c of CATALOGO) if (!EDICOES.find((e) => e.edicao === c.edicao)) EDICOES.push({ edicao: c.edicao, origem: c.origem_rotulo, oficial: c.fonte_oficial });
const chave = (e) => (e.oficial ? "1" : "0") + e.edicao;
EDICOES.sort((a, b) => (a.oficial === b.oficial ? (b.edicao > a.edicao ? 1 : -1) : a.oficial ? -1 : 1));

function App() {
  const [ver, setVer] = React.useState(params.get("ver") === "aluno" ? "aluno" : "equipe");
  const [edicao, setEdicao] = React.useState(params.get("edicao") || "todas");
  const equipe = ver === "equipe";
  // aluno: nada em montagem (nenhum cartão do catálogo foi aprovado ainda)
  const visiveis = equipe ? CATALOGO : [];
  const lista = visiveis.filter((c) => edicao === "todas" || c.edicao === edicao);
  const faixa = { position: "sticky", top: 0, zIndex: 50, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 16px", background: "#fff3cd", color: "#5c4400", font: "600 13px system-ui, sans-serif", borderBottom: "1px solid #e0c36a" };
  const sel = { font: "600 14px var(--font-sans)", padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border-default, #ccc)", background: "var(--surface-card)", color: "var(--text-primary)" };
  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-page, var(--surface-sunken))", color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
      <div style={faixa}>
        <span>PRÉVIA · cartões do catálogo, sem conteúdo ainda. Só no seu computador.</span>
        <a href="/" style={{ color: "inherit" }}>← Índice das telas</a>
      </div>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 16px 60px" }}>
        <h1 style={{ margin: "0 0 4px", font: "800 28px/1.2 var(--font-sans)" }}>Banco de estações</h1>
        <p style={{ margin: "0 0 16px", color: "var(--text-secondary)" }}>
          {equipe ? `${lista.length} de ${CATALOGO.length} cartões` : "Nenhuma estação disponível ainda."}
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <label>
            <span style={{ display: "block", font: "600 12px var(--font-sans)", color: "var(--text-secondary)", marginBottom: 4 }}>Edição</span>
            <select style={sel} value={edicao} onChange={(e) => setEdicao(e.target.value)}>
              <option value="todas">Todas as edições</option>
              {EDICOES.map((e) => (
                <option key={chave(e)} value={e.edicao}>{e.origem}</option>
              ))}
            </select>
          </label>
          <label>
            <span style={{ display: "block", font: "600 12px var(--font-sans)", color: "var(--text-secondary)", marginBottom: 4 }}>Ver como</span>
            <select style={sel} value={ver} onChange={(e) => setVer(e.target.value)}>
              <option value="equipe">Equipe (vê "Aguardando conteúdo")</option>
              <option value="aluno">Aluno (não vê cartão em montagem)</option>
            </select>
          </label>
        </div>
        {AREAS.map((a) => {
          const doArea = lista.filter((c) => c.area_code === a.code);
          if (!doArea.length) return null;
          return (
            <section key={a.code} style={{ marginBottom: 32 }} aria-label={a.label}>
              <h2 style={{ margin: "0 0 12px", font: "800 20px/1.2 var(--font-sans)" }}>
                {a.label} <span style={{ color: "var(--text-tertiary)", fontWeight: 600, fontSize: 15 }}>· {doArea.length}</span>
              </h2>
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                {doArea.map((c) => (
                  <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <StationCard areaCode={c.area_code} title={c.tema} difficulty={null} source={c.origem_rotulo} awaitingContent={equipe && c.situacao !== "conteúdo pronto"} myScorePct={null} averagePct={null} />
                    {equipe && c.situacao === "conteúdo pronto" && (
                      <span
                        style={{ alignSelf: "flex-start", font: "700 12px var(--font-sans)", padding: "3px 10px", borderRadius: 999,
                          background: c.situacao === "conteúdo pronto" ? "var(--surface-sunken)" : "#fff3cd", color: c.situacao === "conteúdo pronto" ? "var(--text-secondary)" : "#5c4400" }}
                        title="Só a equipe vê este selo"
                      >
                        {c.situacao === "conteúdo pronto" ? "Conteúdo pronto · falta aprovar" : "Aguardando conteúdo"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {!lista.length && <p style={{ color: "var(--text-secondary)" }}>Nada para mostrar.</p>}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
