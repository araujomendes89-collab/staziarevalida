// Administração do Stazia Play: métricas, regras (XP, limites, flags), medalhas, missões,
// recompensas, auditoria por aluno e recálculo. Tudo passa por app_admin_gamification_* (só admin).
import React from "react";
import { Badge, Banner, Button, Card, StatCard, Switch, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { dateTimeBR, LoadError, Loading, messageOf, useLoad } from "./common.jsx";
import { EVENT_LABEL } from "../play/format.js";

function RuleRow({ rule, onSave }) {
  const isBool = typeof rule.value === "boolean";
  const [text, setText] = React.useState(isBool ? "" : JSON.stringify(rule.value));
  const [state, setState] = React.useState({ saving: false, error: null });
  const save = async (value, enabled) => {
    setState({ saving: true, error: null });
    try {
      await onSave(rule.key, value, enabled);
      setState({ saving: false, error: null });
    } catch (error) {
      setState({ saving: false, error: messageOf(error, "Valor inválido.") });
    }
  };
  const submit = (event) => {
    event.preventDefault();
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      return setState({ saving: false, error: "Use um número, um texto entre aspas ou uma lista." });
    }
    save(value, rule.enabled);
  };
  return (
    <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "600 13px var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis" }}>{rule.key}</div>
        <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{rule.description}</div>
        {state.error && <div style={{ font: "var(--type-caption)", color: "var(--danger-text)" }}>{state.error}</div>}
      </div>
      {isBool ? (
        <Switch checked={rule.value} label={rule.value ? "Ligado" : "Desligado"} onChange={(e) => save(e.target.checked, rule.enabled)} />
      ) : (
        <TextField value={text} onChange={(e) => setText(e.target.value)} aria-label={rule.key} />
      )}
      {isBool ? <span /> : (
        <Button size="sm" type="submit" loading={state.saving} disabled={text === JSON.stringify(rule.value)}>Salvar</Button>
      )}
    </form>
  );
}

function RulesPanel({ rules, onSave }) {
  const [filter, setFilter] = React.useState("flags");
  const groups = [...new Set(rules.map((r) => r.key.split(".")[0]))];
  const LABEL = { flags: "Ligar e desligar", names: "Nomes", xp: "XP por evento", coins: "Moedas", repeat: "Repetição", fraud: "Antifraude", score: "Stazia Score", ranking: "Ranking", streak: "Sequência", league: "Ligas", missions: "Missões", trail: "Trilha" };
  return (
    <Card>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {groups.map((g) => (
          <button key={g} type="button" className="sm-chip" aria-pressed={filter === g} onClick={() => setFilter(g)}>{LABEL[g] ?? g}</button>
        ))}
      </div>
      {rules.filter((r) => r.key.startsWith(`${filter}.`)).map((r) => <RuleRow key={r.key + JSON.stringify(r.value)} rule={r} onSave={onSave} />)}
    </Card>
  );
}

