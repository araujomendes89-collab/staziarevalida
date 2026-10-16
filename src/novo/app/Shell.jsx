// Estrutura do app novo (Novas telas, ondas 0 e 1, 15/10/2026): menu em sanfona (computador), trilho de ícones com
// painel (tablet, 834 px), barra de abas + "Mais" (celular) e cabeçalho. Mesmos endereços, nomes e permissões de antes
// (Administração só para equipe, Revisão médica só para revisor). Os dados vêm de `info`; nada de exemplo.
// Modelo do menu em shell/navModel.js; estilos em shell/shell.css (só tokens do design system).
import React from "react";
import { Icon, Avatar, IconButton } from "../ds";
import { RI_CSS } from "../prototype/RealIcons.jsx";
import { AppRealIcon } from "./AppIcons.jsx";
import { FULL, badgeKind, badgeOf, configItems, groupBadge, groupOfRoute, groupsOf, mobileTabs } from "./shell/navModel.js";
import { MaisSheet } from "./shell/MaisSheet.jsx";
import { inicioCelular, maisCelular } from "./shell/cascaConfig.js";
import { useShellCounts } from "./shell/useShellCounts.js";
import { MaisPage } from "./shell/MaisPage.jsx";
import { useLayout, useMQ, useMobile } from "./shell/useLayout.js";
import "./shell/shell.css";

export { useMQ, useMobile, useLayout };

// Ícone ilustrado do app quando existe; senão o ícone do design system
const Ic = ({ name, size = 22 }) => <span className="smn-ic" aria-hidden="true">{AppRealIcon({ name, size }) || <Icon name={name} size={size - 4} />}</span>;
const phaseLabel = (phase) => (phase === 1 ? "1ª fase · objetiva" : "2ª fase · prática");
const logoSrc = (theme, kind) => (kind === "symbol" ? (theme === "dark" ? "/brand/simbolo-escuro-64w.png" : "/brand/simbolo-64w.png") : theme === "dark" ? "/brand/horizontal-escuro-480w.png" : "/brand/horizontal-480w.png");

/** Selo no desenho do pacote: cinza (progresso do dia, ex. 0/2), vermelho (pendências, ex. erros a revisar) ou violeta (IA). */
function Badge({ b }) {
  if (!b || b.text == null) return null;
  if (b.kind === "ai") return <span className="smn-badge smn-badge--ai">IA</span>;
  const label = b.kind === "danger" ? `${b.text} pendentes` : `${b.text} feitas hoje`;
  return (
    <span className={`smn-badge smn-badge--${b.kind || "neutral"}`} aria-label={label}>
      {b.text}
    </span>
  );
}
const itemBadge = (id, info) => {
  const text = badgeOf(id, info);
  return text == null ? null : { text, kind: badgeKind(id) };
};

