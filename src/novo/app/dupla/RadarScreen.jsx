// Treino em Dupla · radar de quem está online: é a tela padrão do "Praticar" (rota "dupla") desde o fluxo simples de 19/10; o baralho do match fica em `?modo=baralho`. Porte do visual de Match.jsx do pacote de
// design (RadarPulse, chave "Aparecer no radar", chave "Permitir convites diretos", abas, busca e lista com "Convidar"), com os
// dados REAIS de `app_dupla_radar`: nenhuma pessoa de exemplo. Fora desta tela, por decisão do dono: busca automática de duplas,
// "Salas abertas", convite rápido, grupo de WhatsApp. A aba "Perto de você" usa a cidade e o estado do perfil de estudo (sem GPS).
// Convite direto: quem convida entra na sala; quem recebe vê o aviso (InviteWatcher, em MatchModal.jsx).
// Fluxo simples: quem convida é o ator e escolhe a estação (sem estação, a lista do Banco de estações abre antes do convite).
import React from "react";
import { Avatar, Badge, Banner, Button, EmptyState, Icon, SegmentedControl, Switch, TextField, useToast } from "../../ds";
import { useSession } from "../session.jsx";
import { LoadError, Loading, isStaffRole, messageOf } from "../admin/common.jsx";
import { ROLE_PREF_LABEL, areaByLabel } from "./labels.js";
import { useDuplaChannel, useHeartbeat, useRadar } from "./live.js";
import { InviteWatcher } from "./MatchModal.jsx";
import { installAudioWake } from "./sound.js";
import { StationPicker } from "./room/StationPicker.jsx";
import { ABAS, NEAR_LABEL, STATE_LABEL, filterPeople, invitePerson } from "./radarApi.js";

const STYLE = `
@keyframes dupla-radar-ripple{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.9);opacity:0}}
@keyframes dupla-radar-spin{to{transform:rotate(360deg)}}
@keyframes dupla-radar-blip{0%,30%{opacity:0;transform:scale(.4)}45%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.5)}}
@media (prefers-reduced-motion:reduce){.dupla-radar-pulse *{animation:none!important}}
`;

const panel = { background: "var(--surface-card)", border: 0, borderRadius: "var(--radius-xl)", padding: 22, boxShadow: "var(--shadow-sm)" };
const mix = (pct) => `color-mix(in oklab, var(--teal-600) ${pct}%, transparent)`;

/** Radar do pacote de design (Match.jsx:7): círculos, varredura girando e pontos piscando quando ativo. */
function RadarPulse({ active, size = 56 }) {
  const ring = (inset, pct) => <span style={{ position: "absolute", inset, borderRadius: "50%", border: `1px solid ${mix(pct)}` }} />;
  const line = active ? 20 : 8;
  return (
    <span
      aria-hidden="true"
      className="dupla-radar-pulse"
      style={{
        position: "relative", width: size, height: size, flexShrink: 0, borderRadius: "50%",
        background: active ? "radial-gradient(circle, var(--teal-50) 0%, var(--teal-100) 100%)" : "var(--surface-sunken)",
        border: `1.5px solid ${active ? "var(--teal-300)" : "var(--border-default)"}`, overflow: "visible", transition: "background .3s, border-color .3s",
      }}
    >
      {active &&
        [0, 1].map((i) => (
          <span key={i} style={{ position: "absolute", inset: -1, borderRadius: "50%", border: "2px solid var(--teal-500)", animation: `dupla-radar-ripple 2.4s ${i * 1.2}s ease-out infinite`, pointerEvents: "none" }} />
        ))}
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden" }}>
        {ring("22%", active ? 35 : 15)}
        {ring("38%", active ? 45 : 20)}
        <span style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: mix(line) }} />
        <span style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: mix(line) }} />
        {active && (
          <span
            style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "conic-gradient(from 0deg, transparent 0deg, transparent 270deg, color-mix(in oklab, var(--teal-500) 55%, transparent) 355deg, var(--teal-500) 360deg)",
              animation: "dupla-radar-spin 2.4s linear infinite",
            }}
          />
        )}
        {active &&
          [[24, 30, 0], [66, 22, 0.8], [58, 70, 1.6]].map(([x, y, delay]) => (
            <span
              key={`${x}-${y}`}
              style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: "50%", background: "var(--teal-600)", boxShadow: "0 0 6px var(--teal-500)", animation: `dupla-radar-blip 2.4s ${delay}s ease-out infinite`, opacity: 0 }}
            />
          ))}
      </span>
      <span style={{ position: "absolute", left: "50%", top: "50%", width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: "50%", background: active ? "var(--teal-700)" : "var(--text-tertiary)", boxShadow: "0 0 0 3px var(--surface-card)" }} />
    </span>
  );
}

