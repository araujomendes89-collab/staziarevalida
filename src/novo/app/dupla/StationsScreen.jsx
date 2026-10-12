// Banco de estações da 2ª fase (Treinamento em Dupla). Textos e medidas do protótipo (Stations.jsx:19-58), sem "Simulado de
// prova" e sem dificuldade (o banco não tem esse dado). Dados reais de `app_dupla_stations()`; sem dado fica "—".
// Clique numa estação: `go("dupla", { estacao: id })` abre o Praticar com ela escolhida.
import React from "react";
import { Button, Icon, SegmentedControl, StationCard, TextField } from "../../ds";
import { formatDecimal } from "../../ds/format.js";
import { useSession } from "../session.jsx";
import { LoadError, Loading, useLoad } from "../admin/common.jsx";
import { AREAS, areaByCode, areaVars, sourceLabel } from "./labels.js";

// Estilos da tela: só tokens (var(--…)). Classes `dst-` próprias para ter foco, hover e celular sem tocar no CSS do design system.
const CSS = `
.dst{display:flex;flex-direction:column;gap:var(--space-5);width:100%;max-width:1200px;margin:0 auto;font-family:var(--font-sans)}
.dst__lead{margin:0;font:400 15px/1.5 var(--font-sans);color:var(--text-secondary)}
.dst__blocks{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.dst__block{text-align:left;padding:14px 16px;border:0;border-radius:var(--radius-lg);cursor:pointer;font:inherit;background:var(--dst-soft);color:var(--dst-ink);transition:box-shadow var(--dur-fast),background var(--dur-fast)}
.dst__block[aria-pressed="true"]{background:var(--dst-solid);color:var(--surface-card);box-shadow:var(--shadow-md)}
.dst__block:focus-visible,.dst__tab:focus-visible,.dst__row:focus-visible{outline:none;box-shadow:var(--focus-ring)}
.dst__block-n{font:800 26px/1 var(--font-sans)}
.dst__block-l{margin-top:6px;font:700 13px/1.3 var(--font-sans)}
.dst__bar{position:sticky;top:var(--topbar-h,0px);z-index:var(--z-sticky);display:flex;flex-direction:column;gap:12px;padding:8px 0;background:var(--bg-app)}
.dst__controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.dst__search{flex:1 1 320px;min-width:0}
.dst__tabs{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
.dst__tab{display:inline-flex;align-items:center;gap:8px;flex:none;height:38px;padding:0 14px;border-radius:var(--radius-pill);border:1px solid var(--border-default);background:var(--surface-card);color:var(--text-secondary);font:600 13px var(--font-sans);white-space:nowrap;cursor:pointer}
.dst__tab:hover{border-color:var(--border-strong);color:var(--text-primary)}
.dst__tab[aria-pressed="true"]{border-color:transparent;background:var(--dst-solid,var(--action-strong));color:var(--surface-card)}
.dst__tab[aria-pressed="true"]:not([style]){color:var(--action-on-strong)}
.dst__dot{width:8px;height:8px;border-radius:3px;background:var(--dst-solid)}
.dst__tab[aria-pressed="true"] .dst__dot{background:var(--surface-card)}
.dst__tab-n{font:600 11px var(--font-mono);opacity:.75}
.dst__empty{padding:40px 24px;text-align:center;color:var(--text-secondary);background:var(--surface-card);border:1px solid var(--border-subtle);border-radius:var(--radius-xl)}
.dst__empty-t{margin:10px 0 4px;font:600 16px var(--font-sans);color:var(--text-primary)}
.dst__empty-a{margin-top:14px}
.dst__section{display:flex;flex-direction:column;gap:12px}
.dst__h{margin:0;display:flex;align-items:center;gap:10px;font:700 17px var(--font-sans);color:var(--text-primary)}
.dst__h-dot{width:10px;height:10px;border-radius:3px;background:var(--dst-solid)}
.dst__h-n{font:600 12px var(--font-mono);color:var(--text-tertiary)}
.dst__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:14px}
.dst__list{overflow:hidden;background:var(--surface-card);border:1px solid var(--border-subtle);border-radius:var(--radius-xl)}
.dst__row{display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:14px;width:100%;padding:14px 18px;border:0;border-top:1px solid var(--border-subtle);background:transparent;text-align:left;cursor:pointer;font:inherit;color:inherit}
.dst__row:first-child{border-top:0}
.dst__row:hover{background:var(--surface-subtle)}
.dst__num{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:var(--radius-sm);background:var(--dst-solid);color:var(--surface-card);font:700 13px var(--font-mono)}
.dst__row-t{display:block;font:700 15px/1.35 var(--font-sans);color:var(--text-primary)}
.dst__row-m{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:3px;font:400 12px var(--font-sans);color:var(--text-secondary)}
.dst__row-a{color:var(--dst-ink);font-weight:600}
.dst__scores{display:flex;gap:18px;align-items:center}
.dst__score{text-align:right}
.dst__k{display:block;font:600 10px var(--font-sans);letter-spacing:.05em;text-transform:uppercase;color:var(--text-tertiary)}
.dst__v{font:600 15px var(--font-mono);color:var(--text-primary)}
.dst__v--mine{color:var(--dst-ink)}
.dst__v[data-empty="true"]{color:var(--text-tertiary)}
@media (max-width:640px){
  .dst__row{grid-template-columns:34px minmax(0,1fr);padding:14px}
  .dst__scores{grid-column:2;justify-content:flex-start}
  .dst__score{text-align:left}
  .dst__scores>.sm-icon{display:none}
}
@media (prefers-reduced-motion: reduce){.dst__block{transition:none}}
`;

