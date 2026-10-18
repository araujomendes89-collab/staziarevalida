// Praticar em dupla (Treinamento em Dupla): cabeçalho com colegas online e matches de hoje, escolha do papel, estação escolhida,
// baralho de colegas (arrastar ou ← →), "Deu match!" e "Como a compatibilidade é calculada". Porte de Match.jsx do pacote de design
// (21-29, 120-180). Sem "Convite rápido", busca automática, lista de colegas e "Agendar sessão" (decisões do dono). O chat de estudo
// (Etapa C) entra pelo "Enviar mensagem" do "Deu match!" e pelo botão "Conversas" do cabeçalho.
// O baralho vem de app_dupla_deck e só se mexe no cartão de cima quando a pessoa o escolhe (mergeDeck).
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Accordion, Badge, Banner, Button, EmptyState, Icon, IconButton, MatchCard, SegmentedControl, useToast } from "../../ds";
import { useSession } from "../session.jsx";
import { LoadError, Loading, messageOf, useLoad } from "../admin/common.jsx";
import { COMPAT_WEIGHTS, toCard } from "./card.js";
import { firstName, mergeDeck } from "./deck.js";
import { useDuplaChannel, useHeartbeat } from "./live.js";
import { InviteWatcher, MatchModal } from "./MatchModal.jsx";
import { installAudioWake, playSkipSound } from "./sound.js";
import { useChatWindows } from "./chat/ChatList.jsx";

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

const DECK_POLL_LOCAL_MS = 20000;
const DECK_POLL_LIVE_MS = 30000;

function Compatibility({ count, hidden, onProfile }) {
  const summary = `${count} ${count === 1 ? "compatível" : "compatíveis"}` + (hidden ? ` · ${hidden} ${hidden === 1 ? "oculto" : "ocultos"} pelo papel` : "");
  return (
    <Accordion
      title="Como a compatibilidade é calculada"
      icon="sliders-horizontal"
      meta={<span style={{ marginLeft: "auto", font: "600 12px var(--font-sans)", color: "var(--text-tertiary)" }}>{summary}</span>}
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

/** Dica do primeiro uso (Match.jsx:21-29): fecha pelo X ou na primeira escolha. */
function SwipeHint({ onClose }) {
  return (
    <div
      role="status"
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--surface-inverse)", color: "var(--text-inverse)", borderRadius: 14, font: "600 13px var(--font-sans)" }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--red-200)" }}>
        <Icon name="arrow-left" size={16} />
        Recusar
      </span>
      <span style={{ flex: 1, textAlign: "center", color: "var(--teal-200)", fontWeight: 500 }}>Arraste o cartão</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--green-200)" }}>
        Estudar
        <Icon name="arrow-right" size={16} />
      </span>
      <button type="button" aria-label="Fechar dica" onClick={onClose} style={{ border: 0, background: "transparent", color: "var(--teal-200)", cursor: "pointer", display: "inline-flex", padding: 0 }}>
        <Icon name="x" size={15} />
      </button>
    </div>
  );
}

