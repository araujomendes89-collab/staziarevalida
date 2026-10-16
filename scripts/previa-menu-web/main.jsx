// PRÉVIA do menu lateral da versão web. Dados de TESTE, sem banco. Parâmetros:
//   ?rota=home|hoje|questoes|tutor|planos|... (a rota decide qual grupo do menu abre sozinho; "tutor" deixa todos os grupos fechados)
//   &tema=escuro  &papel=aluno|equipe|revisor  &fase=1|2  &recolhido=1 (menu recolhido)  &selos=0 (sem selos)
//   &erros=7 (questões erradas para revisar, como o dono vê)
//   &menu=antes (o menu COMO ESTAVA antes desta frente, só para comparar na mesma janela; sem isso aparece o menu novo)
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../../src/novo/ds/styles.css";
import { AppShell } from "../../src/novo/app/Shell.jsx";
import { HomeScreen } from "../../src/novo/app/home/HomeScreen.jsx";

const q = new URLSearchParams(location.search);
const papel = q.get("papel") || "aluno";
try {
  if (q.get("recolhido") === "1") localStorage.setItem("smf-col", "1");
  else if (q.get("recolhido") === "0") localStorage.setItem("smf-col", "0");
  else localStorage.removeItem("smf-col");
} catch (e) {
  /* sem armazenamento */
}

// Só na prévia: devolve ao menu as medidas de antes (grupos de 44 px, painel até o fim da janela, selo IA sem o espaço da seta).
const ANTES_CSS = `.smn-side{--smn-row:44px!important;--smn-sub:44px!important;--smn-gap:4px!important;--smn-logo-t:20px!important;--smn-logo-b:12px!important;--smn-logo-w:176px!important;--smn-id-b:12px!important;--smn-user-pad:10px!important;--smn-list-pt:4px!important;--smn-list-pb:8px!important;max-height:none!important}
.smn-side:not(.is-collapsed) .smn-toggle{top:34px!important}.smn-chev-slot{display:none!important}.smn-side .smn-sub{margin-bottom:6px!important}`;
const ANTES = q.get("menu") === "antes";
function Etiqueta() {
  const outro = new URLSearchParams(location.search);
  if (ANTES) outro.delete("menu");
  else outro.set("menu", "antes");
  return (
    <a
      href={"?" + outro.toString()}
      style={{ position: "fixed", right: 12, bottom: 12, zIndex: 200, padding: "8px 14px", borderRadius: 999, background: "#052a5a", color: "#fff", font: "600 13px system-ui", textDecoration: "none", opacity: 0.92 }}
    >
      Menu: {ANTES ? "como estava (antes)" : "novo (depois)"} · clique para ver {ANTES ? "o novo" : "o de antes"}
    </a>
  );
}

function Previa() {
  const [nav, setNav] = React.useState({ route: q.get("rota") || "home" });
  const [theme, setTheme] = React.useState(q.get("tema") === "escuro" ? "dark" : "light");
  const [phase, setPhase] = React.useState(Number(q.get("fase")) === 2 ? 2 : 1);
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const go = (route) => setNav({ route });
  React.useEffect(() => {
    if (!ANTES) return undefined;
    const st = document.createElement("style");
    st.textContent = ANTES_CSS;
    document.head.appendChild(st);
    return () => st.remove();
  }, []);
  const selos = q.get("selos") !== "0";
  const info = {
    name: "João Paulo Mendes",
    streakDays: 0,
    onSignOut: () => alert("Sair (prévia)"),
    isStaff: papel === "equipe",
    isReviewer: papel === "revisor",
    radarGraves: 0,
    themeChoice: theme,
    ...(selos ? { planDone: 0, planTotal: 2, missionsDone: 0, missionsTotal: 3, wrongPending: Number(q.get("erros") || 7) } : { planDone: null, planTotal: null, missionsDone: null, missionsTotal: null, wrongPending: null }),
  };
  const headerKind = nav.route === "home" ? "inicio" : undefined;
  const titulo = nav.route === "home" ? ["Boa tarde, João.", "Sexta, 16 de outubro"] : [nav.route, "Tela fora desta prévia"];
  return (
    <MemoryRouter key={nav.route} initialEntries={["/" + nav.route]}>
      <AppShell route={nav.route} go={go} theme={theme} setTheme={setTheme} phase={phase} setPhase={setPhase} phase2Locked={papel === "aluno"} info={info} title={titulo[0]} sub={titulo[1]} headerKind={headerKind}>
        {nav.route === "home" ? <HomeScreen go={go} mobile={false} /> : <p style={{ color: "var(--text-secondary)" }}>Tela “{nav.route}” fora desta prévia (só o menu importa aqui).</p>}
      </AppShell>
      <Etiqueta />
    </MemoryRouter>
  );
}
createRoot(document.getElementById("root")).render(<Previa />);
