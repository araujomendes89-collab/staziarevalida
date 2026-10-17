// SÓ PARA TESTE ANTIGO DE TELA: troca o CampoRico (editor profissional) por um textarea com o mesmo rótulo, para os testes que já
// existiam antes do editor (getByLabelText(...).value, fireEvent.change) continuarem testando a mesma lógica. Genérico: serve a
// Questões, Atualizações, Estações, Central... O CampoRico de verdade é testado nos testes editorPro.* (campos, questoes...).
// Uso, no teste: vi.mock("../novo/app/editorPro/CampoRico.jsx", () => import("./helpers/campoRicoComoTexto"));
import React from "react";

type Props = {
  label?: string;
  texto?: string | null;
  rico?: unknown;
  onChange?: (v: { texto: string; rico: null }) => void;
  disabled?: boolean;
  maxLength?: number;
  hint?: React.ReactNode;
  id?: string;
};

export function CampoRico({ label, texto, onChange, disabled = false, maxLength, hint, id: dado }: Props) {
  const auto = React.useId();
  const id = dado ?? auto;
  return (
    <div className="sm-field">
      {label && (
        <label className="sm-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <textarea id={id} value={texto ?? ""} disabled={disabled} maxLength={maxLength} onChange={(e) => onChange?.({ texto: e.target.value, rico: null })} />
      {hint && <span className="sm-field__hint">{hint}</span>}
    </div>
  );
}

export default CampoRico;