/** Sem acento nem maiúscula: "clinica" acha "Clínica". */
const plain = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const cssVars = (code) => {
  const v = areaVars(code);
  return { "--dst-solid": v.solid, "--dst-soft": v.soft, "--dst-ink": v.ink };
};

const pct = (value, digits) => (typeof value === "number" && Number.isFinite(value) ? `${formatDecimal(value, digits)}%` : "—");

function Row({ station, onOpen }) {
  const area = areaByCode(station.area_code);
  const tags = Array.isArray(station.styles) ? station.styles : [];
  const mine = typeof station.my_last_pct === "number" && Number.isFinite(station.my_last_pct);
  return (
    <button type="button" className="dst__row" style={cssVars(station.area_code)} onClick={onOpen}>
      <span className="dst__num">{station.number ?? "—"}</span>
      <span style={{ minWidth: 0 }}>
        <span className="dst__row-t">{station.name}</span>
        <span className="dst__row-m">
          {area && <span className="dst__row-a">{area.label}</span>}
          {tags.length > 0 && <span>{tags.join(" · ")}</span>}
        </span>
      </span>
      <span className="dst__scores">
        <span className="dst__score">
          <span className="dst__k">Última nota</span>
          <span className="dst__v dst__v--mine" data-empty={!mine}>{pct(station.my_last_pct, 0)}</span>
        </span>
        <span className="dst__score">
          <span className="dst__k">Média geral</span>
          <span className="dst__v">{pct(station.average_pct, 1)}</span>
        </span>
        <Icon name="chevron-right" size={18} />
      </span>
    </button>
  );
}

function Grid({ items, onOpen }) {
  return (
    <div className="dst__grid">
      {items.map((s) => (
        <StationCard
          key={s.id}
          areaCode={s.area_code}
          number={s.number}
          title={s.name}
          tags={Array.isArray(s.styles) ? s.styles : []}
          source={sourceLabel(s)}
          myScorePct={s.my_last_pct}
          averagePct={s.average_pct}
          onClick={() => onOpen(s)}
        />
      ))}
    </div>
  );
}