// ---------------------------------------------------------------- computador: barra lateral em sanfona (recolhível)
const COL_KEY = "smf-col";
function readCollapsed(narrow) {
  try {
    const v = localStorage.getItem(COL_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch (e) {
    /* sem armazenamento: usa o padrão */
  }
  return narrow; // padrão: expandido; em tela web estreita (até 1280 px) começa recolhido
}

/** Grupo da sanfona (botão + itens). No rodapé ("Configurações") os itens abrem para cima, como no pacote. */
function SideGroup({ g, route, go, info, open, current, collapsed, onToggle, up = false }) {
  if (g.direct) {
    const on = route === g.direct;
    return (
      <button type="button" className={`smn-grp${on ? " is-current" : ""}`} aria-current={on ? "page" : undefined} aria-label={g.label} title={collapsed ? g.label : undefined} onClick={() => go(g.direct)}>
        <Ic name={g.icon} size={26} />
        {!collapsed && <span className="smn-lbl">{g.label}</span>}
        {g.badgeText && (collapsed ? <span className="smn-dot smn-dot--ai" aria-hidden="true" /> : <Badge b={{ text: g.badgeText, kind: "ai" }} />)}
      </button>
    );
  }
  const isOpen = !collapsed && open;
  const gb = groupBadge(g, info);
  const sub = isOpen && (
    <div className={`smn-sub${up ? " smn-sub--up" : ""}`} id={`smn-sub-${g.id}`} role="group" aria-label={g.label}>
      {g.items.map(([id, ic, l]) => (
        <button key={id} type="button" className="smn-item" aria-current={route === id ? "page" : undefined} onClick={() => go(id)}>
          <Ic name={ic} size={22} />
          <span className="smn-lbl">{l}</span>
          <Badge b={itemBadge(id, info)} />
        </button>
      ))}
    </div>
  );
  return (
    <div className="smn-grpwrap">
      {up && sub}
      <button
        type="button"
        className={`smn-grp${current && !isOpen ? " is-current" : ""}${isOpen ? " is-open" : ""}`}
        aria-expanded={isOpen}
        aria-controls={isOpen ? `smn-sub-${g.id}` : undefined}
        aria-label={g.label}
        title={collapsed ? g.label : undefined}
        onClick={onToggle}
      >
        <Ic name={g.icon} size={26} />
        {!collapsed && <span className="smn-lbl">{g.label}</span>}
        {gb && !isOpen && (collapsed ? <span className={`smn-dot smn-dot--${gb.kind}`} aria-hidden="true" /> : <Badge b={gb} />)}
        {!collapsed && <Icon name="chevron-right" size={16} className={`smn-chev${up ? " smn-chev--up" : ""}`} />}
      </button>
      {!up && sub}
    </div>
  );
}

function Sidebar({ route, go, phase, info, theme, collapsed, setCollapsed }) {
  const groups = groupsOf(phase, { staff: info.isStaff });
  const config = { id: "config", label: "Configurações", icon: "settings", items: [...configItems(info), ["perfil", "settings", "Preferências"]] };
  const current = groupOfRoute(route, phase) || (config.items.some(([id]) => id === route) ? "config" : null);
  const [open, setOpen] = React.useState(current);
  React.useEffect(() => {
    if (current) setOpen(current);
  }, [current]);
  const toggleLabel = collapsed ? "Expandir menu" : "Recolher menu";
  // pacote: com o menu recolhido, tocar num grupo abre o menu e o grupo
  const onToggle = (id) => () => {
    if (collapsed) {
      setCollapsed(false);
      return setOpen(id);
    }
    setOpen(open === id ? null : id);
  };
  const phaseText = phase === 1 ? "1ª fase · Objetiva" : "2ª fase · Prática";

  return (
    <nav className={`smn-side${collapsed ? " is-collapsed" : ""}`} aria-label="Navegação principal">
      <style>{RI_CSS}</style>
      <button type="button" className="smn-toggle" onClick={() => setCollapsed(!collapsed)} aria-label={toggleLabel} title={toggleLabel} aria-expanded={!collapsed} aria-controls="smn-side-body">
        <Icon name="chevron-left" size={14} className="smn-toggle-ic" />
      </button>
      <button type="button" className="smn-logo" onClick={() => go(phase === 2 ? "home2" : "home")} aria-label="StaziaMed, início" title={collapsed ? "StaziaMed, início" : undefined}>
        {collapsed ? <img src={logoSrc(theme, "symbol")} alt="" style={{ height: 36, width: "auto" }} /> : <img src={logoSrc(theme)} alt="StaziaMed Revalida" />}
      </button>
      <div id="smn-side-body" style={{ display: "contents" }}>
        <div className="smn-userwrap">
          <button type="button" className="smn-user" onClick={() => go("perfil")} aria-label={`Conta de ${info.name}, ${phaseLabel(phase)}`} title={collapsed ? info.name : undefined}>
            <Avatar name={info.name} size={36} />
            {!collapsed && (
              <>
                <span className="smn-grow">
                  <b>{info.name}</b>
                  <small>
                    <i className="smn-phase-dot" aria-hidden="true" />
                    {phaseText}
                  </small>
                </span>
                <Icon name="chevrons-up-down" size={16} style={{ color: "var(--text-tertiary)" }} />
              </>
            )}
          </button>
        </div>
        <div className="smn-list">
          {groups.map((g) => (
            <SideGroup key={g.id} g={g} route={route} go={go} info={info} open={open === g.id} current={current === g.id} collapsed={collapsed} onToggle={onToggle(g.id)} />
          ))}
        </div>
        <div className="smn-foot">
          <SideGroup g={config} route={route} go={go} info={info} open={open === "config"} current={current === "config"} collapsed={collapsed} onToggle={onToggle("config")} up />
          <button type="button" className="smn-grp" aria-label="Sair" title={collapsed ? "Sair" : undefined} onClick={() => info.onSignOut && info.onSignOut()}>
            <Ic name="log-out" size={26} />
            {!collapsed && <span className="smn-lbl">Sair</span>}
          </button>
        </div>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------- tablet: trilho de ícones com painel
function Rail({ route, go, phase, setPhase, phase2Locked, info, theme, setTheme }) {
  const groups = groupsOf(phase, { staff: info.isStaff });
  const current = groupOfRoute(route, phase);
  const [openId, setOpenId] = React.useState(null);
  const [top, setTop] = React.useState(16);
  const [more, setMore] = React.useState(false); // false | "mais" | "prefs"
  const btnRefs = React.useRef({});
  const panelRef = React.useRef(null);
  React.useEffect(() => {
    setOpenId(null);
    setMore(false);
  }, [route]);
  React.useEffect(() => {
    if (!openId) return undefined;
    const first = panelRef.current && panelRef.current.querySelector("button");
    if (first) first.focus();
    const key = (e) => {
      if (e.key === "Escape") {
        const id = openId;
        setOpenId(null);
        btnRefs.current[id] && btnRefs.current[id].focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [openId]);
  const toggle = (g) => {
    if (g.direct) return go(g.direct);
    if (openId === g.id) return setOpenId(null);
    const el = btnRefs.current[g.id];
    if (el) setTop(Math.max(12, Math.min(el.getBoundingClientRect().top - 8, window.innerHeight - 40 - g.items.length * 48 - 60)));
    setOpenId(g.id);
  };
  const opened = groups.find((g) => g.id === openId);

  return (
    <>
      <nav className="smn-rail" aria-label="Navegação principal">
        <style>{RI_CSS}</style>
        <button type="button" className="smn-logo" onClick={() => go(phase === 2 ? "home2" : "home")} aria-label="StaziaMed, início">
          <img src={logoSrc(theme, "symbol")} alt="" />
        </button>
        <button type="button" className="smn-hdr-btn smn-rail-av" onClick={() => go("perfil")} aria-label={`Conta de ${info.name}`}>
          <Avatar name={info.name} size={40} />
        </button>
        {groups.map((g) => {
          const on = current === g.id;
          const gb = groupBadge(g, info);
          return (
            <button
              key={g.id}
              ref={(el) => (btnRefs.current[g.id] = el)}
              type="button"
              className={`smn-rb${on ? " is-current" : ""}`}
              aria-current={on && g.direct ? "page" : undefined}
              aria-haspopup={g.direct ? undefined : "true"}
              aria-expanded={g.direct ? undefined : openId === g.id}
              aria-label={g.direct === "tutor" ? "Perguntar ao tutor" : g.label}
              onClick={() => toggle(g)}
            >
              <Ic name={g.icon} size={26} />
              <span>{g.short}</span>
              {gb && gb.kind === "danger" && (
                <span className="smn-rb-badge" aria-label={`${gb.text} pendentes`}>
                  {gb.text}
                </span>
              )}
            </button>
          );
        })}
        <div className="smn-rail-sp" />
        <hr className="smn-rail-hr" aria-hidden="true" />
        <button type="button" className={`smn-rb${more === "mais" ? " is-current" : ""}`} aria-label="Mais" aria-expanded={more === "mais"} onClick={() => { setOpenId(null); setMore((m) => (m === "mais" ? false : "mais")); }}>
          <MoreGrid />
          <span>Mais</span>
        </button>
        <button type="button" className={`smn-rb${more === "prefs" || route === "perfil" ? " is-current" : ""}`} aria-label="Preferências" aria-expanded={more === "prefs"} onClick={() => { setOpenId(null); setMore((m) => (m === "prefs" ? false : "prefs")); }}>
          {AppRealIcon({ name: "settings", size: 26 }) || <Icon name="settings" size={22} />}
          <span>Preferências</span>
        </button>
      </nav>
      {opened && (
        <>
          <div className="smn-more-back" style={{ background: "transparent", zIndex: 44 }} onClick={() => setOpenId(null)} aria-hidden="true" />
          <div className="smn-fly" ref={panelRef} role="group" aria-label={opened.label} style={{ top }}>
            <h2>{opened.label}</h2>
            {opened.items.map(([id, ic, l]) => (
              <button key={id} type="button" className="smn-item" aria-current={route === id ? "page" : undefined} onClick={() => go(id)}>
                <Ic name={ic} size={22} />
                <span className="smn-lbl">{l}</span>
                <Badge b={itemBadge(id, info)} />
              </button>
            ))}
          </div>
        </>
      )}
      {more && <MaisPage key={more} route={route} go={go} info={info} phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} themeChoice={info.themeChoice} setTheme={setTheme} variant="tablet" initialView={more} symbol={logoSrc(theme, "symbol")} onClose={() => setMore(false)} />}
    </>
  );
}

// Quatro quadradinhos coloridos do botão "Mais" (no desenho do pacote)
function MoreGrid({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="2.5" fill="var(--teal-400)" />
      <rect x="13" y="3" width="8" height="8" rx="2.5" fill="var(--violet-600)" />
      <rect x="3" y="13" width="8" height="8" rx="2.5" fill="var(--orange-500)" />
      <rect x="13" y="13" width="8" height="8" rx="2.5" fill="var(--navy-900)" />
    </svg>
  );
}

// ---------------------------------------------------------------- celular: barra de abas
// Pacote (HomeMobileCompact): Início, Questões, Tutor (botão redondo roxo no meio), Revisar (selo vermelho = questões erradas a revisar), Mais.
// "Mais" abre a folha que sobe de baixo (MobileMais) ou a página "Mais" (HomeMais), conforme cascaConfig.js.
function MobileTabs({ route, go, phase, setPhase, phase2Locked, info, theme, setTheme }) {
  const [more, setMore] = React.useState(false);
  const close = React.useCallback(() => setMore(false), []);
  React.useEffect(() => setMore(false), [route]);
  const tabs = mobileTabs(phase);
  const current = groupOfRoute(route, phase);
  const onTab = (t) => t[3] != null && t[3] === current;
  const moreOn = phase === 1 && !tabs.some(onTab) && !tabs.some((t) => t[0] === route);
  const sheet = maisCelular() === "folha";
  const moreProps = { route, go, info, phase, setPhase, phase2Locked, themeChoice: info.themeChoice, setTheme, symbol: logoSrc(theme, "symbol"), onClose: close };
  return (
    <>
      {more && phase === 1 && (sheet ? <MaisSheet {...moreProps} /> : <MaisPage {...moreProps} variant="mobile" />)}
      <nav className="smn-tabs" aria-label="Navegação principal">
        {tabs.map((t) => {
          const [id, ic, l, , badgeFrom] = t;
          const on = onTab(t) || route === id;
          const n = badgeFrom ? badgeOf(badgeFrom, info) : null;
          if (id === "tutor") {
            return (
              <button key={id} type="button" className={`smn-tab smn-tab--fab${on ? " is-current" : ""}`} aria-label={l} aria-current={on ? "page" : undefined} onClick={() => go(id)}>
                <span className="smn-fab" aria-hidden="true">
                  <Icon name="sparkles" size={26} />
                </span>
                <span className="smn-tab-l">{l}</span>
              </button>
            );
          }
          return (
            <button key={id} type="button" className={`smn-tab${on ? " is-current" : ""}`} aria-label={n ? `${l}, ${n} ${n === 1 ? "questão errada" : "questões erradas"} para revisar` : l} aria-current={on ? "page" : undefined} onClick={() => go(id)}>
              <span className="smn-tab-pill">
                {AppRealIcon({ name: ic, size: 24 }) || <Icon name={ic} size={22} />}
                {n ? <span className="smn-tab-badge" aria-hidden="true">{n}</span> : null}
              </span>
              <span className="smn-tab-l">{l}</span>
            </button>
          );
        })}
        {phase === 1 && (
          <button type="button" className={`smn-tab${more || moreOn ? " is-current" : ""}`} aria-label="Mais" aria-haspopup="dialog" aria-expanded={more} onClick={() => setMore((m) => !m)}>
            <span className="smn-tab-pill">
              <MoreGrid />
            </span>
            <span className="smn-tab-l">Mais</span>
          </button>
        )}
      </nav>
    </>
  );
}

// ---------------------------------------------------------------- cabeçalho
// phase2Locked: a 2ª fase está "em breve" para o aluno (a equipe segue com acesso): opção apagada, sem clique.
function PhaseSwitch({ phase, setPhase, mobile, phase2Locked }) {
  const o = [[1, "1ª Fase", "Objetiva"], [2, "2ª Fase", phase2Locked ? "Em breve" : "Prática"]];
  return (
    <div role="radiogroup" aria-label="Fase do Revalida" className="smn-phase" style={{ display: "inline-flex", padding: 4, gap: 4, borderRadius: 14, background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
      {o.map(([v, l, d]) => {
        const lock = !!phase2Locked && v === 2;
        const stack = lock && mobile;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={phase === v}
            disabled={lock}
            aria-disabled={lock ? "true" : undefined}
            onClick={lock ? undefined : () => setPhase(v)}
            style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 14px", border: 0, borderRadius: 10, cursor: lock ? "not-allowed" : "pointer", background: phase === v ? "var(--surface-card)" : "transparent", boxShadow: phase === v ? "var(--shadow-sm)" : "none", color: lock ? "var(--text-tertiary)" : phase === v ? "var(--text-primary)" : "var(--text-secondary)", font: "600 14px var(--font-sans)" }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: phase === v ? (v === 1 ? "var(--teal-500)" : "var(--violet-600)") : "var(--border-strong)" }} />
            {stack ? (
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
                {l} <span style={{ font: "500 12px/1.2 var(--font-sans)" }}>{d}</span>
              </span>
            ) : (
              <>
                {l}
                {!mobile && <span style={{ fontWeight: 500, color: "var(--text-tertiary)" }}>· {d}</span>}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- cabeçalhos do Início e do Plano de Hoje (pacote "Novas telas", onda 2)
// Celular: barra do alto (logo, fase, conta) e título; computador e tablet: título com a sequência e a fase à direita (Início) ou título com o botão de personalizar (Plano).
function StreakChip({ info, go }) {
  const n = info.streakDays || 0;
  return (
    <button type="button" className="smn-streak" onClick={() => go("missoes")} title="Sequência de dias de estudo">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--streak)" stroke="var(--streak)" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
      <span className="smn-mono">{n}</span> {n === 1 ? "dia" : "dias"}
    </button>
  );
}

function MobileTopBar({ theme, go, phase, setPhase, phase2Locked, info }) {
  return (
    <div className="smn-mtop">
      <button type="button" className="smn-mtop-logo" onClick={() => go(phase === 2 ? "home2" : "home")} aria-label="StaziaMed, início">
        <img className="wm" src={theme === "dark" ? "/brand/horizontal-escuro-320w.png" : "/brand/horizontal-320w.png"} alt="StaziaMed Revalida" width="129" height="40" />
        <img className="sym" src={logoSrc(theme, "symbol")} alt="" aria-hidden="true" width="26" height="38" />
      </button>
      <span style={{ flex: 1 }} />
      <PhaseSwitch phase={phase} setPhase={setPhase} mobile phase2Locked={phase2Locked} />
      <button type="button" className="smn-hdr-btn" onClick={() => go("perfil")} aria-label={`Conta de ${info.name}`}>
        <Avatar name={info.name} size={36} />
      </button>
    </div>
  );
}

// Início do celular "simples" (pacote MobileMenu): barra branca com logo, sequência e conta; depois a data e a saudação.
function SimpleTopHeader({ title, sub, theme, go, phase, info }) {
  return (
    <header className="smn-ph smn-ph--simples">
      <div className="smn-stop">
        <button type="button" className="smn-mtop-logo" onClick={() => go(phase === 2 ? "home2" : "home")} aria-label="StaziaMed, início">
          <img className="wm" src={theme === "dark" ? "/brand/horizontal-escuro-320w.png" : "/brand/horizontal-320w.png"} alt="StaziaMed Revalida" width="97" height="30" />
        </button>
        <span style={{ flex: 1 }} />
        <StreakChip info={info} go={go} />
        <button type="button" className="smn-hdr-btn" onClick={() => go("perfil")} aria-label={`Conta de ${info.name}`}>
          <Avatar name={info.name} size={36} />
        </button>
      </div>
      <div>
        {sub && <div className="smn-ph-date">{sub}</div>}
        <h1 className="smn-ph-h1 smn-ph-h1--simples">{title}</h1>
      </div>
    </header>
  );
}

function PageHeader({ kind, title, sub, theme, setTheme, go, mobile, phase, setPhase, phase2Locked, info }) {
  if (kind === "inicio-simples") return <SimpleTopHeader title={title} sub={sub} theme={theme} go={go} phase={phase} info={info} />;
  if (kind === "inicio") {
    return (
      <header className="smn-ph">
        {mobile && <MobileTopBar theme={theme} go={go} phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} info={info} />}
        <div className="smn-ph-row">
          <div className="smn-ph-l">
            <h1 className="smn-ph-h1">{title}</h1>
            <StreakChip info={info} go={go} />
          </div>
          {!mobile && (
            <div className="smn-ph-r">
              {sub && <span className="smn-ph-date">{sub}</span>}
              <PhaseSwitch phase={phase} setPhase={setPhase} mobile={false} phase2Locked={phase2Locked} />
            </div>
          )}
        </div>
        {mobile && sub && <span className="smn-ph-date smn-ph-date--m">{sub}</span>}
      </header>
    );
  }
  // plano
  const open = () => go("hoje", { ajustar: 1 });
  return (
    <header className="smn-ph smn-ph--plan">
      {mobile && <MobileTopBar theme={theme} go={go} phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} info={info} />}
      {mobile && (
        <button type="button" className="smn-ph-back" onClick={() => go("home")}>
          <Icon name="chevron-left" size={20} />
          Início
        </button>
      )}
      <div className="smn-ph-row smn-ph-row--plan">
        <div>
          {!mobile && sub && <div className="smn-ph-eyebrow">{sub}</div>}
          <h1 className="smn-ph-h1">{title}</h1>
          {mobile && <div className="smn-ph-eyebrow smn-ph-eyebrow--m">Aprender · praticar · revisar</div>}
        </div>
        <button type="button" className="smn-ph-btn" onClick={open} aria-haspopup="dialog">
          <Icon name="sliders-horizontal" size={18} />
          {mobile ? "Ajustar" : "Personalizar plano"}
        </button>
      </div>
    </header>
  );
}

function Header({ title, sub, theme, setTheme, go, mobile, phase, setPhase, phase2Locked, info, kind }) {
  if (kind === "inicio" || kind === "inicio-simples" || kind === "plano") return <PageHeader kind={kind} title={title} sub={sub} theme={theme} setTheme={setTheme} go={go} mobile={mobile} phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} info={info} />;
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {mobile && (
          <button type="button" onClick={() => go(phase === 2 ? "home2" : "home")} aria-label="StaziaMed, início" style={{ display: "flex", alignItems: "center", gap: 10, border: 0, background: "none", padding: 0, cursor: "pointer", minHeight: 44 }}>
            <img src={theme === "dark" ? "/brand/horizontal-escuro-320w.png" : "/brand/horizontal-320w.png"} alt="StaziaMed Revalida" width="129" height="40" style={{ height: 40, width: "auto", display: "block" }} />
          </button>
        )}
        <PhaseSwitch phase={phase} setPhase={setPhase} mobile={mobile} phase2Locked={phase2Locked} />
        <div>
          {sub && <div style={{ font: "500 13px var(--font-sans)", color: "var(--text-tertiary)" }}>{sub}</div>}
          <h1 style={{ margin: "4px 0 0", font: `700 ${mobile ? 26 : 32}px/1.15 var(--font-sans)`, letterSpacing: "-0.02em" }}>{title}</h1>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {!mobile && (
          <button type="button" className="smn-pill" onClick={() => go("missoes")} title="Sequência de dias de estudo">
            <Icon name="flame" size={16} style={{ color: "var(--streak)" }} />
            {info.streakDays} {info.streakDays === 1 ? "dia" : "dias"}
          </button>
        )}
        <IconButton icon={theme === "dark" ? "sun" : "moon"} label={theme === "dark" ? "Tema claro" : "Tema escuro"} variant="secondary" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={{ minWidth: 44, minHeight: 44 }} />
        {mobile && (
          <button type="button" className="smn-hdr-btn" onClick={() => go("perfil")} aria-label="Conta">
            <Avatar name={info.name} size={40} />
          </button>
        )}
      </div>
    </header>
  );
}

function AppShell({ route, go, theme, setTheme, title, sub, children, bare, phase = 1, setPhase, phase2Locked = false, info: baseInfo, headerKind: kind }) {
  const layout = useLayout();
  const counts = useShellCounts(route);
  const info = { ...counts, ...baseInfo };
  const full = FULL.includes(route);
  const mobile = layout === "mobile";
  const narrowWeb = useMQ("(max-width: 1280px)");
  const [pref, setPref] = React.useState(() => readCollapsed(narrowWeb));
  const userSet = React.useRef(false);
  React.useEffect(() => {
    if (!userSet.current) {
      try {
        if (localStorage.getItem(COL_KEY) == null) setPref(narrowWeb);
      } catch (e) {
        setPref(narrowWeb);
      }
    }
  }, [narrowWeb]);
  const setCollapsed = (v) => {
    userSet.current = true;
    setPref(v);
    try {
      localStorage.setItem(COL_KEY, v ? "1" : "0");
    } catch (e) {
      /* sem armazenamento: vale só nesta visita */
    }
  };
  const collapsed = pref;
  const headerKind = kind === "inicio" && mobile && inicioCelular() === "simples" ? "inicio-simples" : kind;
  const marginLeft = full || mobile ? 0 : layout === "tablet" ? 116 : collapsed ? 116 : 304;
  return (
    <div className="smn" style={{ minHeight: "100vh", background: "var(--bg-app)" }}>
      {!full && (
        <a className="smn-skip" href="#conteudo">
          Pular para o conteúdo
        </a>
      )}
      {!full && layout === "desktop" && <Sidebar route={route} go={go} phase={phase} info={info} theme={theme} collapsed={collapsed} setCollapsed={setCollapsed} />}
      {!full && layout === "tablet" && <Rail route={route} go={go} phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} info={info} theme={theme} setTheme={setTheme} />}
      <main id="conteudo" tabIndex={-1} style={{ marginLeft, transition: "margin-left var(--dur-base) var(--ease-standard)", padding: bare ? 0 : mobile ? "24px 18px calc(104px + env(safe-area-inset-bottom))" : layout === "tablet" ? "28px 28px 64px" : "36px 48px 64px", outline: "none" }}>
        {bare ? (
          children
        ) : (
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
            <Header title={title} sub={sub} theme={theme} setTheme={setTheme} go={go} mobile={mobile} phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} info={info} kind={headerKind} />
            {children}
          </div>
        )}
      </main>
      {!full && mobile && <MobileTabs route={route} go={go} phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} info={info} theme={theme} setTheme={setTheme} />}
    </div>
  );
}
export { AppShell };
