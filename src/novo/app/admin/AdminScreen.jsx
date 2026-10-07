// Administração: só para a equipe. Administrador vê tudo; editor, só o conteúdo.
// O banco confere o papel em cada função (supabase/migrations/…1300_admin.sql): esconder as
// abas aqui é só conveniência.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs } from "../../ds";
import { useSession } from "../session.jsx";
import { AdminQuestions } from "./AdminQuestions.jsx";
import { AdminUsers } from "./AdminUsers.jsx";
import { AdminAudit, AdminOverview, AdminPlans, AdminSettings, AdminStations, AdminTutor } from "./AdminPanels.jsx";
import { ContentHub } from "./content/ContentHub.jsx";
import { AdminPlay } from "./AdminPlay.jsx";
import { AdminLessons } from "./AdminLessons.jsx";
import { AdminUpdates } from "./AdminUpdates.jsx";
import { AdminPodcasts } from "./AdminPodcasts.jsx";
import { AdminAI } from "./ai/AdminAI.jsx";
import { isStaffRole } from "./common.jsx";

const TABS = [
  { value: "geral", label: "Visão geral", icon: "layout-dashboard", staff: true },
  { value: "usuarios", label: "Usuários", icon: "users" },
  { value: "questoes", label: "Questões", icon: "file-question", staff: true },
  { value: "aulas", label: "Aulas", icon: "tv", staff: true },
  { value: "podcasts", label: "Podcasts", icon: "headphones", staff: true },
  { value: "atualizacoes", label: "Atualizações", icon: "refresh-cw", staff: true, reviewer: true },
  { value: "planos", label: "Planos", icon: "crown" },
  { value: "estacoes", label: "Estações", icon: "clipboard-list", staff: true },
  { value: "conteudo", label: "Central de Conteúdo", icon: "library", staff: true, reviewer: true },
  { value: "ias", label: "Central de IAs", icon: "bot" },
  { value: "play", label: "Stazia Arena", icon: "trophy" },
  { value: "config", label: "Configurações", icon: "settings" },
  { value: "registro", label: "Registro", icon: "history" },
];

export { isStaffRole };

export function AdminScreen() {
  const { boot } = useSession();
  const isAdmin = boot.role === "admin";
  const isStaff = isStaffRole(boot.role);
  // revisor médico sem papel de equipe: só a revisão da Central de Conteúdo
  const tabs = TABS.filter((t) => isAdmin || (isStaff && t.staff) || (!isStaff && t.reviewer));
  const [params, setParams] = useSearchParams();
  const tab = tabs.some((t) => t.value === params.get("aba")) ? params.get("aba") : tabs[0].value;

  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <Tabs label="Administração" value={tab} onChange={(aba) => setParams({ aba }, { replace: true })} tabs={tabs.map(({ value, label, icon }) => ({ value, label, icon }))} />
      </div>
      {tab === "geral" && <AdminOverview isAdmin={isAdmin} />}
      {tab === "usuarios" && <AdminUsers />}
      {tab === "questoes" && <AdminQuestions />}
      {tab === "aulas" && <AdminLessons />}
      {tab === "podcasts" && <AdminPodcasts />}
      {tab === "atualizacoes" && <AdminUpdates />}
      {tab === "planos" && <AdminPlans />}
      {tab === "estacoes" && <AdminStations />}
      {tab === "conteudo" && <ContentHub isAdmin={isAdmin} isStaff={isStaff} />}
      {tab === "ias" && isAdmin && <AdminAI />}
      {tab === "play" && <AdminPlay />}
      {tab === "config" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <AdminSettings />
          <AdminTutor />
        </div>
      )}
      {tab === "registro" && <AdminAudit />}
    </>
  );
}
