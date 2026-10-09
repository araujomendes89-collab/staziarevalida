// Disposição do editor com o painel do assistente ao lado: com 900 px ou mais, o painel fica numa coluna de 380 px que acompanha a rolagem;
// abaixo disso (ou sem ResizeObserver), o painel vai embaixo do editor. Fechado, só o editor aparece.
import React from "react";

const WIDE = 900;

export function AssistantLayout({ open, panel, children }) {
  const ref = React.useRef(null);
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setWide(el.getBoundingClientRect().width >= WIDE);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!open) return <div ref={ref}>{children}</div>;
  if (wide) {
    return (
      <div ref={ref} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 380px", gap: 16, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>{children}</div>
        <div style={{ position: "sticky", top: 16, maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}>{panel}</div>
      </div>
    );
  }
  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {children}
      <div>{panel}</div>
    </div>
  );
}
