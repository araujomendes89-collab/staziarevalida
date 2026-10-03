// Administração: só para a equipe. Administrador vê tudo; editor, só o conteúdo.
// O banco confere o papel em cada função (supabase/migrations/…1300_admin.sql): esconder as
// abas aqui é só conveniência.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs } from "../../ds";
import { useSession } from "../session.jsx";
import { AdminQuestions } from "./AdminQuestions.jsx";
import { AdminUsers } from "./AdminUsers.jsx";
import { AdminAudit, AdminOverview, AdminPlans, AdminSettings, AdminStations } from "./AdminPanels.jsx";

const TABS = [
  { value: "geral", label: "Visão geral", icon: "layout-dashboard", staff: true },
  { value: "usuarios", label: "Usuários", icon: "users" },
  { value: "questoes", label: "Questões", icon: "file-question", staff: true },
  { value: "planos", label: "Planos", icon: "crown" },
  { value: "estacoes", label: "Estações", icon: "clipboard-list", staff: true },
  { value: "config", label: "Configurações", icon: "settings" },
  { value: "registro", label: "Registro", icon: "history" },
];

export const isStaffRole = (role) => role === "admin" || role === "editor";

export function AdminScreen() {
  const { boot } = useSession();
  const isAdmin = boot.role === "admin";
  const tabs = TABS.filter((t) => isAdmin || t.staff);
  const [params, setParams] = useSearchParams();
  const tab = tabs.some((t) => t.value === params.get("aba")) ? params.get("aba") : "geral";

  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <Tabs label="Administração" value={tab} onChange={(aba) => setParams({ aba }, { replace: true })} tabs={tabs.map(({ value, label, icon }) => ({ value, label, icon }))} />
      </div>
      {tab === "geral" && <AdminOverview isAdmin={isAdmin} />}
      {tab === "usuarios" && <AdminUsers />}
      {tab === "questoes" && <AdminQuestions />}
      {tab === "planos" && <AdminPlans />}
      {tab === "estacoes" && <AdminStations />}
      {tab === "config" && <AdminSettings />}
      {tab === "registro" && <AdminAudit />}
    </>
  );
}
