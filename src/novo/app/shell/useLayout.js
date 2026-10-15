// Medidas de tela da casca (computador, tablet 720 a 1180 px, celular até 719 px). Separado do Shell.jsx para as telas usarem sem importar o menu.
import React from "react";

export function useMQ(q) {
  const has = typeof matchMedia === "function"; // sem matchMedia (testes, navegador antigo): tela de computador
  const [m, setM] = React.useState(() => (has ? matchMedia(q).matches : false));
  React.useEffect(() => {
    if (!has) return undefined;
    const mq = matchMedia(q);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [q, has]);
  return m;
}
export function useMobile() {
  return useMQ("(max-width: 860px)");
}

/** Computador (>1180 px), tablet (720 a 1180 px, inclui o iPad de 834 px) ou celular (até 719 px). O corte das telas de dentro (useMobile) segue em 860. */
export function useLayout() {
  const mobile = useMQ("(max-width: 719px)");
  const tablet = useMQ("(max-width: 1180px)");
  return mobile ? "mobile" : tablet ? "tablet" : "desktop";
}

