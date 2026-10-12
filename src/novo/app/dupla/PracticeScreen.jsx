// Praticar em dupla (Treinamento em Dupla), etapa 3: cabeçalho, escolha do papel, estação escolhida e "Como a compatibilidade
// é calculada". O baralho e o "Deu match!" entram na etapa 4; sem contadores, radar, convites e listas de colegas.
// Porte de Match.jsx do pacote de design (138-180). O título da tela fica no cabeçalho do app.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Accordion, Banner, Button, EmptyState, Icon, IconButton, SegmentedControl, useToast } from "../../ds";
import { useSession } from "../session.jsx";
import { LoadError, Loading, messageOf, useLoad } from "../admin/common.jsx";
import { COMPAT_WEIGHTS } from "./card.js";

const ROLE_OPTIONS = [
  { value: "any", label: "Qualquer papel" },
  { value: "med", label: "Quero ser médico" },
  { value: "ator", label: "Quero ser ator/avaliador" },
];

const WEIGHT_ROWS = [
  ["Papel", COMPAT_WEIGHTS.role, "complementar 100% · um flexível 85% · os dois flexíveis 70%"],
  ["Áreas em comum", COMPAT_WEIGHTS.areas, "proporção das suas áreas que o colega também quer treinar"],
  ["Disponibilidade", COMPAT_WEIGHTS.time, "turno em comum e dias da semana em comum"],
  ["Ritmo", COMPAT_WEIGHTS.pace, "treino livre, cronometrado ou simulação de prova"],
  ["Prova", COMPAT_WEIGHTS.exam, "mesma edição do Revalida"],
];

const panel = { background: "var(--surface-card)", border: 0, borderRadius: "var(--radius-xl)", padding: 22, boxShadow: "var(--shadow-sm)" };

function Compatibility({ count, onProfile }) {
  return (
    <Accordion
      title="Como a compatibilidade é calculada"
      icon="sliders-horizontal"
      meta={<span style={{ marginLeft: "auto", font: "600 12px var(--font-sans)", color: "var(--text-tertiary)" }}>{count} compatíveis</span>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10, font: "13px/1.5 var(--font-sans)", color: "var(--text-secondary)" }}>
        <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--surface-brand-soft)", color: "var(--text-brand)" }}>
          <b>Papel é eliminatório.</b> Quem quer ser médico(a) só encontra quem quer ser ator/avaliador, e vice-versa. Quem escolhe "Qualquer papel" combina com todos. Dois colegas que querem o mesmo papel
          não aparecem um para o outro.
        </div>
        {WEIGHT_ROWS.map(([label, weight, hint]) => (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "110px 1fr 36px", gap: 10, alignItems: "center" }}>
            <span style={{ font: "600 13px var(--font-sans)", color: "var(--text-primary)" }}>{label}</span>
            <span>
              <span style={{ display: "block", height: 6, borderRadius: 3, background: "var(--surface-sunken)", overflow: "hidden" }}>
                <span style={{ display: "block", width: `${weight * 2.5}%`, height: "100%", background: "var(--action-primary)" }} />
              </span>
              <span style={{ font: "12px var(--font-sans)", color: "var(--text-tertiary)" }}>{hint}</span>
            </span>
            <span style={{ font: "700 12px var(--font-mono)", color: "var(--text-primary)", textAlign: "right" }}>{weight}%</span>
          </div>
        ))}
        <div style={{ font: "12px var(--font-sans)", color: "var(--text-tertiary)" }}>
          Os seus dados vêm do{" "}
          <button
            type="button"
            onClick={onProfile}
            style={{ border: 0, background: "none", padding: 0, color: "var(--text-brand)", font: "inherit", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
          >
            perfil de estudo
          </button>
          .
        </div>
      </div>
    </Accordion>
  );
}

