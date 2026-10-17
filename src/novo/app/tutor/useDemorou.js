// Frases de espera (decisão do dono de 17/10/2026): o indicador "Stazia está conferindo a fonte…" só aparece quando a resposta
// passa de ~600 ms (ATRASO_ESPERA_MS em server/tutor/conhecimento/frasesEspera.ts). Resposta rápida não mostra nada.
import React from "react";
import { ATRASO_ESPERA_MS } from "../../../../server/tutor/conhecimento/frasesEspera";

/** true quando `ativo` ficou ligado por mais de `ms` (volta a false assim que desliga). */
export function useDemorou(ativo, ms = ATRASO_ESPERA_MS) {
  const [passou, setPassou] = React.useState(false);
  React.useEffect(() => {
    setPassou(false);
    if (!ativo) return undefined;
    const t = setTimeout(() => setPassou(true), ms);
    return () => clearTimeout(t);
  }, [ativo, ms]);
  return Boolean(ativo) && passou;
}