/** Linha de uma pessoa: avatar com bolinha de situação, nome, instituição, papel, situação, compatibilidade e "Convidar". */
function PersonRow({ person, first, busy, showNear, onInvite }) {
  const free = person.state === "livre";
  const sub = [person.school || person.city, ROLE_PREF_LABEL[person.role_pref] ?? ROLE_PREF_LABEL.any].filter(Boolean).join(" · ");
  const near = showNear ? NEAR_LABEL[person.near] : null;
  return (
    <li
      style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 0", borderTop: first ? 0 : "1px solid var(--border-subtle)", listStyle: "none" }}
      data-testid="radar-pessoa"
    >
      <span style={{ position: "relative", display: "inline-flex" }}>
        <Avatar name={person.public_name} size={42} />
        <span
          aria-hidden="true"
          style={{ position: "absolute", right: -1, bottom: -1, width: 12, height: 12, borderRadius: "50%", border: "2px solid var(--surface-card)", background: free ? "var(--success-solid)" : "var(--warning-solid)" }}
        />
      </span>
      <div style={{ flex: "1 1 180px", minWidth: 0 }}>
        <div style={{ font: "600 16px var(--font-sans)", color: "var(--text-primary)", overflowWrap: "anywhere" }}>{person.public_name}</div>
        {person.handle && <div style={{ font: "500 12px var(--font-mono)", color: "var(--text-tertiary)", overflowWrap: "anywhere" }}>{`@${person.handle}`}</div>}
        <div style={{ font: "12px var(--font-sans)", color: "var(--text-tertiary)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {sub && <span>{sub}</span>}
          <span style={{ color: free ? "var(--success-text)" : "var(--warning-text)", fontWeight: 600 }}>{STATE_LABEL[person.state] ?? STATE_LABEL.livre}</span>
          {near && (
            <Badge size="sm" tone="brand" icon="map-pin">
              {near}
            </Badge>
          )}
        </div>
      </div>
      {typeof person.compat === "number" && (
        <span style={{ font: "600 12px var(--font-mono)", color: "var(--text-brand)" }} title="Compatibilidade">
          {person.compat}%
        </span>
      )}
      {person.can_invite ? (
        <Button icon="send" loading={busy} aria-label={`Convidar ${person.public_name}`} onClick={() => onInvite(person)}>
          Convidar
        </Button>
      ) : (
        person.why_not === "Não recebe convites." && <span style={{ font: "600 12px var(--font-sans)", color: "var(--text-tertiary)" }}>Não recebe convites</span>
      )}
    </li>
  );
}

function Empty({ aba, needsCity, hasQuery, canSolo, stationId, go, onClearQuery }) {
  if (needsCity) {
    return (
      <EmptyState
        icon="map-pin"
        title="Informe sua cidade no perfil para ver quem está perto"
        description="Usamos só a cidade e o estado que você escrever no perfil de estudo. Nunca a localização do aparelho."
        action={
          <Button icon="user-pen" onClick={() => go("dupla-perfil")}>
            Meu perfil de estudo
          </Button>
        }
      />
    );
  }
  if (hasQuery) {
    return (
      <EmptyState
        icon="search-x"
        title="Ninguém com esse nome, @ ou área"
        action={
          <Button variant="secondary" onClick={onClearQuery}>
            Limpar busca
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon="users"
      title={aba === "perto" ? "Ninguém perto de você online agora" : "Ninguém online agora"}
      description="Quando um colega entrar, ele aparece aqui sozinho."
      action={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {canSolo && stationId && (
            <Button variant="secondary" icon="user" onClick={() => go("estacao", { id: stationId })}>
              Treinar sozinho
            </Button>
          )}
          <Button icon="layers" onClick={() => go("dupla", stationId ? { estacao: stationId, modo: "baralho" } : { modo: "baralho" })}>
            Procurar dupla
          </Button>
        </div>
      }
    />
  );
}

/**
 * @param {{ go: (route: string, query?: Record<string, string>) => void, profile: { setData(d: object): void }, saved: object,
 *   station: { id: string, number?: number | null, area?: string } | null, stationId: string | null }} p
 */
export function RadarScreen({ go, profile, saved, station, stationId }) {
  const { backend, boot } = useSession();
  const [toastNode, showToast] = useToast();
  const [aba, setAba] = React.useState("online");
  const [query, setQuery] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [inviting, setInviting] = React.useState(null);
  const [picking, setPicking] = React.useState(null);

  // Mesmos sinal e canal do baralho: a pessoa aparece online, recebe convites e o áudio fica pronto antes do primeiro clique.
  useHeartbeat("livre");
  const { onlineIds, inviteTick, live } = useDuplaChannel({ radar: saved.radar_visible !== false });
  React.useEffect(() => {
    installAudioWake();
  }, []);
  const radar = useRadar({ stationId, aba, onlineIds, live });
  // Treino sozinho hoje só para a equipe (Banco único); quando o acesso mudar, é só trocar esta linha.
  const canSolo = isStaffRole(boot?.role);

  const visible = saved.radar_visible !== false;
  const direct = saved.allow_direct_invites !== false;
  const people = React.useMemo(() => filterPeople(radar.people, query), [radar.people, query]);
  const onlineCount = radar.online;
  const area = station?.area ? areaByLabel(station.area) : null;

  const save = async (patch) => {
    if (saving) return;
    setSaving(true);
    try {
      profile.setData(await backend.rpc("app_dupla_save_profile", { p_profile: patch }));
      void radar.refresh();
    } catch (e) {
      showToast(messageOf(e), "danger");
    } finally {
      setSaving(false);
    }
  };

  // Fluxo simples (dono, 19/10): quem convida é o ator e escolhe a estação. Sem estação escolhida, a lista do Banco de estações
  // abre antes do convite; o convite sempre leva a estação (o banco recusa sem ela).
  const sendInvite = async (person, chosen) => {
    if (inviting) return;
    setInviting(person.user_id);
    try {
      const res = await invitePerson(backend, person.user_id, chosen);
      go("dupla-sala", { sala: res.room_id });
    } catch (e) {
      showToast(messageOf(e), "danger");
      void radar.refresh();
      setInviting(null);
    }
  };
  const invite = (person) => (stationId ? sendInvite(person, stationId) : setPicking(person));

  if (radar.error && !radar.loading && radar.people.length === 0 && !radar.me) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {toastNode}
        <LoadError error={radar.error} retry={radar.refresh} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {toastNode}
      <style>{STYLE}</style>
      <InviteWatcher go={go} meName={saved.public_name} inviteTick={inviteTick} live={live} />
      {picking && (
        <StationPicker
          title={`Escolha a estação para treinar com ${picking.public_name}`}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            const person = picking;
            setPicking(null);
            void sendInvite(person, id);
          }}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, font: "700 22px var(--font-sans)", color: "var(--text-primary)" }}>Quem está online</h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" icon="layers" onClick={() => go("dupla", stationId ? { estacao: stationId, modo: "baralho" } : { modo: "baralho" })}>
            Encontrar por perfil (match)
          </Button>
          <Button variant="secondary" size="sm" icon="user-pen" onClick={() => go("dupla-perfil")}>
            Meu perfil de estudo
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: "var(--radius-lg)", background: "var(--surface-brand-soft)", border: "1px solid var(--border-subtle)", flexWrap: "wrap" }}>
        <Icon name="clipboard-list" size={18} style={{ color: "var(--text-brand)" }} />
        <span style={{ flex: 1, minWidth: 0, font: "600 14px var(--font-sans)", color: "var(--text-primary)" }}>
          {station ? [station.number != null ? `Estação ${station.number}` : "Estação", area?.card ?? station.area].filter(Boolean).join(" · ") : "Nenhuma estação escolhida: você escolhe ao convidar"}
        </span>
        <Button variant="ghost" size="sm" onClick={() => go("estacoes")}>
          {station ? "Trocar estação" : "Escolher estação"}
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 720 }}>
        {radar.openRoom && (
          <Banner
            tone="brand"
            icon="video"
            title={`Sala aberta com ${radar.openRoom.partner_name}`}
            action={
              <Button size="sm" icon="video" onClick={() => go("dupla-sala", { sala: radar.openRoom.id })}>
                Abrir sala agora
              </Button>
            }
          />
        )}

        <div style={{ ...panel, display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 16, borderBottom: "1px solid var(--border-subtle)" }}>
            <RadarPulse active={visible} />
            <div style={{ flex: 1 }}>
              <Switch
                label="Aparecer no radar"
                description={visible ? `Você está visível no radar · ${onlineCount} ${onlineCount === 1 ? "colega online" : "colegas online"}` : "Você não aparece para outros alunos"}
                checked={visible}
                disabled={saving}
                onChange={(e) => save({ radar_visible: e.target.checked })}
              />
            </div>
          </div>
          <div style={{ paddingTop: 16 }}>
            <Switch
              label="Permitir convites diretos"
              description="Colegas podem chamar você para uma estação"
              checked={direct}
              disabled={saving}
              onChange={(e) => save({ allow_direct_invites: e.target.checked })}
            />
          </div>
        </div>

        <div style={panel}>
          <SegmentedControl fullWidth label="Lista" value={aba} onChange={setAba} options={ABAS} />
          <div style={{ margin: "14px 0 12px" }}>
            <TextField icon="search" aria-label="Buscar nome, @ ou área" placeholder="Buscar nome, @ ou área" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", font: "12px var(--font-sans)", color: "var(--text-tertiary)", marginBottom: 6 }}>
            <span>{`${onlineCount} ${onlineCount === 1 ? "colega online" : "colegas online"}`}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: live ? "var(--success-solid)" : "var(--text-tertiary)" }} />
              {live ? "Tempo real" : "Atualiza sozinho"}
            </span>
          </div>
          {radar.loading && radar.people.length === 0 ? (
            <Loading />
          ) : people.length === 0 ? (
            <Empty
              aba={aba}
              needsCity={radar.needsCity}
              hasQuery={query.trim() !== "" && radar.people.length > 0}
              canSolo={canSolo}
              stationId={stationId}
              go={go}
              onClearQuery={() => setQuery("")}
            />
          ) : (
            <ul aria-label="Colegas online" style={{ margin: 0, padding: 0 }}>
              {people.map((person, index) => (
                <PersonRow key={person.user_id} person={person} first={index === 0} busy={inviting === person.user_id} showNear={aba === "perto"} onInvite={invite} />
              ))}
            </ul>
          )}
          {radar.error && radar.people.length > 0 && (
            <div role="status" style={{ marginTop: 10, font: "12px var(--font-sans)", color: "var(--warning-text)" }}>
              Não foi possível atualizar a lista agora. Mostrando a última.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
