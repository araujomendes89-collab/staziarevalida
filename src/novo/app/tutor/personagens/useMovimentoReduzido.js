// "Reduzir movimento" do aparelho (prefers-reduced-motion), acompanhando mudanças. Próprio dos personagens para não depender da esfera.
import React from "react";

const CONSULTA = "(prefers-reduced-motion: reduce)";
const ler = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? Boolean(window.matchMedia(CONSULTA)?.matches) : false);

export function useMovimentoReduzido() {
  const [reduzido, setReduzido] = React.useState(ler);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(CONSULTA);
    const on = () => setReduzido(Boolean(mq?.matches));
    mq?.addEventListener?.("change", on);
    return () => mq?.removeEventListener?.("change", on);
  }, []);
  return reduzido;
}
