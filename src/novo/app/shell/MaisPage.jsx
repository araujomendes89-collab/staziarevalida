// Páginas "Mais" e "Preferências" do celular e do tablet (Novas telas, onda 2, 15/10/2026): HomeMais, HomePrefs, TabletMais, TabletPrefs, MobileMais.
// Sem a caixa "Buscar no app" (fora da 1ª entrega, decisão do dono). Os números vêm do banco (useShellCounts: app_gamification_summary e app_today); sem resposta, o selo some.
// A folha "Mais" do celular (pacote MobileMais) está em MaisSheet.jsx.
import React from "react";
import { Avatar, Icon } from "../../ds";
import { AppRealIcon } from "../AppIcons.jsx";
import { useShellCounts } from "./useShellCounts.js";
import { badgeOf, maisSections } from "./navModel.js";
import "./mais.css";

/** Score, nível, tarefas do plano e missões de hoje: os mesmos números dos selos da casca (useShellCounts). Nada de exemplo. */
function useMaisData(route) {
  return useShellCounts(route);
}

const PHASES = [
  [1, "1ª Fase", "Objetiva"],
  [2, "2ª Fase", "Prática"],
];

function PhaseTabs({ phase, setPhase, phase2Locked, label = "Fase do Revalida" }) {
  return (
    <div role="radiogroup" aria-label={label} className="smm-phase">
      {PHASES.map(([n, l, d]) => {
        const lock = phase2Locked && n === 2;
        return (
          <button key={n} type="button" role="radio" aria-checked={phase === n} disabled={lock} aria-disabled={lock ? "true" : undefined} onClick={lock ? undefined : () => setPhase && setPhase(n)}>
            {l}
            <span> · {lock ? "Em breve" : d}</span>
          </button>
        );
      })}
    </div>
  );
}

function Tile({ item, tone, info, data, onPick, current }) {
  const [id, ic, label, key] = item;
  let badge = null;
  if (key === "hoje" && data.planTotal) badge = `${data.planDone}/${data.planTotal}`;
  else if (key === "missoes" && data.missionsTotal) badge = `${data.missionsDone}/${data.missionsTotal}`;
  else if (key === "flash") badge = badgeOf("flash", info);
  return (
    <button type="button" className={`smm-tile smm-tone--${tone}`} aria-current={current ? "page" : undefined} onClick={() => onPick(id)}>
      <span className="smm-ico">{AppRealIcon({ name: ic, size: 30 }) || <Icon name={ic} size={26} />}</span>
      <span className="smm-lbl">{label}</span>
      {badge != null && <span className="smm-badge" aria-label={`${badge} hoje`}>{badge}</span>}
    </button>
  );
}

