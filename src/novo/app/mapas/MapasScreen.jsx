// Tela "Mapas Mentais" (grupo Aprender): lista dos temas que já têm mapa, com filtro por área e busca; abre o mapa.
// Tema sem aula publicada não tem mapa: nada é inventado. O endereço usa o nome do tema (nunca o código interno).
import React from "react";
import { Button, EmptyState, SegmentedControl, TextField } from "../../ds";
import { useMQ } from "../Shell.jsx";
import { AREA_VISUAL, AreaBloco, AreaFiltro } from "../study/casca.jsx";
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
  return [params.get("tema"), (slug, modo) => setParams(slug ? { tema: slug, ...(modo === "aprofundado" ? { modo } : {}) } : {}, { replace: false }), params.get("de"), params.get("modo") === "aprofundado" ? "aprofundado" : "revisao"];
}

export function MapasScreen({ go }) {
  const [aberto, setAberto, origem, modoUrl] = useTemaAberto();
  const celular = useMQ("(max-width: 719px)");
  const [modoCelular, setModoCelular] = React.useState("revisao");
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
          <Button className="mm-voltar" variant="secondary" aria-label="Voltar" onClick={() => (origem === "temas" ? go("temas") : setAberto(null))}>← Voltar</Button>
          {mapa && <span className="mm-topo-area">{nomeDaArea(mapa.area)}</span>}
        </div>
        {mapa ? <MapaMental mapa={mapa} modoInicial={modoUrl} /> : <MapaEmPreparacao />}
      </div>
    );
  }

  const areasComMapa = AREAS_MAPA.filter(([k]) => MAPAS.some((m) => m.area === k));
  const q = dobrar(busca);
  const lista = MAPAS.filter((m) => (!area || m.area === area) && (!q || dobrar(`${m.titulo} ${m.subtitulo ?? ""} ${nomeDaArea(m.area)}`).includes(q)));
  const abrir = (m, modo) => {
    scroll.current = window.scrollY;
    setAberto(m.slug, modo);
    window.scrollTo(0, 0);
  };

  return (
    <div className="mm-tela">
      <p className="mm-intro">Resumos visuais dos temas que já têm aula. Comece pela revisão rápida e aprofunde só o ramo que precisar.</p>
      <div className="mm-filtros">
        <div className="mm-busca">
          <TextField icon="search" placeholder="Buscar tema" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar tema" />
        </div>
        <AreaFiltro rotulo="Filtrar por área" valor={area} onChange={setArea} itens={[{ id: "", label: "Todas as áreas", k: "todas", curto: "Todas" }, ...areasComMapa.map(([k, nome]) => ({ id: k, label: nome, k }))]} />
      </div>
      <div className="mm-modo-celular">
        <SegmentedControl fullWidth label="Como abrir o mapa" value={modoCelular} onChange={setModoCelular} options={[{ value: "revisao", label: "Revisão rápida" }, { value: "aprofundado", label: "Aprofundado" }]} />
      </div>
      {lista.length === 0 ? (
        <EmptyState icon="search" title="Nenhum mapa encontrado" description="Tente outra palavra ou outra área." />
      ) : (
        <ul className="mm-grade">
          {lista.map((m) => {
            const temDeep = m.ramos.some((r) => r.aprofundado?.length);
            const visual = AREA_VISUAL[m.area] ?? AREA_VISUAL.todas;
            return (
              <li key={m.slug} className="mm-item" style={temaVars(m.codigo, m.area)}>
                <button
                  type="button"
                  className="mm-lcard"
                  title={m.titulo}
                  aria-label={`${m.titulo}. ${m.subtitulo ?? ""}`.trim()}
                  onClick={() => abrir(m, celular && temDeep ? modoCelular : undefined)}
                >
                  <span className="mm-lcard-tile" style={{ "--ap-de": visual.de, "--ap-ate": visual.ate }}>
                    {m.icone?.webp ? (
                      <img className="mm-lcard-ico" src={m.icone.webp} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    ) : (
                      <AreaBloco k={m.area} tamanho={46} />
                    )}
                  </span>
                  <span className="mm-lcard-corpo">
                    <span className="mm-lcard-area">{nomeDaArea(m.area)}</span>
                    <strong className="mm-lcard-t">{m.titulo}</strong>
                    {m.subtitulo && <span className="mm-lcard-s">{m.subtitulo}</span>}
                  </span>
                </button>
                <span className="mm-lcard-r mm-lcard-r--celular">{m.ramos.length} ramos</span>
                <div className="mm-lcard-pe">
                  <span className="mm-lcard-r">{m.ramos.length} ramos</span>
                  <button type="button" className="mm-acao mm-acao--rapida" onClick={() => abrir(m)}>Revisão rápida</button>
                  <button type="button" className="mm-acao" disabled={!temDeep} onClick={() => abrir(m, "aprofundado")}>Aprofundado</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
