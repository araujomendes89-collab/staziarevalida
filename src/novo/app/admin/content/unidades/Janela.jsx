// Janela simples (modal) para a pré-visualização e os formulários da Unidade.
import React from "react";
import { Button } from "../../../../ds";

export function Janela({ titulo, onClose, largura = 880, children }) {
  React.useEffect(() => {
    const fechar = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [onClose]);
  return (
    <div role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 60, background: "color-mix(in oklab, black 55%, transparent)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px 12px", overflowY: "auto" }}>
      <div role="dialog" aria-modal="true" aria-label={titulo} style={{ width: "100%", maxWidth: largura, background: "var(--surface-card)", color: "var(--text-primary)", borderRadius: "var(--radius-lg, 16px)", border: "1px solid var(--border-default)", boxShadow: "0 20px 60px rgb(0 0 0 / .35)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)", position: "sticky", top: 0, background: "var(--surface-card)", borderRadius: "inherit", zIndex: 1 }}>
          <strong style={{ font: "var(--type-h4)" }}>{titulo}</strong>
          <Button size="sm" variant="secondary" icon="x" onClick={onClose}>
            Fechar
          </Button>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
      </div>
    </div>
  );
}
