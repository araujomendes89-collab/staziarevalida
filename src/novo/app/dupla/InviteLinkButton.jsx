// Treino em Dupla · "Copiar link de convite": copia o link do @ (https://…/novo/convite/<@>) com cópia segura. Se o navegador não
// deixar copiar, mostra o link em um campo para a pessoa copiar à mão. O link só leva o @ (e a estação, se escolhida): nada pessoal.
import React from "react";
import { Button } from "../../ds";
import { copyText, inviteLink } from "./radarApi.js";

/**
 * @param {{ handle?: string | null, stationId?: string | null, variant?: "primary" | "secondary" | "ghost", size?: "sm" | "md" }} p
 */
export function InviteLinkButton({ handle, stationId = null, variant = "secondary", size = "sm" }) {
  const [state, setState] = React.useState("idle"); // idle | copied | manual
  const inputRef = React.useRef(null);
  const link = handle ? inviteLink(handle, stationId) : "";

  React.useEffect(() => {
    if (state === "manual" && inputRef.current) inputRef.current.select();
    if (state !== "copied") return undefined;
    const timer = setTimeout(() => setState("idle"), 2500);
    return () => clearTimeout(timer);
  }, [state]);

  if (!handle) return null;
  const copy = async () => {
    setState((await copyText(link)) ? "copied" : "manual");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", maxWidth: "100%" }}>
      <Button variant={variant} size={size} icon={state === "copied" ? "check" : "link"} onClick={copy}>
        {state === "copied" ? "Link copiado" : "Copiar link de convite"}
      </Button>
      <span role="status" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {state === "copied" ? "Link de convite copiado." : ""}
      </span>
      {state === "manual" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, font: "12px var(--font-sans)", color: "var(--text-tertiary)", width: "100%" }}>
          Não foi possível copiar sozinho. Copie o link abaixo:
          <input
            ref={inputRef}
            readOnly
            value={link}
            aria-label="Link de convite"
            onFocus={(e) => e.target.select()}
            style={{ font: "13px var(--font-mono)", padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", background: "var(--surface-sunken)", color: "var(--text-primary)", width: "100%", boxSizing: "border-box" }}
          />
        </label>
      )}
    </div>
  );
}
