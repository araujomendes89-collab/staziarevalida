import React from "react";
import { Badge, Icon, EmptyState, SegmentedControl, TextField, Button } from "../../ds";
import { useSession } from "../session.jsx";
import { useLoad, Loading, LoadError } from "../admin/common.jsx";
import { fase2Api } from "./api.js";
import { AREAS, fmtScore, fmtMinutes, getArea } from "./labels.js";
import todas from "../../ds/area-icons/todas.svg";
import clinica from "../../ds/area-icons/clinica-medica.svg";
import cirurgia from "../../ds/area-icons/cirurgia.svg";
import go from "../../ds/area-icons/gineco-obstetricia.svg";
import pediatria from "../../ds/area-icons/pediatria.svg";
import preventiva from "../../ds/area-icons/preventiva-mfc.svg";
import "./fase2.css";

const AREA_ICONS = {
  "Clínica Médica": clinica,
  "Cirurgia Geral": cirurgia,
  "Ginecologia e Obstetrícia": go,
  "Pediatria": pediatria,
  "Medicina de Família e Comunidade": preventiva,
};

function formatSource(s) {
  const inst = (s.institution || "").trim();
  if (inst.toUpperCase() === "INEP") {
    return s.year ? `INEP · ${s.year}` : "INEP";
  }
  return "StaziaMed";
}