export function PracticeScreen({ go }) {
  const { backend } = useSession();
  const [params, setParams] = useSearchParams();
  const [toastNode, showToast] = useToast();
  const [saving, setSaving] = React.useState(false);
  const stationId = params.get("estacao");

  const profile = useLoad(() => backend.rpc("app_dupla_profile"), [backend]);
  // O Banco de estações leva o id da estação no endereço; ela só é lida quando há id.
  const stations = useLoad(() => (stationId ? backend.rpc("app_dupla_stations") : Promise.resolve(null)), [backend, stationId]);

  if (profile.error && !profile.data) return <LoadError error={profile.error} retry={profile.reload} />;
  if (profile.loading || !profile.data) return <Loading />;

  const saved = profile.data.profile;
  const station = stationId && Array.isArray(stations.data) ? stations.data.find((s) => s.id === stationId) : null;
  const openProfile = () => go("dupla-perfil");

  const removeStation = () => {
    const next = new URLSearchParams(params);
    next.delete("estacao");
    setParams(next, { replace: true });
  };

  const saveRole = async (role) => {
    if (!saved || saving || role === saved.role_pref) return;
    setSaving(true);
    try {
      profile.setData(await backend.rpc("app_dupla_save_profile", { p_profile: { role_pref: role } }));
    } catch (e) {
      showToast(messageOf(e), "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {toastNode}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <p style={{ margin: 0, font: "15px var(--font-sans)", color: "var(--text-tertiary)" }}>Encontre um colega com os mesmos objetivos e treine as estações da 2ª fase.</p>
        <Button variant="secondary" size="sm" icon="user-pen" onClick={openProfile}>
          Meu perfil de estudo
        </Button>
      </div>

      {station && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: "var(--radius-lg)", background: "var(--surface-brand-soft)", border: "1px solid var(--border-subtle)" }}>
          <Icon name="clipboard-list" size={18} style={{ color: "var(--text-brand)" }} />
          <span style={{ flex: 1, minWidth: 0, font: "600 14px var(--font-sans)", color: "var(--text-primary)" }}>
            {station.number != null ? `Estação ${station.number} · ${station.name}` : station.name}
          </span>
          <IconButton icon="x" label="Remover estação escolhida" variant="ghost" size="sm" onClick={removeStation} />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 640 }}>
        {saved ? (
          <>
            <div style={panel}>
              <h2 style={{ margin: 0, font: "600 18px var(--font-sans)", color: "var(--text-primary)" }}>Encontrar dupla</h2>
              <p style={{ margin: "2px 0 14px", font: "14px var(--font-sans)", color: "var(--text-tertiary)" }}>Arraste para a direita para estudar junto, para a esquerda para pular.</p>
              <SegmentedControl fullWidth label="Papel desejado" value={saved.role_pref} onChange={saveRole} options={ROLE_OPTIONS} />
            </div>
            {saved.radar_visible === false && <Banner tone="warning" icon="eye-off">Com o radar desligado, ninguém vê seu cartão.</Banner>}
            <div style={{ ...panel, padding: "48px 28px", textAlign: "center", borderRadius: "var(--radius-2xl)", boxShadow: "var(--shadow-md)" }}>
              <span
                aria-hidden="true"
                style={{ display: "inline-flex", width: 56, height: 56, borderRadius: "50%", background: "var(--surface-brand-soft)", color: "var(--text-brand)", alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="users" size={26} />
              </span>
              <div style={{ font: "700 18px var(--font-sans)", color: "var(--text-primary)", margin: "12px 0 4px" }}>Nenhum colega compatível agora</div>
              {saved.role_pref !== "any" && (
                <>
                  <div style={{ font: "14px/1.5 var(--font-sans)", color: "var(--text-tertiary)" }}>Ninguém online quer o papel complementar ao seu. Tente "Qualquer papel".</div>
                  <div style={{ marginTop: 16 }}>
                    <Button variant="secondary" icon="shuffle" disabled={saving} onClick={() => saveRole("any")}>
                      Aceitar qualquer papel
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <EmptyState
            icon="users"
            title="Encontrar dupla"
            description="Os seus dados vêm do perfil de estudo."
            action={
              <Button icon="user-pen" onClick={openProfile}>
                Meu perfil de estudo
              </Button>
            }
          />
        )}
        <Compatibility count={0} onProfile={openProfile} />
      </div>
    </div>
  );
}