export function StationsScreen({ go }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_dupla_stations"), [backend]);
  const [area, setArea] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("prova");
  const [view, setView] = React.useState("grid");

  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;

  const bank = Array.isArray(data) ? data : [];
  const open = (station) => go("dupla", { estacao: station.id });
  const count = (code) => bank.filter((s) => s.area_code === code).length;
  const needle = plain(q.trim());

  let list = bank.filter(
    (s) => (area === "all" || s.area_code === area) && (!needle || plain([s.name, s.topic, ...(Array.isArray(s.styles) ? s.styles : [])].join(" ")).includes(needle)),
  );
  // "Ordem da prova" = a ordem em que o servidor entrega; "A–Z" = pelo nome
  if (sort === "az") list = [...list].sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));

  const grouped = area === "all" && sort === "prova";
  const groups = grouped ? AREAS.map((a) => [a, list.filter((s) => s.area_code === a.code)]).filter(([, items]) => items.length > 0) : null;
  const known = new Set(AREAS.map((a) => a.code));
  const orphans = grouped ? list.filter((s) => !known.has(s.area_code)) : [];

  return (
    <div className="dst">
      <style>{CSS}</style>
      <p className="dst__lead">Escolha uma estação para treinar em dupla. Cada uma traz o enunciado, os impressos e o checklist PEP.</p>

      <div className="dst__blocks" role="group" aria-label="Resumo por área">
        {AREAS.map((a) => (
          <button key={a.code} type="button" className="dst__block" style={cssVars(a.code)} aria-pressed={area === a.code} onClick={() => setArea(area === a.code ? "all" : a.code)}>
            <div className="dst__block-n">{count(a.code)}</div>
            <div className="dst__block-l">{a.label}</div>
          </button>
        ))}
      </div>

      <div className="dst__bar">
        <div className="dst__controls">
          <div className="dst__search">
            <TextField icon="search" aria-label="Buscar por estação, tema ou queixa" placeholder="Buscar por estação, tema ou queixa" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <SegmentedControl label="Ordenar" value={sort} onChange={setSort} options={[{ value: "prova", label: "Ordem da prova" }, { value: "az", label: "A–Z" }]} />
          <SegmentedControl label="Visualização" value={view} onChange={setView} options={[{ value: "grid", label: "Grade", icon: "layout-grid" }, { value: "list", label: "Lista", icon: "list" }]} />
        </div>
        <div className="dst__tabs" role="group" aria-label="Área">
          <button type="button" className="dst__tab" aria-pressed={area === "all"} onClick={() => setArea("all")}>
            Todas<span className="dst__tab-n">{bank.length}</span>
          </button>
          {AREAS.map((a) => (
            <button key={a.code} type="button" className="dst__tab" style={cssVars(a.code)} aria-pressed={area === a.code} onClick={() => setArea(a.code)}>
              <span className="dst__dot" />
              {a.label}
              <span className="dst__tab-n">{count(a.code)}</span>
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 && (
        <div className="dst__empty">
          <Icon name="search-x" size={28} />
          <div className="dst__empty-t">Nenhuma estação encontrada</div>
          {/* Banco sem nenhuma estação publicada: não há filtro para limpar */}
          {bank.length > 0 && (
            <>
              Tente outro termo ou limpe o filtro de área.
              <div className="dst__empty-a">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ("");
                    setArea("all");
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {list.length > 0 && view === "list" && (
        <div className="dst__list">
          {list.map((s) => (
            <Row key={s.id} station={s} onOpen={() => open(s)} />
          ))}
        </div>
      )}

      {list.length > 0 && view === "grid" && (groups ? (
        <>
          {groups.map(([a, items]) => (
            <section key={a.code} className="dst__section" style={cssVars(a.code)}>
              <h2 className="dst__h">
                <span className="dst__h-dot" />
                {a.label}
                <span className="dst__h-n">{items.length}</span>
              </h2>
              <Grid items={items} onOpen={open} />
            </section>
          ))}
          {orphans.length > 0 && <Grid items={orphans} onOpen={open} />}
        </>
      ) : (
        <Grid items={list} onOpen={open} />
      ))}
    </div>
  );
}