function MaisView({ route, info, phase, setPhase, phase2Locked, data, symbol, onPick, onOpenPrefs, variant }) {
  const sections = maisSections(phase, { staff: info.isStaff });
  const sub = data.score != null ? (
    <>
      {data.scoreName || "Stazia Score"} <b>{data.score}</b>
      {data.level ? ` · ${data.level}` : ""}
    </>
  ) : null;
  return (
    <>
      <header className="smm-head">
        <h1>Mais</h1>
        <img src={symbol} alt="StaziaMed" />
      </header>
      <section className="smm-user" aria-label="Sua conta">
        <div className="smm-user-row">
          <Avatar name={info.name} size={48} />
          <span className="smm-user-txt">
            <b>{info.name}</b>
            {sub && <small>{sub}</small>}
          </span>
          <button type="button" className="smm-gear" onClick={onOpenPrefs} aria-label="Preferências" title="Preferências">
            {AppRealIcon({ name: "settings", size: 24 })}
          </button>
        </div>
        <PhaseTabs phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} />
      </section>
      <div className={`smm-sections smm-sections--${variant}`}>
        {sections.map((sec) => (
          <section key={sec.id} aria-label={sec.label} className="smm-sec">
            <h2>{sec.label}</h2>
            <div className="smm-grid">
              {sec.items.map((it) => (
                <Tile key={it[0]} item={it} tone={sec.tone} info={info} data={data} onPick={onPick} current={route === it[0]} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

const THEMES = [
  ["light", "Claro"],
  ["dark", "Escuro"],
  ["system", "Do sistema"],
];

function Row({ onClick, children }) {
  return (
    <button type="button" className="smm-row" onClick={onClick}>
      {children}
      <Icon name="chevron-right" size={16} className="smm-chev" />
    </button>
  );
}

export function PrefsView({ info, phase, setPhase, phase2Locked, themeChoice, setTheme, onBack, onPick, onSignOut }) {
  const choice = themeChoice || "light";
  const adminLabel = info.isStaff ? "Administração" : info.isReviewer ? "Revisão médica" : null;
  return (
    <>
      <header className="smm-head smm-head--prefs">
        <button type="button" className="smm-back" onClick={onBack}>
          <Icon name="chevron-left" size={22} />
          Mais
        </button>
        <h1>Preferências</h1>
      </header>
      <section className="smm-grp" aria-label="Sua conta">
        <h2 className="smm-over">Sua conta</h2>
        <div className="smm-list">
          <Row onClick={() => onPick("perfil")}>
            <Avatar name={info.name} size={44} />
            <span className="smm-row-txt">
              <b>{info.name}</b>
              <small>Dados pessoais e acesso</small>
            </span>
          </Row>
          <Row onClick={() => onPick("planos")}>
            <span className="smm-row-ic">{AppRealIcon({ name: "crown", size: 26 })}</span>
            <span className="smm-row-txt">
              <b>Meu Plano</b>
            </span>
          </Row>
          {adminLabel && (
            <Row onClick={() => onPick("admin")}>
              <span className="smm-row-ic">{AppRealIcon({ name: info.isStaff ? "users" : "stamp", size: 26 }) || <Icon name="stamp" size={22} />}</span>
              <span className="smm-row-txt">
                <b>{adminLabel}</b>
                <small>{info.isStaff ? "Visível só para a equipe" : "Visível só para revisores"}</small>
              </span>
            </Row>
          )}
        </div>
      </section>
      <section className="smm-grp" aria-label="Estudo">
        <h2 className="smm-over">Estudo</h2>
        <div className="smm-box">
          <span className="smm-box-t">Fase do Revalida</span>
          <PhaseTabs phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} />
        </div>
      </section>
      <section className="smm-grp" aria-label="Aparência">
        <h2 className="smm-over">Aparência</h2>
        <div role="radiogroup" aria-label="Tema" className="smm-themes">
          {THEMES.map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={choice === v} className={`smm-theme smm-theme--${v}`} onClick={() => setTheme && setTheme(v)}>
              <span className="smm-theme-pv" aria-hidden="true">
                <i />
                <i />
              </span>
              <span>{l}</span>
            </button>
          ))}
        </div>
      </section>
      <button type="button" className="smm-out" onClick={onSignOut}>
        {AppRealIcon({ name: "log-out", size: 22 })}
        Sair da conta
      </button>
    </>
  );
}

/**
 * Página "Mais" (ou "Preferências") sobre o conteúdo, ao lado do trilho (tablet) ou acima da barra de baixo (celular).
 * onClose fecha; escolher uma área leva até ela e fecha.
 */
export function MaisPage({ route, go, info, phase, setPhase, phase2Locked, themeChoice, setTheme, variant, initialView = "mais", symbol, onClose }) {
  const [view, setView] = React.useState(initialView);
  const ref = React.useRef(null);
  const data = useMaisData(route);
  React.useEffect(() => {
    const first = ref.current && ref.current.querySelector("h1");
    if (first) first.focus();
    const k = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  React.useEffect(() => {
    const first = ref.current && ref.current.querySelector("h1");
    if (first) first.focus();
  }, [view]);
  const pick = (id) => {
    onClose();
    go(id);
  };
  return (
    <div ref={ref} className={`smm smm--${variant}`} role="region" aria-label={view === "prefs" ? "Preferências" : "Mais"}>
      <div className="smm-in">
        {view === "mais" ? (
          <MaisView route={route} info={info} phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} data={data} symbol={symbol} onPick={pick} onOpenPrefs={() => setView("prefs")} variant={variant} />
        ) : (
          <PrefsView info={info} phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} themeChoice={themeChoice} setTheme={setTheme} onBack={() => setView("mais")} onPick={pick} onSignOut={() => { onClose(); info.onSignOut && info.onSignOut(); }} />
        )}
      </div>
    </div>
  );
}
