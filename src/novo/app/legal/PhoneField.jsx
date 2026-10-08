// WhatsApp do cadastro: seletor de país + número. "Outro" abre uma caixa para a pessoa digitar o código (contrato em phone.js).
import React from "react";
import { COUNTRIES } from "./phone.js";

const isListed = (code) => COUNTRIES.some((c) => c.code === code && c.code !== "outro");

/**
 * @param {{ code: string, number: string, onChange: (v: { code: string, number: string }) => void, error?: string, codeError?: string, id?: string }} props
 */
export function PhoneField({ code, number, onChange, error, codeError, id = "secure-phone" }) {
  const [other, setOther] = React.useState(() => !isListed(code));
  const selectValue = !other && isListed(code) ? code : "outro";
  const shown = error || codeError;
  return (
    <div className="lg-field">
      <label className="lg-label" htmlFor={`${id}-number`}>WhatsApp</label>
      <div className="lg-phone">
        <select
          id={`${id}-country`}
          className="lg-input lg-input--plain lg-phone-country"
          aria-label="País do WhatsApp"
          value={selectValue}
          onChange={(e) => {
            if (e.target.value === "outro") {
              setOther(true);
              onChange({ code: "", number });
            } else {
              setOther(false);
              onChange({ code: e.target.value, number });
            }
          }}
        >
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
        {other && (
          <input
            id={`${id}-code`}
            className={`lg-input lg-input--plain lg-phone-code${codeError ? " is-error" : ""}`}
            aria-label="Código do país"
            placeholder="+44"
            inputMode="tel"
            autoComplete="off"
            value={code}
            aria-invalid={codeError ? "true" : "false"}
            aria-describedby={shown ? `${id}-error` : undefined}
            onChange={(e) => onChange({ code: e.target.value, number })}
          />
        )}
        <input
          id={`${id}-number`}
          name="phone"
          type="tel"
          autoComplete="tel-national"
          className={`lg-input lg-input--plain lg-phone-number${error ? " is-error" : ""}`}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={shown ? `${id}-error` : undefined}
          value={number}
          onChange={(e) => onChange({ code, number: e.target.value })}
        />
      </div>
      {shown ? <span id={`${id}-error`} className="lg-field-error">{shown}</span> : null}
    </div>
  );
}
