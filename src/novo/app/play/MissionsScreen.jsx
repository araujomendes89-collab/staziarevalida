// Missões do dia e da semana (app_gamification_missions). O progresso vem dos fatos no banco.
import React from "react";
import { Banner, Button, Card } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { MissionList, PlayError, Skeleton } from "./components.jsx";
import { usePlayLoad } from "./usePlay.js";

export function MissionsScreen({ go }) {
  const { backend, boot } = useSession();
  const mobile = useMobile();
  const m = usePlayLoad(() => backend.rpc("app_gamification_missions"), [backend]);
  if (boot?.play?.enabled === false) return <Banner tone="info">As missões fazem parte da Stazia Arena, que está desligada no momento.</Banner>;
  if (m.error) return <PlayError retry={m.reload} />;
  if (!m.data) return <Skeleton height={360} />;
  const d = m.data;
  const dailyDone = d.daily.filter((x) => x.done).length;
  return (
    <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2, minmax(0,1fr))", gap: 20, alignItems: "start" }}>
      <Card style={{ borderRadius: 24 }} padding={mobile ? 18 : 24}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div>
            <span className="sm-overline">Missões de hoje</span>
            <h2 style={{ margin: "4px 0 0", font: "700 22px/1.2 var(--font-sans)" }}>{dailyDone} de {d.daily.length}</h2>
          </div>
          <Button size="sm" iconRight="arrow-right" onClick={() => go("questoes")}>Estudar</Button>
        </div>
        <MissionList items={d.daily} bonus={d.daily_bonus} />
        <p style={{ margin: "14px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Renovam todo dia no seu fuso. Concluir qualquer missão já garante o dia na sua sequência.</p>
      </Card>
      <Card style={{ borderRadius: 24 }} padding={mobile ? 18 : 24}>
        <div style={{ marginBottom: 14 }}>
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>Missões da semana</span>
          <h2 style={{ margin: "4px 0 0", font: "700 22px/1.2 var(--font-sans)" }}>{d.weekly.filter((x) => x.done).length} de {d.weekly.length}</h2>
          <p style={{ margin: "4px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
            {new Date(`${d.week_start}T12:00:00`).toLocaleDateString("pt-BR")} a {new Date(`${d.week_end}T12:00:00`).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <MissionList items={d.weekly} />
      </Card>
    </div>
  );
}
