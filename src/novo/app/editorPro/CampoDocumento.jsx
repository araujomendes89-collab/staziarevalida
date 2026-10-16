// Carrega o editor profissional só quando a tela da Administração abre (não entra no pacote do aluno).
import React, { Suspense } from "react";

const EditorDocumento = React.lazy(() => import("./EditorDocumento.jsx"));

export default function CampoDocumento(props) {
  return (
    <Suspense fallback={<div style={{ padding: "20px", textAlign: "center" }}>Carregando o editor…</div>}>
      <EditorDocumento {...props} />
    </Suspense>
  );
}
