// Banco de estações da 2ª fase (Treinamento em Dupla). Textos e medidas do protótipo (Stations.jsx:19-58), sem "Simulado de
// prova". Cartão e linha (pedido do dono de 17/10): área, nome, grau de dificuldade (só quando a revisão médica gravou; sem
// grau, nenhum selo) e origem ("Revalida 2020 · INEP" ou "Estação inédita"); embaixo, "Sua última nota" e "Média geral".
// Sem o número e sem os temas pequenos (styles): a busca continua procurando neles. Dados reais de `app_dupla_stations()`;
// sem nota fica "—".
// Equipe (catálogo da 013420): os cartões ainda sem conteúdo levam o selo "Aguardando conteúdo" e o filtro "Só com conteúdo",
// ligado por padrão, esconde esses cartões. Cartão ou linha sem conteúdo não abre o Praticar: fica desabilitado (aria-disabled,
// continua no leitor de tela) e, ao tocar, mostra "Conteúdo em preparação" (decisão de 17/10). O aluno nunca recebe cartão sem conteúdo (o banco não entrega) e não vê o filtro.
// Clique numa estação: `go("dupla", { estacao: id })` abre o Praticar com ela escolhida.
import React from "react";
import { Button, Dialog, Icon, SegmentedControl, StationCard, StationLevel, Switch, TextField, useWaitHint, WAIT_HINT } from "../../ds";
import { formatDecimal } from "../../ds/format.js";
import { useSession } from "../session.jsx";
import { isStaffRole, LoadError, Loading, useLoad } from "../admin/common.jsx";
import { AREAS, areaByCode, areaVars, originLabel } from "./labels.js";

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
.dst__tab-n{font:600 12px var(--font-mono);opacity:.75}
.dst__empty{padding:40px 24px;text-align:center;color:var(--text-secondary);background:var(--surface-card);border:1px solid var(--border-subtle);border-radius:var(--radius-xl)}
.dst__empty-t{margin:10px 0 4px;font:600 16px var(--font-sans);color:var(--text-primary)}
.dst__empty-a{margin-top:14px}
.dst__section{display:flex;flex-direction:column;gap:12px}
.dst__h{margin:0;display:flex;align-items:center;gap:10px;font:700 17px var(--font-sans);color:var(--text-primary)}
.dst__h-dot{width:10px;height:10px;border-radius:3px;background:var(--dst-solid)}
.dst__h-n{font:600 12px var(--font-mono);color:var(--text-tertiary)}
.dst__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:14px}
.dst__list{overflow:hidden;background:var(--surface-card);border:1px solid var(--border-subtle);border-radius:var(--radius-xl)}
.dst__row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;width:100%;padding:14px 18px;border:0;border-top:1px solid var(--border-subtle);box-shadow:inset 4px 0 0 var(--dst-solid);background:transparent;text-align:left;cursor:pointer;font:inherit;color:inherit}
.dst__row:first-child{border-top:0}
.dst__row:hover{background:var(--surface-subtle)}
.dst__row-a{display:flex;align-items:center;gap:6px;font:700 12px var(--font-sans);letter-spacing:.04em;text-transform:uppercase;color:var(--dst-ink)}
.dst__row-t{display:block;margin-top:3px;font:700 15px/1.35 var(--font-sans);color:var(--text-primary)}
.dst__row-m{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:6px;font:600 12px var(--font-sans);color:var(--dst-ink)}
.dst__row .osce-level{height:24px;background:var(--surface-subtle)}
.dst__wait{display:inline-flex;align-items:center;height:22px;margin-left:8px;padding:0 8px;border-radius:var(--radius-pill);background:var(--warning-bg);border:1px solid var(--warning-border);color:var(--warning-text);font:700 12px var(--font-sans);letter-spacing:0;text-transform:none;white-space:nowrap}
.dst__only{flex:none}
.dst__row[data-waiting="true"]{cursor:not-allowed}
.dst__row[data-waiting="true"]:hover{background:transparent}
.dst__row[data-waiting="true"] .dst__row-t{color:var(--text-secondary)}
.dst__hint{display:block;margin-top:6px;font:600 12px var(--font-sans);color:var(--warning-text)}
.dst__hint[data-on="false"]{margin:0}
.dst__scores{display:flex;gap:18px;align-items:center}
.dst__score{text-align:right}
.dst__k{display:block;font:600 12px var(--font-sans);letter-spacing:.05em;text-transform:uppercase;color:var(--text-tertiary)}
.dst__v{font:600 15px var(--font-mono);color:var(--text-primary)}
.dst__v--mine{color:var(--dst-ink)}
.dst__v[data-empty="true"]{color:var(--text-tertiary)}
@media (max-width:640px){
  /* celular: a barra de busca e filtros não gruda no topo (grudada, ocupava ~300 px dos 844 da tela e sobrava pouco para a lista) */
  .dst__bar{position:static}
  .dst__row{grid-template-columns:minmax(0,1fr);padding:14px 14px 14px 18px}
  .dst__scores{justify-content:flex-start}
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

/** Cartão do catálogo ainda sem conteúdo (013420): só a equipe o recebe. */
const awaiting = (s) => s?.content_status === "awaiting_content";

const pct = (value, digits) => (typeof value === "number" && Number.isFinite(value) ? `${formatDecimal(value, digits)}%` : "—");

function Row({ station, onOpen, staff }) {
  const area = areaByCode(station.area_code);
  const mine = typeof station.my_last_pct === "number" && Number.isFinite(station.my_last_pct);
  const waiting = staff && awaiting(station);
  const [hint, showHint] = useWaitHint();
  const hintId = React.useId();
  const props = waiting ? { "aria-disabled": "true", "aria-describedby": hintId, "data-waiting": "true", onClick: showHint } : { onClick: onOpen };
  return (
    <button type="button" className="dst__row" style={cssVars(station.area_code)} {...props}>
      <span style={{ minWidth: 0 }}>
        {(area || (staff && awaiting(station))) && (
          <span className="dst__row-a">
            {area?.card}
            {waiting && <span className="dst__wait">Aguardando conteúdo</span>}
          </span>
        )}
        <span className="dst__row-t">{station.name}</span>
        {waiting && (
          <span id={hintId} role="status" className="dst__hint" data-on={hint}>
            {hint ? WAIT_HINT : ""}
          </span>
        )}
        <span className="dst__row-m">
          <StationLevel level={station.difficulty} />
          <span>{originLabel(station)}</span>
        </span>
      </span>
      <span className="dst__scores">
        <span className="dst__score">
          <span className="dst__k">Sua última nota</span>
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

function Grid({ items, onOpen, staff }) {
  return (
    <div className="dst__grid">
      {items.map((s) => (
        <StationCard
          key={s.id}
          areaCode={s.area_code}
          title={s.name}
          difficulty={s.difficulty}
          source={originLabel(s)}
          awaitingContent={staff && awaiting(s)}
          myScorePct={s.my_last_pct}
          averagePct={s.average_pct}
          onClick={() => onOpen(s)}
        />
      ))}
    </div>
  );
}

export function StationsScreen({ go }) {
  const { backend, boot } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_dupla_stations"), [backend]);
  // Banco de estações único (decisão do dono, 16/10): quem pode treinar sozinho (as telas da 2ª fase com dados, hoje só a equipe)
  // escolhe entre sozinho e em dupla; os demais vão direto para a dupla, como antes.
  const canSolo = isStaffRole(boot?.role);
  const [choosing, setChoosing] = React.useState(null);
  const [area, setArea] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("prova");
  const [view, setView] = React.useState("grid");
  // "Só com conteúdo": só para a equipe, ligado por padrão (pedido de 17/10)
  const [onlyContent, setOnlyContent] = React.useState(true);

  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;

  const all = Array.isArray(data) ? data : [];
  const bank = canSolo && onlyContent ? all.filter((s) => !awaiting(s)) : all;
  const hiddenByContent = all.length - bank.length;
  const open = (station) => (canSolo ? setChoosing(station) : go("dupla", { estacao: station.id }));
  const count = (code) => bank.filter((s) => s.area_code === code).length;
  const needle = plain(q.trim());

  // A busca procura também nos temas pequenos (styles), que o cartão não mostra mais.
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
      {choosing && (
        <Dialog
          title="Como você quer treinar esta estação?"
          description={[choosing.name, areaByCode(choosing.area_code)?.label].filter(Boolean).join(" · ")}
          onClose={() => setChoosing(null)}
          actions={
            <>
              <Button variant="secondary" icon="user" onClick={() => go("estacao", { id: choosing.id })}>Sozinho</Button>
              <Button icon="users" onClick={() => go("dupla", { estacao: choosing.id })}>Em dupla</Button>
            </>
          }
        />
      )}

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
          {canSolo && (
            <div className="dst__only">
              <Switch
                label="Só com conteúdo"
                description={hiddenByContent > 0 ? `Escondidos: ${hiddenByContent} aguardando conteúdo` : "Só a equipe vê esta opção"}
                checked={onlyContent}
                onChange={(e) => setOnlyContent(e.target.checked)}
              />
            </div>
          )}
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
          {/* Equipe: tudo escondido por "Só com conteúdo" */}
          {bank.length === 0 && hiddenByContent > 0 && <>Desligue “Só com conteúdo” para ver os cartões aguardando conteúdo.</>}
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
            <Row key={s.id} station={s} staff={canSolo} onOpen={() => open(s)} />
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
              <Grid items={items} onOpen={open} staff={canSolo} />
            </section>
          ))}
          {orphans.length > 0 && <Grid items={orphans} onOpen={open} staff={canSolo} />}
        </>
      ) : (
        <Grid items={list} onOpen={open} staff={canSolo} />
      ))}
    </div>
  );
}
