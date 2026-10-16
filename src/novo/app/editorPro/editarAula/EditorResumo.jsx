// Módulo M13: o editor profissional completo no "Resumo & racionalidade clínica" da tela Editar aula (só Administração).
// Entra o resumo guardado (summary + summary_rico); sai { summary, summary_rico } pronto para gravar (rico só quando precisa).
// Resumo trocado por fora (Cancelar, assistente de IA, outra aula) recarrega o editor; o que o próprio editor mandou não recarrega.
import React from "react";
import CampoDocumento from "../CampoDocumento.jsx";
import { docDoResumo, resumoParaGuardar, resumoRicoValido } from "../../../../shared/docRico/modulos/editarAula";
import "./editarAula.css";

export default function EditorResumo({ summary, rico, aoMudar, rotulo = "Resumo & racionalidade clínica", maxLength = 8000, somenteLeitura = false, aoCriar }) {
  const enviado = React.useRef(null);
  const valor = React.useRef(null);
  const veioDeFora = !enviado.current || enviado.current.summary !== (summary ?? "") || enviado.current.rico !== (rico ?? null);
  if (veioDeFora || !valor.current) {
    const r = resumoRicoValido(summary, rico);
    valor.current = r ? r.doc : docDoResumo(summary);
    enviado.current = { summary: summary ?? "", rico: rico ?? null };
  }
  const aoMudarRef = React.useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  const mudou = React.useCallback((doc) => {
    const g = resumoParaGuardar(doc);
    enviado.current = { summary: g.summary, rico: g.summary_rico };
    aoMudarRef.current?.(g);
  }, []);

  const tamanho = String(summary ?? "").length;
  const temRico = Boolean(resumoRicoValido(summary, rico));
  return (
    <div className="sm-field ea-resumo">
      <span className="sm-field__label">{rotulo}</span>
      <div className="ea-resumo__caixa">
        <CampoDocumento valor={valor.current} aoMudar={mudou} rotulo={rotulo} somenteLeitura={somenteLeitura} aoCriar={aoCriar} />
      </div>
      <span className="sm-field__hint" style={tamanho > maxLength ? { color: "var(--danger-text)" } : undefined}>
        {temRico ? "Com formatação do editor: o aluno vê exatamente assim." : "Texto simples: o aluno vê como hoje."}
        {tamanho > maxLength * 0.9 ? ` · ${tamanho} de ${maxLength} caracteres` : ""}
      </span>
    </div>
  );
}
