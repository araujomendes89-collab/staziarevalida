// Campo de texto com a barra estilo Word, carregado só quando a tela da Administração abre (o editor não entra no pacote do aluno).
// Enquanto carrega, mostra uma caixa simples com o mesmo texto (somente leitura).
import React from "react";

const EditorTexto = React.lazy(() => import("./EditorTexto.jsx"));

function Carregando({ value, label, minRows = 3 }) {
  return (
    <div className="sm-field">
      {label && <span className="sm-field__label">{label}</span>}
      <div className="sm-input" style={{ height: "auto" }}>
        <textarea
          readOnly
          aria-busy="true"
          aria-label={label || "Carregando o editor"}
          rows={minRows}
          value={value ?? ""}
          style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", resize: "none", padding: "12px 16px", font: "400 15px/1.5 var(--font-sans)", color: "var(--text-secondary)" }}
        />
      </div>
    </div>
  );
}

/** Mesmas props do EditorTexto: value, onChange, modo ("documento" | "linha" | "pontos"), label, hint, maxLength, disabled, minRows. */
export function CampoTexto(props) {
  return (
    <React.Suspense fallback={<Carregando value={props.value} label={props.label} minRows={props.minRows} />}>
      <EditorTexto {...props} />
    </React.Suspense>
  );
}

export default CampoTexto;
