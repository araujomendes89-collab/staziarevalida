// Peças comuns das telas da onda 5 (Desempenho, Análise, Planejamento, Conta, Meu plano): azulejo pastel com ícone ilustrado,
// arte das 5 áreas e o "é tela estreita?" do pacote (celular até 719 px; tablet e computador usam o desenho largo).
import React from "react";
import { Icon } from "../../ds";
import { AREA_ART } from "../../ds/area-art/index.js";
import coroa from "../../ds/ilustracoes/coroa.svg";
import cadeado from "../../ds/ilustracoes/cadeado.svg";
import privacidade from "../../ds/ilustracoes/privacidade.svg";
import { AppRealIcon } from "../AppIcons.jsx";
import "./evolucao.css";

/** Celular (até 719 px de largura)? O tablet (834 px) e o computador usam o desenho largo do pacote. */
export function useNarrow(max = 719) {
  const query = `(max-width: ${max}px)`;
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [narrow, setNarrow] = React.useState(get);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return narrow;
}

/** "narrow" (celular, até 719 px), "mid" (tablet e janelas médias, até 1179 px) ou "wide" (computador). */
export function useBreakpoint() {
  const narrow = useNarrow(719);
  const mid = useNarrow(1179);
  return narrow ? "narrow" : mid ? "mid" : "wide";
}

const ILLUSTRATIONS = { crown: coroa, lock: cadeado, privacy: privacidade };
// nomes desta onda -> nomes (Lucide) que o protótipo e AppIcons.jsx usam para o mesmo ícone ilustrado
const ALIAS = { hoje: "list-checks", question: "file-question", notebook: "notebook-pen", clipboard: "clipboard-list", calendar: "calendar-days", chart: "chart-column", logout: "log-out" };

/** Ícone ilustrado do pacote (os do protótipo, os de AppIcons e três do pacote: coroa, cadeado, privacidade); sem ele, ícone de linha. */
export function RichIcon({ name, size = 28, fallback = "circle" }) {
  const art = ILLUSTRATIONS[name];
  if (art) return <img src={art} alt="" width={size} height={size} className="ev-ill" draggable="false" />;
  return AppRealIcon({ name: ALIAS[name] ?? name, size }) ?? <Icon name={fallback} size={Math.round(size * 0.8)} />;
}

/** Azulejo pastel (degradê claro) que guarda um ícone ilustrado. tone: blue | violet | orange | green | pink | slate | clinica... */
export function Tile({ tone = "blue", size = 48, radius, children, className = "" }) {
  return (
    <span className={`ev-tile ev-tile--${tone} ${className}`.trim()} style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.29) }} aria-hidden="true">
      {children}
    </span>
  );
}

/** Azulejo de uma grande área (id do banco) com a arte própria dela. */
export function AreaTile({ area, size = 40 }) {
  const art = AREA_ART[area];
  if (!art) return <Tile tone="slate" size={size} />;
  return (
    <Tile tone={art.key} size={size} radius={Math.round(size * 0.3)}>
      <img src={art.src} alt="" width={Math.round(size * 0.65)} height={Math.round(size * 0.65)} className="ev-ill" draggable="false" />
    </Tile>
  );
}

/** Quadro branco arredondado (22 px) do pacote. */
export function Panel({ as: Tag = "section", className = "", children, ...rest }) {
  return (
    <Tag className={`ev-panel ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