function AchievementsPanel({ items, onSave }) {
  const [draft, setDraft] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null });
  const toggle = (a) => onSave({ ...a, is_active: !a.is_active }).catch(() => {});
  const submit = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null });
    try {
      const criteria = JSON.parse(draft.criteria);
      await onSave({ ...draft, criteria, xp_reward: Number(draft.xp_reward), coins_reward: Number(draft.coins_reward) });
      setDraft(null);
      setState({ saving: false, error: null });
    } catch (error) {
      setState({ saving: false, error: error instanceof SyntaxError ? "Critério precisa ser um JSON válido." : messageOf(error) });
    }
  };
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ font: "var(--type-label)" }}>Medalhas ({items.length})</div>
        <Button size="sm" variant="secondary" icon="plus" onClick={() => setDraft({ slug: "", name: "", description: "", category: "especiais", icon: "award", rarity: "comum", criteria: '{"type":"questions_total","n":50}', xp_reward: 20, coins_reward: 10, is_secret: false, is_active: true, position: 99 })}>Nova medalha</Button>
      </div>
      {draft && (
        <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, padding: 12, borderRadius: 14, background: "var(--surface-subtle)", marginBottom: 10 }}>
          <TextField label="Identificador" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} hint="letras minúsculas, números e _" />
          <TextField label="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <TextField label="Descrição" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <TextField label="Categoria" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} hint="estudo, precisao, streak, areas, evolucao, especiais" />
          <TextField label="Ícone" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
          <TextField label="Raridade" value={draft.rarity} onChange={(e) => setDraft({ ...draft, rarity: e.target.value })} hint="comum, rara, epica, lendaria" />
          <TextField label="Critério (JSON)" value={draft.criteria} onChange={(e) => setDraft({ ...draft, criteria: e.target.value })} hint="type: questions_total, accuracy, streak, area, comeback, learned, day_volume, hour_window, survivor, manual" />
          <TextField label="XP" type="number" value={draft.xp_reward} onChange={(e) => setDraft({ ...draft, xp_reward: e.target.value })} />
          <TextField label="Moedas" type="number" value={draft.coins_reward} onChange={(e) => setDraft({ ...draft, coins_reward: e.target.value })} />
          <Switch checked={draft.is_secret} label="Secreta" description="Critério escondido até desbloquear" onChange={(e) => setDraft({ ...draft, is_secret: e.target.checked })} />
          {state.error && <Banner tone="danger">{state.error}</Banner>}
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="submit" loading={state.saving}>Salvar medalha</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
          </div>
        </form>
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((a) => (
          <div key={a.slug} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--border-subtle)", opacity: a.is_active ? 1 : 0.55 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "600 13px var(--font-sans)" }}>{a.name} <span style={{ font: "500 11px var(--font-mono)", color: "var(--text-tertiary)" }}>{a.slug}</span></div>
              <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.category} · {a.rarity} · +{a.xp_reward} XP · {JSON.stringify(a.criteria)}</div>
            </div>
            {a.is_secret && <Badge size="sm">secreta</Badge>}
            <Button size="sm" variant="secondary" onClick={() => setDraft({ ...a, criteria: JSON.stringify(a.criteria) })}>Editar</Button>
            <Switch checked={a.is_active} label={a.is_active ? "Ativa" : "Inativa"} onChange={() => toggle(a)} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function SimpleEditor({ title, items, fields, onSave }) {
  const [edit, setEdit] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null });
  const submit = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null });
    try {
      const payload = { slug: edit.slug };
      for (const [k, , type] of fields) payload[k] = type === "number" ? Number(edit[k]) : edit[k];
      await onSave(payload);
      setEdit(null);
      setState({ saving: false, error: null });
    } catch (error) {
      setState({ saving: false, error: messageOf(error) });
    }
  };
  return (
    <Card>
      <div style={{ font: "var(--type-label)", marginBottom: 8 }}>{title}</div>
      {items.map((m) => (
        <div key={m.slug} style={{ padding: "8px 0", borderTop: "1px solid var(--border-subtle)" }}>
          {edit?.slug === m.slug ? (
            <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, alignItems: "end" }}>
              {fields.map(([k, label, type]) => (
                <TextField key={k} label={label} type={type === "number" ? "number" : "text"} value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <Button size="sm" type="submit" loading={state.saving}>Salvar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
              </div>
              {state.error && <Banner tone="danger">{state.error}</Banner>}
            </form>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center", opacity: m.active === false ? 0.55 : 1 }}>
              <div style={{ flex: 1, minWidth: 0, font: "600 13px var(--font-sans)" }}>
                {m.title ?? m.name} <span style={{ font: "500 11px var(--font-mono)", color: "var(--text-tertiary)" }}>{m.slug}</span>
                <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{fields.map(([k, label]) => `${label}: ${m[k]}`).join(" · ")}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setEdit({ ...m })}>Editar</Button>
              <Switch checked={m.active !== false} label={m.active !== false ? "Ativa" : "Inativa"} onChange={() => onSave({ slug: m.slug, active: !(m.active !== false) }).catch(() => {})} />
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}

function UserAudit() {
  const { backend } = useSession();
  const [id, setId] = React.useState("");
  const [data, setData] = React.useState(null);
  const [state, setState] = React.useState({ busy: false, error: null });
  const load = async (event) => {
    event?.preventDefault();
    setState({ busy: true, error: null });
    try {
      setData(await backend.rpc("app_admin_gamification_user", { p_user_id: id.trim(), p_limit: 100 }));
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error: messageOf(error, "Informe um identificador de usuário válido.") });
    }
  };
  const recalc = async () => {
    setState({ busy: true, error: null });
    try {
      await backend.rpc("app_admin_gamification_recalculate", { p_user_id: id.trim() });
      await load();
    } catch (error) {
      setState({ busy: false, error: messageOf(error) });
    }
  };
  return (
    <Card>
      <div style={{ font: "var(--type-label)", marginBottom: 8 }}>Auditoria por aluno</div>
      <form onSubmit={load} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px" }}>
          <TextField label="Identificador do usuário (UUID)" value={id} onChange={(e) => setId(e.target.value)} />
        </div>
        <Button type="submit" loading={state.busy}>Ver</Button>
        {data && <Button variant="secondary" onClick={recalc} disabled={state.busy}>Recalcular a partir do histórico</Button>}
      </form>
      {state.error && <div style={{ marginTop: 8 }}><Banner tone="danger">{state.error}</Banner></div>}
      {data?.stats && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge>XP {data.stats.total_xp}</Badge><Badge>Score {data.stats.stazia_score}{data.stats.provisional ? " (calibração)" : ""}</Badge><Badge>Moedas {data.stats.coins}</Badge>
            <Badge>Questões {data.stats.questions_answered}</Badge><Badge>Sequência {data.stats.current_streak}</Badge><Badge>Liga {data.stats.current_league ?? "—"}</Badge>
            <Badge>Visibilidade {data.preferences?.leaderboard_visibility}</Badge>
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 12 }}>
            {data.events.map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 10, padding: "6px 10px", borderTop: "1px solid var(--border-subtle)", font: "var(--type-caption)", opacity: e.is_valid ? 1 : 0.6 }}>
                <span style={{ width: 110, flex: "none", color: "var(--text-tertiary)" }}>{dateTimeBR(e.created_at)}</span>
                <span style={{ width: 60, flex: "none", font: "700 12px var(--font-mono)", color: e.xp_awarded > 0 ? "var(--xp-text)" : "var(--text-tertiary)" }}>{e.xp_awarded > 0 ? `+${e.xp_awarded} XP` : "0 XP"}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{EVENT_LABEL[e.event_type] ?? e.event_type}{e.metadata?.topic ? ` · ${e.metadata.topic}` : ""}{e.metadata?.mission ? ` · ${e.metadata.mission}` : ""}</span>
                {!e.is_valid && <Badge size="sm" tone="danger">{e.fraud_reason}</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
      {data && !data.stats && <p style={{ margin: "8px 0 0", font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Este aluno ainda não tem dados no Play.</p>}
    </Card>
  );
}

export function AdminPlay() {
  const { backend } = useSession();
  const mobile = useMobile();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_gamification"), [backend]);
  const [tab, setTab] = React.useState("metricas");
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const m = data.metrics;
  const saveRule = async (key, value, enabled) => setData(await backend.rpc("app_admin_gamification_save_rule", { p_key: key, p_value: value, p_enabled: enabled }));
  const saveAchievement = async (a) => setData(await backend.rpc("app_admin_gamification_save_achievement", { p_achievement: a }));
  const saveMission = async (x) => setData(await backend.rpc("app_admin_gamification_save_mission", { p_mission: x }));
  const saveReward = async (x) => setData(await backend.rpc("app_admin_gamification_save_reward", { p_reward: x }));
  const grid = { display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))", gap: 12 };
  const TABS = [["metricas", "Métricas"], ["regras", "Regras"], ["medalhas", "Medalhas"], ["missoes", "Missões e loja"], ["auditoria", "Auditoria"]];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map(([v, l]) => <button key={v} type="button" className="sm-chip" aria-pressed={tab === v} onClick={() => setTab(v)}>{l}</button>)}
      </div>
      {tab === "metricas" && (
        <>
          <div style={grid}>
            <StatCard label="Ativos (7 dias)" value={m.users_active} caption={`${m.users_total} com dados no Play`} icon="users" />
            <StatCard label="XP hoje" value={Number(m.xp_today).toLocaleString("pt-BR")} caption={`${Number(m.xp_7d).toLocaleString("pt-BR")} em 7 dias`} tone="warning" icon="zap" />
            <StatCard label="Moedas emitidas" value={Number(m.coins_issued).toLocaleString("pt-BR")} caption="desde o início" tone="info" icon="coins" />
            <StatCard label="Suspeitos (7 dias)" value={m.suspicious_7d} caption={Object.entries(m.suspicious_by_reason ?? {}).map(([k, n]) => `${k}: ${n}`).join(" · ") || "nenhum"} tone={m.suspicious_7d > 0 ? "danger" : "success"} icon="shield" />
          </div>
          <div style={grid}>
            <StatCard label="Missões (7 dias)" value={m.missions_completed_7d} caption="concluídas" tone="success" icon="target" />
            <StatCard label="Medalhas (7 dias)" value={m.achievements_7d} caption="desbloqueadas" icon="award" />
            <StatCard label="Sequência média" value={m.avg_streak ?? 0} caption="entre quem tem sequência" tone="warning" icon="flame" />
            <StatCard label="Eventos (24 h)" value={m.events_24h} caption={m.season ? `temporada ${m.season.starts_on} a ${m.season.ends_on}` : "sem temporada aberta"} tone="neutral" icon="activity" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <Card>
              <div style={{ font: "var(--type-label)", marginBottom: 8 }}>Top 10 (geral)</div>
              {m.top10.length === 0 && <span style={{ color: "var(--text-tertiary)", font: "var(--type-body-sm)" }}>Ninguém fora da calibração ainda.</span>}
              {m.top10.map((r) => (
                <div key={r.user_id} style={{ display: "flex", gap: 8, font: "var(--type-body-sm)", padding: "4px 0" }}>
                  <span style={{ width: 24, color: "var(--text-tertiary)" }}>{r.rank}</span><span style={{ flex: 1 }}>{r.name}</span><span style={{ font: "600 12px var(--font-mono)" }}>{r.score}</span>
                </div>
              ))}
            </Card>
            <Card>
              <div style={{ font: "var(--type-label)", marginBottom: 8 }}>Por liga</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(m.by_league ?? {}).map(([k, n]) => <Badge key={k}>{k}: {n}</Badge>)}
              </div>
              <div style={{ font: "var(--type-label)", margin: "16px 0 8px" }}>Últimas rotinas</div>
              {(m.jobs ?? []).map((j) => (
                <div key={j.id} style={{ font: "var(--type-caption)", color: "var(--text-secondary)", padding: "3px 0" }}>{dateTimeBR(j.ran_at)} · {j.job} {j.period_key} · {JSON.stringify(j.result).slice(0, 120)}</div>
              ))}
              {(m.jobs ?? []).length === 0 && <span style={{ color: "var(--text-tertiary)", font: "var(--type-body-sm)" }}>A rotina diária ainda não rodou (Vercel Cron às 00:05 de Brasília).</span>}
            </Card>
          </div>
        </>
      )}
      {tab === "regras" && <RulesPanel rules={data.rules} onSave={saveRule} />}
      {tab === "medalhas" && <AchievementsPanel items={data.achievements} onSave={saveAchievement} />}
      {tab === "missoes" && (
        <>
          <SimpleEditor title="Missões" items={data.missions} onSave={saveMission} fields={[["title", "Título (%s = alvo)"], ["target_default", "Alvo padrão", "number"], ["xp_reward", "XP", "number"], ["coins_reward", "Moedas", "number"]]} />
          <SimpleEditor title="Recompensas" items={data.rewards} onSave={saveReward} fields={[["name", "Nome"], ["description", "Descrição"], ["cost_coins", "Custo em moedas", "number"]]} />
          <Card>
            <div style={{ font: "var(--type-label)", marginBottom: 8 }}>Níveis e ligas</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {data.levels.map((l) => <Badge key={l.slug} icon={l.icon}>{l.name} {l.min_score}–{l.max_score}</Badge>)}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {data.leagues.map((l) => <Badge key={l.slug} icon={l.icon} tone="neutral">{l.position}. {l.name}</Badge>)}
            </div>
            <p style={{ margin: "8px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Faixas de nível e ordem das ligas mudam por migração; promoção, rebaixamento e tamanho do grupo ficam nas regras (league.*).</p>
          </Card>
        </>
      )}
      {tab === "auditoria" && <UserAudit />}
    </div>
  );
}
