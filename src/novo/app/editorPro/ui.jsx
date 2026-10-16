import React from "react";
import { Icon } from "../../ds";

export function Botao({ icon, label, ativo, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`ep-btn${ativo ? " ep-ativo" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={ativo === undefined ? undefined : Boolean(ativo)}
      onMouseDown={(e) => e.preventDefault()}
    >
      {icon && <Icon name={icon} size={16} />}
      {!icon && <span className="ep-btn-label">{label}</span>}
    </button>
  );
}

export function Seletor({ label, value, opcoes, onChange, disabled }) {
  return (
    <select
      className="ep-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}

export function Grupo({ rotulo, children }) {
  return (
    <div className="ep-grupo" role="group" aria-label={rotulo}>
      <div className="ep-grupo-itens">{children}</div>
      <div className="ep-grupo-rotulo">{rotulo}</div>
    </div>
  );
}
