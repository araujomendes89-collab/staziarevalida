// Estrutura do app novo (Novas telas, ondas 0 e 1, 15/10/2026): menu em sanfona (computador), trilho de ícones com
// painel (tablet, 834 px), barra de abas + "Mais" (celular) e cabeçalho. Mesmos endereços, nomes e permissões de antes
// (Administração só para equipe, Revisão médica só para revisor). Os dados vêm de `info`; nada de exemplo.
// Modelo do menu em shell/navModel.js; estilos em shell/shell.css (só tokens do design system).
import React from "react";
import { Icon, Avatar, IconButton } from "../ds";
import { RI_CSS } from "../prototype/RealIcons.jsx";
import { AppRealIcon } from "./AppIcons.jsx";
import { FULL, badgeOf, configItems, groupBadge, groupOfRoute, groupsOf, mobileTabs } from "./shell/navModel.js";
import "./shell/shell.css";

export function useMQ(q) {
  const [m, setM] = React.useState(() => matchMedia(q).matches);
  React.useEffect(() => {
    const mq = matchMedia(q);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [q]);
  return m;
}
export function useMobile() {
  return useMQ("(max-width: 860px)");
}

/** Computador (>1180 px), tablet (720 a 1180 px, inclui o iPad de 834 px) ou celular (até 719 px). O corte das telas de dentro (useMobile) segue em 860. */
function useLayout() {
  const mobile = useMQ("(max-width: 719px)");
  const tablet = useMQ("(max-width: 1180px)");
  return mobile ? "mobile" : tablet ? "tablet" : "desktop";
}

// Ícone ilustrado do app quando existe; senão o ícone do design system
const Ic = ({ name, size = 22 }) => <span className="smn-ic" aria-hidden="true">{AppRealIcon({ name, size }) || <Icon name={name} size={size - 4} />}</span>;
const phaseLabel = (phase) => (phase === 1 ? "1ª fase · objetiva" : "2ª fase · prática");
const logoSrc = (theme, kind) => (kind === "symbol" ? (theme === "dark" ? "/brand/simbolo-escuro-64w.png" : "/brand/simbolo-64w.png") : theme === "dark" ? "/brand/horizontal-escuro-480w.png" : "/brand/horizontal-480w.png");

function Badge({ n, ai }) {
  if (ai) return <span className="smn-badge smn-badge--ai">IA</span>;
  if (n == null) return null;
  return <span className="smn-badge" aria-label={`${n} pendentes`}>{n}</span>;
}

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
function Sidebar({ route, go, phase, info, theme, collapsed, setCollapsed }) {
  const groups = groupsOf(phase, { staff: info.isStaff });
  const current = groupOfRoute(route, phase);
  const [open, setOpen] = React.useState(current);
  const [fly, setFly] = React.useState(null); // {id, top}: submenu flutuante do menu recolhido
  const btnRefs = React.useRef({});
  const flyRef = React.useRef(null);
  React.useEffect(() => {
    if (current) setOpen(current);
  }, [current]);
  React.useEffect(() => setFly(null), [route, collapsed]);
  React.useEffect(() => {
    if (!fly) return undefined;
    const first = flyRef.current && flyRef.current.querySelector("button");
    if (first) first.focus();
    const key = (e) => {
      if (e.key === "Escape") {
        const id = fly.id;
        setFly(null);
        btnRefs.current[id] && btnRefs.current[id].focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [fly]);
  const cfg = configItems(info);
  const tutorGo = phase === 2 ? "paciente" : "tutor";
  const tutorLabel = phase === 2 ? "Paciente simulado" : "Perguntar ao tutor";
  const toggleLabel = collapsed ? "Expandir menu" : "Recolher menu";
  const opened = fly && groups.find((g) => g.id === fly.id);
  const tip = (l) => (collapsed ? l : undefined);

  const onGroup = (g) => {
    if (g.direct) return go(g.direct);
    if (collapsed) {
      if (fly && fly.id === g.id) return setFly(null);
      const el = btnRefs.current[g.id];
      const top = el ? Math.max(12, Math.min(el.getBoundingClientRect().top - 8, window.innerHeight - 70 - g.items.length * 44)) : 16;
      return setFly({ id: g.id, top });
    }
    setOpen(open === g.id ? null : g.id);
  };

  return (
    <>
      <nav className={`smn-side${collapsed ? " is-collapsed" : ""}`} aria-label="Navegação principal">
        <style>{RI_CSS}</style>
        <button type="button" className="smn-toggle" onClick={() => setCollapsed(!collapsed)} aria-label={toggleLabel} title={toggleLabel} aria-expanded={!collapsed} aria-controls="smn-side-body">
          <Icon name="chevron-left" size={14} className="smn-toggle-ic" />
        </button>
        <button type="button" className="smn-logo" onClick={() => go(phase === 2 ? "home2" : "home")} aria-label="StaziaMed, início" title={tip("StaziaMed, início")}>
          {collapsed ? <img src={logoSrc(theme, "symbol")} alt="" style={{ height: 36, width: "auto" }} /> : <img src={logoSrc(theme)} alt="StaziaMed Revalida" />}
        </button>
        <div id="smn-side-body" style={{ display: "contents" }}>
          <button type="button" className="smn-user" onClick={() => go("perfil")} aria-label={`Conta de ${info.name}, ${phaseLabel(phase)}`} title={tip(info.name)}>
            <Avatar name={info.name} size={36} />
            {!collapsed && (
              <>
                <span className="smn-grow">
                  <b>{info.name}</b>
                  <small><Icon name="repeat" size={12} />{phaseLabel(phase)}</small>
                </span>
                <Icon name="chevron-right" size={16} style={{ color: "var(--text-tertiary)" }} />
              </>
            )}
          </button>
          <div className="smn-list">
            {groups.map((g) => {
              if (g.direct) {
                const on = route === g.direct;
                return (
                  <button key={g.id} type="button" className={`smn-grp${on ? " is-current" : ""}`} aria-current={on ? "page" : undefined} aria-label={g.label} title={tip(g.label)} onClick={() => go(g.direct)}>
                    <Ic name={g.icon} />
                    {!collapsed && <span className="smn-lbl">{g.label}</span>}
                    {!collapsed && <Badge ai={Boolean(g.badgeText)} />}
                  </button>
                );
              }
              const isOpen = !collapsed && open === g.id;
              const hasCurrent = current === g.id;
              const gb = groupBadge(g, info);
              return (
                <div key={g.id}>
                  <button
                    ref={(el) => (btnRefs.current[g.id] = el)}
                    type="button"
                    className={`smn-grp${hasCurrent && !isOpen ? " is-current" : ""}`}
                    aria-expanded={collapsed ? Boolean(fly && fly.id === g.id) : isOpen}
                    aria-haspopup={collapsed ? "true" : undefined}
                    aria-controls={collapsed ? undefined : `smn-sub-${g.id}`}
                    aria-label={g.label}
                    title={tip(g.label)}
                    onClick={() => onGroup(g)}
                  >
                    <Ic name={g.icon} />
                    {!collapsed && <span className="smn-lbl">{g.label}</span>}
                    {!isOpen && (collapsed ? gb != null && <span className="smn-dot" aria-label={`${gb} pendentes`} /> : <Badge n={gb} />)}
                    {!collapsed && <Icon name="chevron-right" size={16} className="smn-chev" />}
                  </button>
                  {isOpen && (
                    <div className="smn-sub" id={`smn-sub-${g.id}`}>
                      {g.items.map(([id, ic, l]) => (
                        <button key={id} type="button" className="smn-item" aria-current={route === id ? "page" : undefined} onClick={() => go(id)}>
                          <Ic name={ic} size={20} />
                          <span className="smn-lbl">{l}</span>
                          <Badge n={badgeOf(id, info)} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="smn-foot">
            <button type="button" className="smn-cta" onClick={() => go(tutorGo)} aria-label={tutorLabel} title={tip(tutorLabel)}>
              <Icon name="sparkles" size={18} />
              {!collapsed && tutorLabel}
            </button>
            {cfg.map(([id, ic, l]) => (
              <button key={id} type="button" className="smn-item" aria-current={route === id ? "page" : undefined} aria-label={l} title={tip(l)} onClick={() => go(id)}>
                <Ic name={ic} size={20} />
                {!collapsed && <span className="smn-lbl">{l}</span>}
                {!collapsed && <Badge n={badgeOf(id, info)} />}
              </button>
            ))}
            <button type="button" className="smn-item" aria-current={route === "perfil" ? "page" : undefined} aria-label="Preferências" title={tip("Preferências")} onClick={() => go("perfil")}>
              <Ic name="settings" size={20} />
              {!collapsed && <span className="smn-lbl">Preferências</span>}
            </button>
            <button type="button" className="smn-item" aria-label="Sair" title={tip("Sair")} onClick={() => info.onSignOut && info.onSignOut()}>
              <Ic name="log-out" size={20} />
              {!collapsed && <span className="smn-lbl">Sair</span>}
            </button>
          </div>
        </div>
      </nav>
      {opened && (
        <>
          <div className="smn-more-back" style={{ background: "transparent", zIndex: 44 }} onClick={() => setFly(null)} aria-hidden="true" />
          <div className="smn-fly" ref={flyRef} role="group" aria-label={opened.label} style={{ top: fly.top, left: 116 }}>
            <h2>{opened.label}</h2>
            {opened.items.map(([id, ic, l]) => (
              <button key={id} type="button" className="smn-item" aria-current={route === id ? "page" : undefined} onClick={() => go(id)}>
                <Ic name={ic} size={22} />
                <span className="smn-lbl">{l}</span>
                <Badge n={badgeOf(id, info)} />
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- tablet: trilho de ícones com painel
function Rail({ route, go, phase, info, theme }) {
  const groups = groupsOf(phase, { staff: info.isStaff });
  const current = groupOfRoute(route, phase);
  const [openId, setOpenId] = React.useState(null);
  const [top, setTop] = React.useState(16);
  const [more, setMore] = React.useState(false);
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
        <button type="button" className="smn-hdr-btn" onClick={() => go("perfil")} aria-label={`Conta de ${info.name}`} style={{ marginBottom: 6 }}>
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
              <Badge n={gb} />
            </button>
          );
        })}
        <div className="smn-rail-sp" />
        <button type="button" className={`smn-rb${more ? " is-current" : ""}`} aria-haspopup="dialog" aria-expanded={more} onClick={() => { setOpenId(null); setMore((m) => !m); }}>
          <Icon name="layout-grid" size={22} />
          <span>Mais</span>
        </button>
        <button type="button" className={`smn-rb${route === "perfil" ? " is-current" : ""}`} aria-current={route === "perfil" ? "page" : undefined} onClick={() => go("perfil")}>
          <Icon name="settings" size={22} />
          <span>Ajustes</span>
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
                <Badge n={badgeOf(id, info)} />
              </button>
            ))}
          </div>
        </>
      )}
      {more && <MoreSheet route={route} go={go} info={info} phase={phase} variant="tablet" onClose={() => setMore(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- "Mais": lista de TODAS as áreas (celular e tablet)
function MoreSheet({ route, go, info, phase = 1, variant, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const first = ref.current && ref.current.querySelector("button[data-item]");
    if (first) first.focus();
    const k = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll("button")];
        if (!f.length) return;
        const a = document.activeElement;
        if (e.shiftKey && a === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && a === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  const pick = (id) => {
    onClose();
    go(id);
  };
  const groups = [...groupsOf(phase, { staff: info.isStaff }).map((g) => [g.label, g.items]), ["Configurações", [...configItems(info), ["perfil", "settings", "Conta e ajuda"]]]];
  return (
    <div>
      <div className="smn-more-back" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className={`smn-more${variant === "tablet" ? " smn-more--tablet" : ""}`} role="dialog" aria-modal="true" aria-label="Todas as áreas">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0 0" }}>
          <strong style={{ font: "700 16px var(--font-sans)", color: "var(--text-primary)" }}>Todas as áreas</strong>
          <button type="button" className="smn-hdr-btn" onClick={onClose} aria-label="Fechar" style={{ color: "var(--text-secondary)" }}>
            <Icon name="x" size={20} />
          </button>
        </div>
        {groups.map(([t, its]) => (
          <div key={t}>
            <div className="smn-overline" style={{ padding: "12px 2px 6px" }}>{t}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
              {its.map(([id, ic, l]) => {
                const b = badgeOf(id, info);
                return (
                  <button key={id} type="button" data-item="1" className="smn-more-item" aria-current={route === id ? "page" : undefined} onClick={() => pick(id)}>
                    <Icon name={ic} size={18} />
                    <span style={{ flex: 1, minWidth: 0 }}>{l}</span>
                    {b != null && <Badge n={b} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ paddingTop: 12 }}>
          <button type="button" data-item="1" className="smn-more-item" style={{ width: "100%", color: "var(--danger-text)" }} onClick={() => { onClose(); info.onSignOut && info.onSignOut(); }}>
            <Icon name="log-out" size={18} />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- celular: barra de abas
function MobileTabs({ route, go, phase, info }) {
  const [more, setMore] = React.useState(false);
  const close = React.useCallback(() => setMore(false), []);
  React.useEffect(() => setMore(false), [route]);
  const tabs = mobileTabs(phase);
  const current = groupOfRoute(route, phase);
  const onTab = (t) => t[3] != null && t[3] === current;
  const moreOn = phase === 1 && !tabs.some(onTab);
  return (
    <>
      {more && phase === 1 && <MoreSheet route={route} go={go} info={info} phase={phase} onClose={close} />}
      <nav className="smn-tabs" aria-label="Navegação principal">
        {tabs.map((t) => {
          const [id, ic, l] = t;
          const on = onTab(t) || route === id;
          const b = badgeOf(id, info);
          return (
            <button key={id} type="button" className={`smn-tab${on ? " is-current" : ""}`} aria-label={l} aria-current={on ? "page" : undefined} onClick={() => go(id)}>
              {AppRealIcon({ name: ic, size: 26 }) || <Icon name={ic} size={22} />}
              <span>{l}</span>
              <Badge n={b} />
            </button>
          );
        })}
        {phase === 1 && (
          <button type="button" className={`smn-tab${more || moreOn ? " is-current" : ""}`} aria-label="Mais" aria-haspopup="dialog" aria-expanded={more} onClick={() => setMore((m) => !m)}>
            <Icon name="layout-grid" size={22} />
            <span>Mais</span>
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

function Header({ title, sub, theme, setTheme, go, mobile, phase, setPhase, phase2Locked, info }) {
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

function AppShell({ route, go, theme, setTheme, title, sub, children, bare, phase = 1, setPhase, phase2Locked = false, info }) {
  const layout = useLayout();
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
  const marginLeft = full || mobile ? 0 : layout === "tablet" ? 116 : collapsed ? 116 : 304;
  return (
    <div className="smn" style={{ minHeight: "100vh", background: "var(--bg-app)" }}>
      {!full && (
        <a className="smn-skip" href="#conteudo">
          Pular para o conteúdo
        </a>
      )}
      {!full && layout === "desktop" && <Sidebar route={route} go={go} phase={phase} info={info} theme={theme} collapsed={collapsed} setCollapsed={setCollapsed} />}
      {!full && layout === "tablet" && <Rail route={route} go={go} phase={phase} info={info} theme={theme} />}
      <main id="conteudo" tabIndex={-1} style={{ marginLeft, transition: "margin-left var(--dur-base) var(--ease-standard)", padding: bare ? 0 : mobile ? "24px 18px calc(104px + env(safe-area-inset-bottom))" : layout === "tablet" ? "28px 28px 64px" : "36px 48px 64px", outline: "none" }}>
        {bare ? (
          children
        ) : (
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
            <Header title={title} sub={sub} theme={theme} setTheme={setTheme} go={go} mobile={mobile} phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} info={info} />
            {children}
          </div>
        )}
      </main>
      {!full && mobile && <MobileTabs route={route} go={go} phase={phase} info={info} />}
    </div>
  );
}
export { AppShell };
