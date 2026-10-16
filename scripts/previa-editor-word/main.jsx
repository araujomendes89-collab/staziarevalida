// Prévia do editor estilo Word: as telas de verdade (Editar aula e Unidades/Revisão) com banco simulado; ao lado, como o aluno vê.
import React from "react";
import { createRoot } from "react-dom/client";
import "../../src/novo/ds/styles.css";
import { AdminLessons } from "../../src/novo/app/admin/AdminLessons.jsx";
import { Units } from "../../src/novo/app/admin/content/Units.jsx";
import { TextoRico } from "../../src/novo/app/textoRico/TextoRico.jsx";
import { carregarDados, estado } from "./sessaoSimulada.jsx";

function useEstado() {
  const [, set] = React.useState(0);
  React.useEffect(() => {
    const f = () => set((n) => n + 1);
    estado.ouvintes.add(f);
    return () => estado.ouvintes.delete(f);
  }, []);
  return estado;
}

function ComoAlunoVe() {
  const e = useEstado();
  if (!e.lesson) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Como o aluno vê (depois de salvar)</h3>
      <section style={{ padding: 16, borderRadius: 16, background: "var(--surface-card)", border: "1px solid var(--border-subtle)" }}>
        <div className="sm-overline" style={{ color: "var(--text-secondary)", marginBottom: 8 }}>Resumo & racionalidade clínica</div>
        <TextoRico modo="documento" texto={e.lesson.summary} style={{ font: "400 15px/1.65 var(--font-sans)" }} />
        <div className="sm-overline" style={{ color: "var(--text-secondary)", margin: "14px 0 8px" }}>Pontos-chave</div>
        <ol style={{ margin: 0, paddingLeft: 20 }}>{(e.lesson.key_points ?? []).map((p, i) => <li key={i}><TextoRico texto={p} /></li>)}</ol>
      </section>
      <section style={{ padding: 16, borderRadius: 16, background: "var(--surface-card)", border: "1px solid var(--border-subtle)" }}>
        <div className="sm-overline" style={{ color: "var(--text-secondary)", marginBottom: 8 }}>Texto da unidade</div>
        {(e.unit?.version.content.sections ?? []).map((s, i) => (
          <div key={i}>
            <h4 style={{ margin: "10px 0 4px" }}>{s.heading}</h4>
            {(s.paragraphs ?? []).map((p, j) => <p key={j} style={{ margin: "0 0 8px", lineHeight: 1.6 }}><TextoRico texto={p.text} /></p>)}
          </div>
        ))}
      </section>
      <details>
        <summary style={{ cursor: "pointer" }}>Ver o texto guardado (com as marcas)</summary>
        <pre style={{ whiteSpace: "pre-wrap", font: "12px/1.5 ui-monospace, monospace", background: "var(--surface-subtle)", padding: 10, borderRadius: 8 }}>{e.lesson.summary}</pre>
      </details>
    </div>
  );
}

const ABAS = [
  { id: "aula", label: "Editar aula" },
  { id: "unidades", label: "Unidades e revisão" },
];

function Previa() {
  const e = useEstado();
  const [aba, setAba] = React.useState("aula");
  if (!e.lesson) return <p style={{ padding: 24 }}>Carregando a prévia…</p>;
  const ctx = { params: new URLSearchParams({ versao: "v-previa" }), go: () => {}, isAdmin: true, isStaff: true, reviewerAreas: ["PEDIATRIA"] };
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-app)", color: "var(--text-primary)", padding: "16px clamp(12px, 3vw, 32px)", fontFamily: "var(--font-sans)" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <strong style={{ font: "var(--type-h4)" }}>Prévia — editor estilo Word</strong>
        <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Banco simulado, sem login e sem rede. Nada vai para o app.</span>
        <nav style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {ABAS.map((a) => (
            <button key={a.id} type="button" className={`sm-btn sm-btn--sm ${aba === a.id ? "sm-btn--primary" : "sm-btn--secondary"}`} onClick={() => setAba(a.id)}>
              {a.label}
            </button>
          ))}
        </nav>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 20, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>{aba === "aula" ? <AdminLessons /> : <Units {...ctx} />}</div>
        <ComoAlunoVe />
      </div>
    </div>
  );
}

carregarDados();
createRoot(document.getElementById("root")).render(<Previa />);
