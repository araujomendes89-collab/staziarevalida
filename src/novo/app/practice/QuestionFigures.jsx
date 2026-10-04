// Figuras que acompanham o enunciado (recortes do caderno oficial). Toque/clique amplia.
import React from "react";

export function QuestionFigures({ images }) {
  const [open, setOpen] = React.useState(null);
  if (!images?.length) return null;
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "16px 0 0" }}>
        {images.map((img, i) => (
          <figure key={img.url} style={{ margin: 0 }}>
            <button type="button" onClick={() => setOpen(img)} aria-label={`Ampliar: ${img.alt}`} style={{ display: "block", padding: 0, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "#fff", cursor: "zoom-in", maxWidth: "100%" }}>
              <img src={img.url} alt={img.alt} loading="lazy" style={{ display: "block", maxWidth: "100%", maxHeight: 420, margin: "0 auto", borderRadius: "var(--radius-md)" }} />
            </button>
            {images.length > 1 && <figcaption style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 4 }}>Figura {i + 1}</figcaption>}
          </figure>
        ))}
      </div>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={open.alt} onClick={() => setOpen(null)} onKeyDown={(e) => e.key === "Escape" && setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--surface-overlay)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <img src={open.url} alt={open.alt} style={{ maxWidth: "100%", maxHeight: "100%", background: "#fff", borderRadius: "var(--radius-md)" }} />
          <button type="button" autoFocus aria-label="Fechar" className="sm-btn sm-btn--secondary sm-btn--sm" style={{ position: "absolute", top: 16, right: 16 }} onClick={() => setOpen(null)}>
            Fechar
          </button>
        </div>
      )}
    </>
  );
}