function StationCardItem({ station: s, go }) {
  const areaInfo = getArea(s.area);
  const isLocked = Boolean(s.locked);
  const icon = AREA_ICONS[s.area] || todas;
  const source = formatSource(s);

  return (
    <button
      key={s.id}
      type="button"
      className={`f2-station-card${isLocked ? " f2-station-card--locked" : ""}`}
      disabled={isLocked}
      onClick={() => !isLocked && go("estacao", { id: s.id })}
      aria-label={`${s.name} - ${s.area}${isLocked ? " (Plano Pro)" : ""}`}
      style={{
        "--f2-card-accent": `var(${areaInfo.token})`,
        "--f2-card-bg": `var(${areaInfo.bgToken || "--surface-card"})`,
        "--f2-card-text": `var(${areaInfo.textToken || "--text-primary"})`,
      }}
    >
      <div className="f2-station-card__header">
        <span
          className={`f2-station-card__tile f2-station-card__tile--${areaInfo.color}`}
          aria-hidden="true"
        >
          <img src={icon} alt="" width={26} height={26} />
        </span>
        <div className="f2-station-card__head-info">
          <div className="f2-station-card__head-top">
            <span
              className="f2-station-card__area"
              style={{ color: `var(${areaInfo.textToken || areaInfo.token})` }}
            >
              {s.area}
            </span>
            {isLocked && (
              <Badge tone="pro" size="sm">
                Plano Pro
              </Badge>
            )}
          </div>
          <h3 className="f2-station-card__title">{s.name}</h3>
        </div>
      </div>

      <div className="f2-station-card__tags">
        {s.topic && <span className="f2-station-tag">{s.topic}</span>}
        {s.setting && <span className="f2-station-tag">{s.setting}</span>}
        {s.duration_ms && (
          <span className="f2-station-tag f2-station-tag--meta">
            <Icon name="timer" size={12} />
            {fmtMinutes(s.duration_ms)}
          </span>
        )}
      </div>

      <div className="f2-station-card__footer">
        <span className="f2-station-card__source">{source}</span>
        <div className="f2-station-card__scores">
          <div className="f2-station-score">
            <span className="f2-station-score__label">Sua última</span>
            <span
              className="f2-station-score__val"
              data-empty={s.my_last == null}
            >
              {fmtScore(s.my_last)}
            </span>
          </div>
          <div className="f2-station-score">
            <span className="f2-station-score__label">Melhor nota</span>
            <span
              className="f2-station-score__val"
              data-empty={s.my_best == null}
            >
              {fmtScore(s.my_best)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function StationRowItem({ station: s, go }) {
  const areaInfo = getArea(s.area);
  const isLocked = Boolean(s.locked);
  const icon = AREA_ICONS[s.area] || todas;
  const source = formatSource(s);

  return (
    <button
      key={s.id}
      type="button"
      className={`f2-station-row${isLocked ? " f2-station-row--locked" : ""}`}
      disabled={isLocked}
      onClick={() => !isLocked && go("estacao", { id: s.id })}
      aria-label={`${s.name} - ${s.area}${isLocked ? " (Plano Pro)" : ""}`}
      style={{
        "--f2-card-accent": `var(${areaInfo.token})`,
        "--f2-card-bg": `var(${areaInfo.bgToken || "--surface-card"})`,
        "--f2-card-text": `var(${areaInfo.textToken || "--text-primary"})`,
      }}
    >
      <span
        className={`f2-station-row__tile f2-station-row__tile--${areaInfo.color}`}
        aria-hidden="true"
      >
        <img src={icon} alt="" width={24} height={24} />
      </span>

      <div className="f2-station-row__main">
        <div className="f2-station-row__head-top">
          <span
            className="f2-station-row__area"
            style={{ color: `var(${areaInfo.textToken || areaInfo.token})` }}
          >
            {s.area}
          </span>
          {isLocked && (
            <Badge tone="pro" size="sm">
              Plano Pro
            </Badge>
          )}
        </div>
        <div className="f2-station-row__title">{s.name}</div>
        <div className="f2-station-row__meta">
          {s.topic && <span className="f2-station-tag">{s.topic}</span>}
          {s.setting && <span className="f2-station-tag">{s.setting}</span>}
          {s.duration_ms && (
            <span className="f2-station-tag f2-station-tag--meta">
              <Icon name="timer" size={12} />
              {fmtMinutes(s.duration_ms)}
            </span>
          )}
          <span className="f2-station-row__source">{source}</span>
        </div>
      </div>

      <div className="f2-station-row__scores">
        <div className="f2-station-score">
          <span className="f2-station-score__label">Sua última</span>
          <span
            className="f2-station-score__val"
            data-empty={s.my_last == null}
          >
            {fmtScore(s.my_last)}
          </span>
        </div>
        <div className="f2-station-score">
          <span className="f2-station-score__label">Melhor nota</span>
          <span
            className="f2-station-score__val"
            data-empty={s.my_best == null}
          >
            {fmtScore(s.my_best)}
          </span>
        </div>
        <Icon name="chevron-right" size={18} className="f2-station-row__arrow" />
      </div>
    </button>
  );
}

export function Fase2Stations({ go }) {
  const { backend } = useSession();
  const api = React.useMemo(() => fase2Api(backend), [backend]);

  const { data: stations, loading, error, reload } = useLoad(() => api.stations(), [api]);

  const [search, setSearch] = React.useState("");
  const [selectedArea, setSelectedArea] = React.useState("Todas");
  const [statusFilter, setStatusFilter] = React.useState("todas"); // todas | novas | feitas
  const [sort, setSort] = React.useState("az"); // az | area
  const [view, setView] = React.useState("grid"); // grid | list

  if (loading) {
    return (
      <div className="f2-container" style={{ padding: "var(--space-6) 0" }}>
        <Loading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="f2-container" style={{ padding: "var(--space-6) 0" }}>
        <LoadError error={error} retry={reload} />
      </div>
    );
  }

  const allStations = Array.isArray(stations) ? stations : [];

  // Se o banco não tem nenhuma estação aprovada
  if (allStations.length === 0) {
    return (
      <div className="f2-container">
        <EmptyState
          icon="clipboard-x"
          title="Nenhuma estação aprovada no momento"
          description="O catálogo de estações práticas da 2ª fase é disponibilizado conforme a revisão médica valida os casos clínicos."
        />
      </div>
    );
  }

  // Contagem por área
  const areaCounts = allStations.reduce((acc, s) => {
    acc[s.area] = (acc[s.area] || 0) + 1;
    return acc;
  }, {});

  // Filtragem
  const query = search.trim().toLowerCase();
  const filtered = allStations.filter((s) => {
    // Filtro de área
    if (selectedArea !== "Todas" && s.area !== selectedArea) {
      return false;
    }

    // Filtro de status
    if (statusFilter === "novas" && (s.my_count || 0) > 0) {
      return false;
    }
    if (statusFilter === "feitas" && (!s.my_count || s.my_count === 0)) {
      return false;
    }

    // Busca textual
    if (query) {
      const matchName = (s.name || "").toLowerCase().includes(query);
      const matchTopic = (s.topic || "").toLowerCase().includes(query);
      const matchSetting = (s.setting || "").toLowerCase().includes(query);
      const matchInst = (s.institution || "").toLowerCase().includes(query);
      if (!matchName && !matchTopic && !matchSetting && !matchInst) {
        return false;
      }
    }

    return true;
  });

  // Ordenação
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "az") {
      return (a.name || "").localeCompare(b.name || "", "pt-BR");
    }
    // "area": agrupa pela ordem das especialidades em AREAS, depois alfabético por nome
    const aIdx = AREAS.findIndex((x) => x.name === a.area);
    const bIdx = AREAS.findIndex((x) => x.name === b.area);
    const diff = (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    if (diff !== 0) return diff;
    return (a.name || "").localeCompare(b.name || "", "pt-BR");
  });

  const isGroupedByArea = sort === "area" && selectedArea === "Todas";
  const areaGroups = isGroupedByArea
    ? AREAS.map((a) => ({
        area: a,
        items: sorted.filter((s) => s.area === a.name),
      })).filter((g) => g.items.length > 0)
    : null;
  const knownAreas = new Set(AREAS.map((a) => a.name));
  const orphanItems = isGroupedByArea ? sorted.filter((s) => !knownAreas.has(s.area)) : [];

  const clearFilters = () => {
    setSearch("");
    setSelectedArea("Todas");
    setStatusFilter("todas");
  };

  return (
    <div className="f2-container">
      <p className="f2-stations-lead">
        Escolha uma estação clínica para treinar. Cada caso traz o enunciado, os impressos e o checklist PEP.
      </p>

      {/* Linha superior: Busca e Status de conclusão */}
      <div className="f2-stations-top">
        <div className="f2-stations-search">
          <TextField
            icon="search"
            aria-label="Buscar estação"
            placeholder="Buscar por tema, queixa, cenário ou instituição…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="f2-stations-status">
          <SegmentedControl
            label="Status de conclusão"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "todas", label: "Todas" },
              { value: "novas", label: "Não feitas" },
              { value: "feitas", label: "Já feitas" },
            ]}
          />
        </div>
      </div>

      {/* Filtro de áreas com chips e ícones */}
      <div className="f2-area-chips" role="group" aria-label="Filtrar por área">
        <button
          type="button"
          className={`f2-area-chip${selectedArea === "Todas" ? " f2-area-chip--active" : ""}`}
          aria-pressed={selectedArea === "Todas"}
          onClick={() => setSelectedArea("Todas")}
        >
          <span className="f2-area-chip__tile f2-area-chip__tile--todas" aria-hidden="true">
            <img src={todas} alt="" width={20} height={20} />
          </span>
          <span className="f2-area-chip__label">Todas</span>
          <span className="f2-area-chip__count">{allStations.length}</span>
        </button>

        {AREAS.map((a) => {
          const isSelected = selectedArea === a.name;
          const count = areaCounts[a.name] || 0;
          return (
            <button
              key={a.name}
              type="button"
              className={`f2-area-chip f2-area-chip--${a.color}${isSelected ? " f2-area-chip--active" : ""}`}
              aria-pressed={isSelected}
              onClick={() => setSelectedArea(a.name)}
            >
              <span className={`f2-area-chip__tile f2-area-chip__tile--${a.color}`} aria-hidden="true">
                <img src={AREA_ICONS[a.name]} alt="" width={20} height={20} />
              </span>
              <span className="f2-area-chip__label">{a.name}</span>
              <span className="f2-area-chip__count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Barra de contagem e alternadores */}
      <div className="f2-stations-bar">
        <span className="f2-stations-count">
          <strong>{filtered.length}</strong> {filtered.length === 1 ? "estação" : "estações"}
        </span>

        <div className="f2-stations-bar__actions">
          {/* Alternador A-Z | Por área */}
          <div className="f2-segmented" role="radiogroup" aria-label="Ordem">
            <button
              type="button"
              role="radio"
              aria-checked={sort === "az"}
              aria-pressed={sort === "az"}
              className={`f2-segmented__btn${sort === "az" ? " f2-segmented__btn--active" : ""}`}
              onClick={() => setSort("az")}
            >
              A–Z
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={sort === "area"}
              aria-pressed={sort === "area"}
              className={`f2-segmented__btn${sort === "area" ? " f2-segmented__btn--active" : ""}`}
              onClick={() => setSort("area")}
            >
              Por área
            </button>
          </div>

          {/* Alternador Grade | Lista */}
          <div className="f2-segmented" role="radiogroup" aria-label="Visualização">
            <button
              type="button"
              role="radio"
              aria-checked={view === "grid"}
              aria-pressed={view === "grid"}
              className={`f2-segmented__btn${view === "grid" ? " f2-segmented__btn--active" : ""}`}
              onClick={() => setView("grid")}
            >
              Grade
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={view === "list"}
              aria-pressed={view === "list"}
              className={`f2-segmented__btn${view === "list" ? " f2-segmented__btn--active" : ""}`}
              onClick={() => setView("list")}
            >
              Lista
            </button>
          </div>
        </div>
      </div>

      {/* Exibição de Estações ou Estado Vazio */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nenhuma estação com esses filtros"
          description="Tente ajustar a busca ou limpar os filtros de área e status."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Limpar filtros
            </Button>
          }
        />
      ) : isGroupedByArea && areaGroups ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {areaGroups.map((g) => (
            <section key={g.area.name} className="f2-area-section">
              <h2 className="f2-area-section__title">
                <span
                  className="f2-area-section__dot"
                  style={{ background: `var(${g.area.token})` }}
                />
                {g.area.name}
                <span className="f2-area-section__count">{g.items.length}</span>
              </h2>

              {view === "grid" ? (
                <div className="f2-stations-grid">
                  {g.items.map((s) => (
                    <StationCardItem key={s.id} station={s} go={go} />
                  ))}
                </div>
              ) : (
                <div className="f2-stations-list">
                  {g.items.map((s) => (
                    <StationRowItem key={s.id} station={s} go={go} />
                  ))}
                </div>
              )}
            </section>
          ))}

          {orphanItems.length > 0 && (
            <section className="f2-area-section">
              <h2 className="f2-area-section__title">
                Outras áreas
                <span className="f2-area-section__count">{orphanItems.length}</span>
              </h2>
              {view === "grid" ? (
                <div className="f2-stations-grid">
                  {orphanItems.map((s) => (
                    <StationCardItem key={s.id} station={s} go={go} />
                  ))}
                </div>
              ) : (
                <div className="f2-stations-list">
                  {orphanItems.map((s) => (
                    <StationRowItem key={s.id} station={s} go={go} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="f2-stations-grid">
          {sorted.map((s) => (
            <StationCardItem key={s.id} station={s} go={go} />
          ))}
        </div>
      ) : (
        <div className="f2-stations-list">
          {sorted.map((s) => (
            <StationRowItem key={s.id} station={s} go={go} />
          ))}
        </div>
      )}

      {/* Rodapé com contagem honesta */}
      <div className="f2-stations-footer">
        {filtered.length === 1 ? "1 estação aprovada" : `${filtered.length} estações aprovadas`}
        {filtered.length !== allStations.length && ` (de ${allStations.length} no total)`}
      </div>
    </div>
  );
}
