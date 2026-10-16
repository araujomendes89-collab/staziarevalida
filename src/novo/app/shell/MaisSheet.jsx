// Folha "Mais" do celular (pacote MobileMais, "Mobile · Mais aberto"; Novas telas, 15/10/2026): sobe de baixo, acima da barra de abas.
// Cartão da conta com a fase e "Trocar fase" (para o aluno a 2ª fase continua "Em breve"), seções em quadradinhos (Jornada e prática,
// Aprender, Stazia Arena, Minha evolução, Configurações) e "Sair da conta". Sem "Buscar no app" (decisão do dono).
// Administração só para a equipe e Revisão médica só para revisor (navModel.configItems). Selos 0/2 e 0/3 vêm do banco (useShellCounts).
import React from "react";
import { Avatar, Icon } from "../../ds";
import { AppRealIcon } from "../AppIcons.jsx";
import { badgeKind, badgeOf, maisSheetSections } from "./navModel.js";
import { PrefsView } from "./MaisPage.jsx";
import "./mais.css";

export function MaisSheet({ route, go, info, phase, setPhase, phase2Locked, themeChoice, setTheme, onClose }) {
  const [view, setView] = React.useState("mais");
  const ref = React.useRef(null);
  const close = React.useCallback(() => {
    onClose();
    // o foco volta para o botão "Mais" da barra de baixo
    setTimeout(() => {
      const b = document.querySelector('.smn-tabs button[aria-label="Mais"]');
      if (b) b.focus();
    }, 0);
  }, [onClose]);
  React.useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [close]);
  React.useEffect(() => {
    const h = ref.current && (ref.current.querySelector("h2[tabindex]") || ref.current.querySelector("button"));
    if (h) h.focus();
  }, [view]);
  const pick = (id) => {
    if (id === "prefs") return setView("prefs");
    onClose();
    go(id);
  };
  const sections = maisSheetSections(phase, info);
  const locked = phase === 1 && phase2Locked;
  const phaseText = phase === 1 ? "1ª fase · Objetiva" : "2ª fase · Prática";

  return (
    <>
      <div className="sms-back" onClick={close} aria-hidden="true" />
      <div ref={ref} className="sms" role="dialog" aria-modal="true" aria-label={view === "prefs" ? "Preferências" : "Mais opções"}>
        <span className="sms-grab" aria-hidden="true" />
        {view === "mais" ? (
          <>
            <div className="sms-head">
              <h2 tabIndex={-1}>Mais</h2>
              <button type="button" className="sms-x" onClick={close} aria-label="Fechar">
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="sms-body">
              <div className="sms-user">
                <Avatar name={info.name} size={40} />
                <span className="sms-user-t">
                  <b>{info.name}</b>
                  <small>
                    <i aria-hidden="true" />
                    {phaseText}
                  </small>
                </span>
                {/* para o aluno a 2ª fase está "Em breve": "Trocar fase" abre Preferências, onde a escolha mostra isso */}
                <button type="button" className="sms-swap" onClick={() => (locked ? setView("prefs") : (onClose(), setPhase && setPhase(phase === 1 ? 2 : 1)))}>
                  Trocar fase
                </button>
              </div>
              {sections.map((sec) => (
                <section key={sec.id} className="sms-sec" aria-label={sec.label}>
                  <h3>{sec.label}</h3>
                  {/* G1.11: seção com 2 itens (Configurações do aluno) em 2 colunas, para a linha não ficar incompleta */}
                  <div className={`sms-grid${sec.items.length === 2 ? " sms-grid--2" : ""}`}>
                    {sec.items.map(([id, ic, label]) => {
                      const badge = badgeOf(id, info);
                      return (
                        <button key={id} type="button" className="sms-tile" aria-current={route === id || (id === "prefs" && route === "perfil") ? "page" : undefined} onClick={() => pick(id)}>
                          <span className="sms-ico">{AppRealIcon({ name: ic, size: 32 }) || <Icon name={ic} size={26} />}</span>
                          <span className="sms-lbl">{label}</span>
                          {badge != null && (
                            <span className={`sms-badge sms-badge--${badgeKind(id)}`} aria-label={badgeKind(id) === "danger" ? `${badge} pendentes` : `${badge} feitas hoje`}>
                              {badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              <button type="button" className="sms-out" onClick={() => { onClose(); info.onSignOut && info.onSignOut(); }}>
                {AppRealIcon({ name: "log-out", size: 22 }) || <Icon name="log-out" size={20} />}
                Sair da conta
              </button>
            </div>
          </>
        ) : (
          <div className="sms-body sms-body--prefs">
            <PrefsView info={info} phase={phase} setPhase={setPhase} phase2Locked={phase2Locked} themeChoice={themeChoice} setTheme={setTheme} onBack={() => setView("mais")} onPick={pick} onSignOut={() => { onClose(); info.onSignOut && info.onSignOut(); }} />
          </div>
        )}
      </div>
    </>
  );
}
