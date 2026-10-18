// Janela para escolher a estação da sala: busca e lista "Estação {n} · {nome}" por área (Stations.jsx:43 do protótipo).
// As estações vêm de app_dupla_stations (só as aprovadas que a pessoa pode usar). Com `roomId`, as estações que a dupla já
// treinou nesta sala (rodadas anteriores, app_dupla_room_done_stations) aparecem como "Já treinada nesta sala" e não podem ser
// escolhidas (decisão do dono de 16/10; o banco também recusa).
import React from "react";
import { Button, Dialog, Icon, TextField } from "../../../ds";
import { AREAS } from "../labels.js";
import { useSession } from "../../session.jsx";
import { stationTitle } from "./parts.jsx";

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function StationPicker({ title, onPick, onClose, roomId = null }) {
  const { backend } = useSession();
  const [stations, setStations] = React.useState(null);
  const [done, setDone] = React.useState([]);
  const [error, setError] = React.useState(null);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    backend.rpc("app_dupla_stations").then(
      (rows) => alive && setStations(Array.isArray(rows) ? rows : []),
      (e) => alive && setError(e instanceof Error ? e : new Error(String(e)))
    );
    return () => {
      alive = false;
    };
  }, [backend]);
  React.useEffect(() => {
    if (!roomId) return undefined;
    let alive = true;
    backend.rpc("app_dupla_room_done_stations", { p_room_id: roomId }).then(
      (ids) => alive && setDone(Array.isArray(ids) ? ids : []),
      () => undefined // sem a lista, o banco ainda recusa a estação já treinada
    );
    return () => {
      alive = false;
    };
  }, [backend, roomId]);

  const q = normalize(query.trim());
  const shown = (stations || []).filter((s) => !q || normalize([stationTitle(s), s.name, s.topic, s.area].join(" ")).includes(q));
  const groups = AREAS.map((area) => ({ area, list: shown.filter((s) => s.area_code === area.code) })).filter((g) => g.list.length > 0);

  return (
    <Dialog title={title} onClose={onClose} actions={<Button variant="ghost" onClick={onClose}>Cancelar</Button>}>
      <div style={{ display: "grid", gap: 14, marginTop: 8 }}>
        <TextField icon="search" aria-label="Buscar estação" placeholder="Buscar por estação, tema ou queixa" value={query} onChange={(e) => setQuery(e.target.value)} />
        {error && <div role="alert" style={{ color: "var(--danger-text)", font: "var(--type-body-sm)" }}>{error.message}</div>}
        {!error && stations && shown.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "16px 0" }}>
            <Icon name="search-x" size={28} />
            <div style={{ font: "600 var(--text-base) var(--font-sans)", color: "var(--text-primary)", margin: "10px 0 4px" }}>Nenhuma estação encontrada</div>
            Tente outro termo.
          </div>
        )}
        <div style={{ display: "grid", gap: 14, maxHeight: "50vh", overflowY: "auto" }}>
          {groups.map(({ area, list }) => (
            <section key={area.code} aria-label={area.card} style={{ display: "grid", gap: 6 }}>
              <h3 style={{ margin: 0, font: "var(--type-overline)", letterSpacing: "var(--tracking-overline)", textTransform: "uppercase", color: "var(--text-tertiary)" }}>{area.card}</h3>
              {list.map((s) => {
                const used = done.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={used}
                    onClick={() => onPick(s.id)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-default)",
                      background: "var(--surface-card)",
                      color: "var(--text-primary)",
                      font: "var(--type-body-sm)",
                      cursor: used ? "not-allowed" : "pointer",
                      opacity: used ? 0.6 : 1,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <span>{stationTitle(s)}</span>
                    {used && <span style={{ font: "600 var(--text-xs) var(--font-sans)", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Já treinada nesta sala</span>}
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