/** Botão redondo de Pular / Estudar junto (Match.jsx:1-6). */
function ActionButton({ label, kbd, size, primary, icon, onClick, disabled }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        style={{
          width: size, height: size, borderRadius: "50%", border: primary ? 0 : "1px solid var(--border-subtle)", background: primary ? "var(--action-primary)" : "var(--surface-card)",
          color: primary ? "var(--text-inverse)" : "var(--danger-solid)", boxShadow: "var(--shadow-md)", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon name={icon} size={Math.round(size * 0.42)} />
      </button>
      <span aria-hidden="true" style={{ font: "600 12px var(--font-sans)", color: "var(--text-tertiary)", display: "inline-flex", alignItems: "center", gap: 5 }}>
        {label}
        <kbd style={{ font: "600 10px var(--font-mono)", padding: "1px 5px", borderRadius: 4, background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}>{kbd}</kbd>
      </span>
    </div>
  );
}

const pill = {
  display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", borderRadius: "var(--radius-pill)", font: "600 13px var(--font-sans)",
};

/**
 * Baralho do servidor (`app_dupla_deck`): consulta na entrada e a cada 20 s no banco local (30 s com o tempo real ligado), ao voltar a
 * aba e a rede. Os cartões já na tela não mudam de lugar (mergeDeck); quem a pessoa acabou de escolher não volta nem se uma resposta
 * atrasada ainda o trouxer. Com o "Deu match!" aberto (`freeze`), só os contadores se atualizam.
 */
function useDeck(backend, live) {
  const [state, setState] = React.useState({ loaded: false, error: null, cards: [], hidden: 0, online: 0, matchesToday: 0, openRoom: null });
  const seq = React.useRef(0);
  const chosen = React.useRef(new Set());
  const frozen = React.useRef(false);

  const refresh = React.useCallback(
    async ({ reset = false } = {}) => {
      const mine = ++seq.current;
      try {
        const res = await backend.rpc("app_dupla_deck");
        if (mine !== seq.current) return;
        const incoming = (Array.isArray(res?.cards) ? res.cards : []).filter((card) => !chosen.current.has(card.user_id));
        setState((prev) => ({
          loaded: true,
          error: null,
          cards: frozen.current ? prev.cards : reset ? incoming : mergeDeck(prev.cards, incoming),
          hidden: frozen.current ? prev.hidden : res?.hidden_by_role ?? 0,
          online: res?.online ?? 0,
          matchesToday: res?.matches_today ?? 0,
          openRoom: frozen.current ? prev.openRoom : res?.open_room ?? null,
        }));
      } catch (e) {
        if (mine !== seq.current) return;
        setState((prev) => (prev.loaded ? prev : { ...prev, error: e }));
      }
    },
    [backend],
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    const timer = setInterval(() => void refresh(), live ? DECK_POLL_LIVE_MS : DECK_POLL_LOCAL_MS);
    const onVisible = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    const onOnline = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh, live]);

  const take = React.useCallback((id) => {
    chosen.current.add(id);
    setState((prev) => ({ ...prev, cards: prev.cards.filter((card) => card.user_id !== id) }));
  }, []);
  const restore = React.useCallback((card) => {
    chosen.current.delete(card.user_id);
    setState((prev) => ({ ...prev, cards: [card, ...prev.cards.filter((c) => c.user_id !== card.user_id)] }));
  }, []);
  const freeze = React.useCallback((on) => {
    frozen.current = on;
  }, []);

  return { ...state, refresh, take, restore, freeze };
}

function PracticeBoard({ go, profile, saved, stationId, station, onRemoveStation }) {
  const { backend } = useSession();
  const [toastNode, showToast] = useToast();
  const [saving, setSaving] = React.useState(false);
  const [hint, setHint] = React.useState(true);
  const [cmd, setCmd] = React.useState(null);
  const [matched, setMatched] = React.useState(null);
  const [leaving, setLeaving] = React.useState(false);
  const pressCount = React.useRef(0);
  const openProfile = () => go("dupla-perfil");
  const chat = useChatWindows({ go, onError: (text) => showToast(text, "danger") });

  // Tempo real e sinal: a pessoa aparece online, recebe convites e o áudio fica pronto antes do primeiro clique.
  useHeartbeat("livre");
  const { onlineIds, inviteTick, live } = useDuplaChannel({ radar: saved.radar_visible !== false });
  React.useEffect(() => {
    installAudioWake();
  }, []);
  const deck = useDeck(backend, live);

  const [top, ...rest] = deck.cards;
  const openRoom = deck.openRoom;
  const stackBehind = rest.slice(0, 2).map((person, index) => ({ person, depth: index + 1 })).reverse();
  const stationForSwipe = station?.id ?? null;

  const saveRole = async (role) => {
    if (saving || role === saved.role_pref) return;
    setSaving(true);
    try {
      profile.setData(await backend.rpc("app_dupla_save_profile", { p_profile: { role_pref: role } }));
      void deck.refresh({ reset: true });
    } catch (e) {
      showToast(messageOf(e), "danger");
    } finally {
      setSaving(false);
    }
  };

  const choose = async (card, direction) => {
    setHint(false);
    setCmd(null);
    deck.take(card.user_id);
    if (direction === "left") playSkipSound();
    try {
      const result = await backend.rpc("app_dupla_swipe", {
        p_to: card.user_id,
        p_direction: direction,
        p_station_id: direction === "right" ? stationForSwipe : null,
      });
      if (result?.matched) {
        deck.freeze(true);
        setMatched({ roomId: result.room_id, partnerId: result.partner?.user_id ?? card.user_id, partnerName: result.partner?.public_name ?? card.public_name });
        void deck.refresh();
      }
    } catch (e) {
      deck.restore(card);
      showToast(messageOf(e), "danger");
    }
  };

  // Teclas ← e → (Match.jsx:135): fora de campo de texto e sem janela aberta.
  const keyState = React.useRef({});
  keyState.current = { canPress: Boolean(top) && !matched };
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (!keyState.current.canPress || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      if (target && (/^(input|textarea|select)$/i.test(target.tagName ?? "") || target.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      setCmd({ dir: e.key === "ArrowRight" ? 1 : -1, n: ++pressCount.current });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const press = (dir) => {
    if (top && !matched) setCmd({ dir, n: ++pressCount.current });
  };

  const closeMatch = async () => {
    if (!matched || leaving) return;
    setLeaving(true);
    try {
      await backend.rpc("app_dupla_leave", { p_room_id: matched.roomId });
    } catch (e) {
      showToast(messageOf(e), "danger");
    } finally {
      deck.freeze(false);
      setMatched(null);
      setLeaving(false);
      void deck.refresh();
    }
  };

  // "Enviar mensagem": fecha o "Deu match!" sem sair da sala (o convite segue valendo para o outro) e abre o chat do par.
  const messageMatch = async () => {
    if (!matched || leaving) return;
    const { partnerId } = matched;
    deck.freeze(false);
    setMatched(null);
    void deck.refresh();
    await chat.openWith(partnerId);
  };

  const leaveOpenRoom = async () => {
    if (!openRoom || leaving) return;
    setLeaving(true);
    try {
      await backend.rpc("app_dupla_leave", { p_room_id: openRoom.id });
    } catch (e) {
      showToast(messageOf(e), "danger");
    } finally {
      setLeaving(false);
      void deck.refresh();
    }
  };

  const onlineCount = onlineIds ? onlineIds.size : deck.online;
  const matches = deck.matchesToday;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {toastNode}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <p style={{ margin: 0, font: "15px var(--font-sans)", color: "var(--text-tertiary)" }}>Encontre um colega com os mesmos objetivos e treine as estações da 2ª fase.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" icon="user-pen" onClick={openProfile}>
            Meu perfil de estudo
          </Button>
          <Button variant="secondary" size="sm" icon="message-circle" onClick={chat.openList}>
            Conversas
          </Button>
          {deck.loaded && (
            <>
              <span style={{ ...pill, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success-solid)", boxShadow: "0 0 0 4px var(--success-bg)" }} />
                {`${onlineCount} ${onlineCount === 1 ? "colega" : "colegas"} online`}
              </span>
              <span
                style={{
                  ...pill,
                  background: matches ? "var(--teal-700)" : "var(--surface-card)",
                  color: matches ? "var(--text-inverse)" : "var(--text-primary)",
                  border: matches ? 0 : "1px solid var(--border-subtle)",
                }}
              >
                <Icon name="handshake" size={15} />
                {`${matches} ${matches === 1 ? "match" : "matches"} hoje`}
              </span>
            </>
          )}
        </div>
      </div>

      {station && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: "var(--radius-lg)", background: "var(--surface-brand-soft)", border: "1px solid var(--border-subtle)" }}>
          <Icon name="clipboard-list" size={18} style={{ color: "var(--text-brand)" }} />
          <span style={{ flex: 1, minWidth: 0, font: "600 14px var(--font-sans)", color: "var(--text-primary)" }}>
            {station.number != null ? `Estação ${station.number} · ${station.name}` : station.name}
          </span>
          <IconButton icon="x" label="Remover estação escolhida" variant="ghost" size="sm" onClick={onRemoveStation} />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 640 }}>
        {openRoom ? (
          <Banner
            tone="brand"
            icon="video"
            title={`Sala aberta com ${openRoom.partner_name}`}
            action={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="secondary" size="sm" loading={leaving} onClick={leaveOpenRoom}>
                  Sair da sala
                </Button>
                <Button size="sm" icon="video" onClick={() => go("dupla-sala", { sala: openRoom.id })}>
                  Abrir sala agora
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <div style={panel}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, font: "600 18px var(--font-sans)", color: "var(--text-primary)" }}>Encontrar dupla</h2>
                  <p style={{ margin: "2px 0 14px", font: "14px var(--font-sans)", color: "var(--text-tertiary)" }}>Arraste para a direita para estudar junto, para a esquerda para pular.</p>
                </div>
                {matches > 0 && (
                  <Badge size="sm" tone="brand" icon="handshake">
                    {`${matches} ${matches === 1 ? "match" : "matches"}`}
                  </Badge>
                )}
              </div>
              <SegmentedControl fullWidth label="Papel desejado" value={saved.role_pref} onChange={saveRole} options={ROLE_OPTIONS} />
            </div>
            {saved.radar_visible === false && <Banner tone="warning" icon="eye-off">Com o radar desligado, ninguém vê seu cartão.</Banner>}
            {hint && top && <SwipeHint onClose={() => setHint(false)} />}
            {deck.error && !deck.loaded ? (
              <LoadError error={deck.error} retry={() => deck.refresh()} />
            ) : !deck.loaded ? (
              <Loading />
            ) : (
              <>
                <div style={{ position: "relative", paddingBottom: 22 }}>
                  {stackBehind.map(({ person, depth }) => (
                    <div
                      key={person.user_id}
                      aria-hidden="true"
                      style={{
                        position: "absolute", left: depth * 14, right: depth * 14, bottom: 0, top: depth * 12, borderRadius: "var(--radius-xl)",
                        background: depth === 1 ? "var(--surface-card)" : "var(--surface-subtle)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)",
                        display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 4,
                      }}
                    >
                      {depth === 1 && <span style={{ font: "600 11px var(--font-sans)", color: "var(--text-tertiary)" }}>Próximo: {firstName(person.public_name)}</span>}
                    </div>
                  ))}
                  <div style={{ position: "relative", zIndex: 1 }}>
                    {top ? (
                      <MatchCard key={top.user_id} person={toCard(top)} onSwipe={(direction) => choose(top, direction)} command={cmd} />
                    ) : (
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
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", gap: 28, paddingTop: 4 }}>
                  <ActionButton label="Pular" kbd="←" size={60} icon="x" disabled={!top} onClick={() => press(-1)} />
                  <ActionButton label="Estudar junto" kbd="→" size={76} primary icon="handshake" disabled={!top} onClick={() => press(1)} />
                </div>
              </>
            )}
          </>
        )}
        <Compatibility count={deck.cards.length} hidden={deck.hidden} onProfile={openProfile} />
      </div>

      {matched && (
        <MatchModal
          meName={saved.public_name}
          partnerName={matched.partnerName}
          busy={leaving}
          onOpen={() => go("dupla-sala", { sala: matched.roomId })}
          onMessage={matched.partnerId ? messageMatch : undefined}
          onClose={closeMatch}
        />
      )}
      {chat.node}
      <InviteWatcher go={go} meName={saved.public_name} inviteTick={inviteTick} live={live} paused={chat.chatOpen} />
    </div>
  );
}

export function PracticeScreen({ go }) {
  const { backend } = useSession();
  const [params, setParams] = useSearchParams();
  const stationId = params.get("estacao");

  const profile = useLoad(() => backend.rpc("app_dupla_profile"), [backend]);
  // O Banco de estações leva o id da estação no endereço; ela só é lida quando há id.
  const stations = useLoad(() => (stationId ? backend.rpc("app_dupla_stations") : Promise.resolve(null)), [backend, stationId]);

  if (profile.error && !profile.data) return <LoadError error={profile.error} retry={profile.reload} />;
  if (profile.loading || !profile.data) return <Loading />;

  const saved = profile.data.profile;
  const station = stationId && Array.isArray(stations.data) ? stations.data.find((s) => s.id === stationId) : null;

  const removeStation = () => {
    const next = new URLSearchParams(params);
    next.delete("estacao");
    setParams(next, { replace: true });
  };

  if (saved) {
    return <PracticeBoard go={go} profile={profile} saved={saved} stationId={stationId} station={station} onRemoveStation={removeStation} />;
  }

  // Sem perfil de estudo: nada de sinal, Presença ou baralho (o servidor não grava sinal sem perfil).
  const openProfile = () => go("dupla-perfil");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
        <Compatibility count={0} hidden={0} onProfile={openProfile} />
      </div>
    </div>
  );
}
