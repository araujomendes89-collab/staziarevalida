// Tela "Mapas Mentais" (grupo Aprender): lista dos temas que já têm mapa, com filtro por área e busca; abre o mapa.
// Tema sem aula publicada não tem mapa: nada é inventado. O endereço usa o nome do tema (nunca o código interno).
import React from "react";
import { Button, EmptyState, TextField } from "../../ds";
import { useInRouterContext, useSearchParams } from "react-router-dom";
import { MAPAS, AREAS_MAPA, nomeDaArea, dobrar, mapaPorSlug } from "./mapas.js";
import { temaVars } from "../study/temaCores.js";
import { MapaMental } from "./MapaMental.jsx";
import { MapaEmPreparacao } from "./MapaDoTema.jsx";
import "./mapas.css";

function useTemaAberto() {
  const inRouter = useInRouterContext();
  const local = React.useState(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const url = inRouter ? useSearchParams() : null;
  if (!url) return local;
  const [params, setParams] = url;
  return [params.get("tema"), (slug) => setParams(slug ? { tema: slug } : {}, { replace: false })];
}

export function MapasScreen({ go }) {
  const [aberto, setAberto] = useTemaAberto();
  const [area, setArea] = React.useState("");
  const [busca, setBusca] = React.useState("");
  const scroll = React.useRef(null);

  React.useLayoutEffect(() => {
    if (!aberto && scroll.current != null) window.scrollTo({ top: scroll.current, behavior: "instant" });
  }, [aberto]);

  if (aberto) {
    const mapa = mapaPorSlug(aberto);
    return (
      <div className="mm-tela">
        <div className="mm-topo">
          <Button variant="ghost" icon="arrow-left" onClick={() => setAberto(null)}>Todos os mapas</Button>
          {mapa && <span className="mm-topo-area">{nomeDaArea(mapa.area)}</span>}
          <img className="mm-topo-logo" src="/brand/horizontal-240w.png" alt="StaziaMed Revalida" />
        </div>
        {mapa ? <MapaMental mapa={mapa} /> : <MapaEmPreparacao />}
      </div>
    );
  }

  const areasComMapa = AREAS_MAPA.filter(([k]) => MAPAS.some((m) => m.area === k));
  const q = dobrar(busca);
  const lista = MAPAS.filter((m) => (!area || m.area === area) && (!q || dobrar(`${m.titulo} ${m.subtitulo ?? ""} ${nomeDaArea(m.area)}`).includes(q)));
  const abrir = (m) => {
    scroll.current = window.scrollY;
    setAberto(m.slug);
    window.scrollTo(0, 0);
  };

  return (
    <div className="mm-tela">
      <p className="mm-intro">Resumos visuais dos temas que já têm aula. Comece pela revisão rápida e aprofunde só o ramo que precisar.</p>
      <div className="mm-filtros">
        <div className="mm-busca">
          <TextField icon="search" placeholder="Buscar tema" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar tema" />
        </div>
        <div className="mm-areas" role="group" aria-label="Filtrar por área">
          <button type="button" aria-pressed={area === ""} onClick={() => setArea("")}>Todas as áreas</button>
          {areasComMapa.map(([k, nome]) => (
            <button key={k} type="button" aria-pressed={area === k} onClick={() => setArea(k)}>{nome}</button>
          ))}
        </div>
      </div>
      {lista.length === 0 ? (
        <EmptyState icon="search" title="Nenhum mapa encontrado" description="Tente outra palavra ou outra área." />
      ) : (
        <ul className="mm-grade">
          {lista.map((m) => (
            <li key={m.slug}>
              <button type="button" className="mm-lcard" style={temaVars(m.codigo, m.area)} onClick={() => abrir(m)}>
                <span className="mm-lcard-fita" aria-hidden="true" />
                {m.poster?.webp && <img className="mm-lcard-img" src={m.poster.webp} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                <span className="mm-lcard-area">{nomeDaArea(m.area)}</span>
                <strong className="mm-lcard-t">{m.titulo}</strong>
                {m.subtitulo && <span className="mm-lcard-s">{m.subtitulo}</span>}
                <span className="mm-lcard-r">{m.ramos.length} ramos · revisão rápida e aprofundado</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
