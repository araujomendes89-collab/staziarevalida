// Aula inteira (unidade da Central) no editor profissional: cada seção vira Título 1, cada parágrafo um bloco ligado ao original.
// O original é guardado NA ABERTURA: o que não mudar volta idêntico (docParaUnidade), sem derrubar aprovação à toa.
import React, { useRef, useMemo, useCallback } from "react";
import CampoDocumento from "./CampoDocumento.jsx";
import { unidadeParaDoc, docParaUnidade } from "../../../shared/docRico";

export default function EditorAula({ content, aoMudar }) {
  const original = useRef(content);
  
  const docRico = useMemo(() => unidadeParaDoc(original.current), []);
  
  const handleMudar = useCallback((doc) => {
    const atualizado = docParaUnidade(doc, original.current);
    aoMudar({
      ...content,
      sections: atualizado.sections,
      ...(content.doc_config ? { doc_config: content.doc_config } : {})
    });
  }, [content, aoMudar]);

  const handleMudarConfig = useCallback((novaConfig) => {
    aoMudar({
      ...content,
      doc_config: novaConfig
    });
  }, [content, aoMudar]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px", background: "var(--surface-subtle)", color: "var(--text-secondary)", fontSize: "14px" }}>
        Cada Título 1 é uma seção da aula. O que você não mexer continua exatamente igual.
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <CampoDocumento
          valor={docRico}
          aoMudar={handleMudar}
          config={content.doc_config ?? {}}
          aoMudarConfig={handleMudarConfig}
        />
      </div>
    </div>
  );
}
