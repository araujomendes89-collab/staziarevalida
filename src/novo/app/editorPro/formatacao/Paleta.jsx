import React from "react";
import { Botao } from "../ui.jsx";

/** Botão com paleta fechada (cor do texto ou marca-texto). `corAtual` mostra a barrinha colorida sob o ícone. */
export default function Paleta({ icon, label, cores, corAtual, desabilitado, aoEscolher, aoLimpar, rotuloLimpar }) {
  const [aberta, setAberta] = React.useState(false);
  const raiz = React.useRef(null);
  React.useEffect(() => {
    if (!aberta) return undefined;
    const fora = (e) => raiz.current && !raiz.current.contains(e.target) && setAberta(false);
    const esc = (e) => e.key === "Escape" && setAberta(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberta]);
  return (
    <div className="ep-paleta" ref={raiz}>
      <Botao icon={icon} label={label} ativo={aberta} disabled={desabilitado} onClick={() => setAberta(!aberta)} />
      {corAtual && <span className="ep-paleta-barra" style={{ background: corAtual, position: "absolute", left: 6, right: 6, bottom: 2 }} aria-hidden="true" />}
      {aberta && (
        <div className="ep-paleta-pop" role="group" aria-label={label}>
          <div className="ep-paleta-grade">
            {cores.map((c) => (
              <button
                key={c.id}
                type="button"
                className="ep-amostra"
                style={{ background: c.valor }}
                title={c.rotulo}
                aria-label={c.rotulo}
                aria-pressed={corAtual === c.valor}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  aoEscolher(c.valor);
                  setAberta(false);
                }}
              />
            ))}
          </div>
          <button type="button" className="ep-paleta-auto" onMouseDown={(e) => e.preventDefault()} onClick={() => { aoLimpar(); setAberta(false); }}>
            {rotuloLimpar}
          </button>
        </div>
      )}
    </div>
  );
}
