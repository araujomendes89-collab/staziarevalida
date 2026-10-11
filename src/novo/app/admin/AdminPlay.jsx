// Administração da Stazia Arena: métricas, regras (XP, limites, interruptores), medalhas, missões,
// recompensas, auditoria por aluno e recálculo. Tudo passa por app_admin_gamification_* (só admin).
// Textos em português simples: sem códigos internos, sem JSON nas regras (AR08).
import React from "react";
import { Badge, Banner, Button, Card, StatCard, Switch, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { dateTimeBR, LoadError, Loading, messageOf, useDebounced, useLoad } from "./common.jsx";
import { EVENT_LABEL } from "../play/format.js";

/** Tipo da regra pelo nome, como o banco confere: interruptor, nome, lista de repetição ou número. */
const ruleKind = (key) => (key.startsWith("flags.") ? "flag" : key.startsWith("names.") ? "name" : key === "repeat.multipliers" ? "list" : "number");

/** Valor da regra como a pessoa digita: número puro, texto sem aspas, lista em porcentagens. Valor de tipo errado vira campo vazio. */
function ruleToText(kind, value) {
  if (kind === "number") return typeof value === "number" ? String(value).replace(".", ",") : "";
  if (kind === "name") return typeof value === "string" ? value : "";
  if (kind === "list") return Array.isArray(value) && value.every((n) => typeof n === "number") ? value.map((n) => String(Math.round(n * 10000) / 100)).join(", ") : "";
  return "";
}

/** Texto digitado -> valor da regra. Devolve { value } ou { error } em português. */
function textToRule(kind, text) {
  const t = text.trim();
  if (kind === "name") return t ? { value: t } : { error: "Escreva o nome." };
  if (kind === "list") {
    const parts = t.split(/[;,\s]+/).filter(Boolean);
    if (parts.length === 0 || !parts.every((x) => /^\d+(\.\d+)?$/.test(x) && Number(x) <= 100)) {
      return { error: "Digite as porcentagens separadas por vírgula, por exemplo: 100, 30, 10, 0." };
    }
    return { value: parts.map((x) => Math.round(Number(x) * 100) / 10000) };
  }
  const n = t.replace(",", ".");
  return /^\d+(\.\d+)?$/.test(n) ? { value: Number(n) } : { error: "Digite só um número, por exemplo 8." };
}

function RuleRow({ rule, onSave }) {
  // Interruptor pelo tipo da regra (flags.*), como o banco confere, e não pelo valor gravado: um valor do tipo errado
  // gravado antes da conferência continua corrigível (o interruptor grava true/false; as outras têm campo de texto).
  const kind = ruleKind(rule.key);
  const isBool = kind === "flag";
  const initial = ruleToText(kind, rule.value);
  const [text, setText] = React.useState(initial);
  const [state, setState] = React.useState({ saving: false, error: null });
  const title = rule.description || rule.key;
  const save = async (value, enabled) => {
    setState({ saving: true, error: null });
    try {
      await onSave(rule.key, value, enabled);
      setState({ saving: false, error: null });
    } catch (error) {
      setState({ saving: false, error: messageOf(error, "Valor inválido.").replace(/^A regra [a-z0-9_.]+ /, "Esta regra ") });
    }
  };
  const submit = (event) => {
    event.preventDefault();
    const parsed = textToRule(kind, text);
    if (parsed.error) return setState({ saving: false, error: parsed.error });
    save(parsed.value, rule.enabled);
  };
  return (
    <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "600 13px var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {kind === "list" && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Em porcentagem, separadas por vírgula: 1ª tentativa, 2ª, 3ª e as seguintes.</div>}
        {state.error && <div style={{ font: "var(--type-caption)", color: "var(--danger-text)" }}>{state.error}</div>}
      </div>
      {isBool ? (
        <Switch checked={rule.value === true} label={rule.value === true ? "Ligado" : "Desligado"} onChange={(e) => save(e.target.checked, rule.enabled)} />
      ) : (
        <TextField value={text} onChange={(e) => setText(e.target.value)} aria-label={title} />
      )}
      {isBool ? <span /> : (
        <Button size="sm" type="submit" loading={state.saving} disabled={text === initial}>Salvar</Button>
      )}
    </form>
  );
}

/** Aviso da conferência das regras: regra com valor inválido e cálculos de XP que falharam (o que o aluno fez foi gravado). */
function RulesHealth({ problems = [], failures = 0, recent = [], rules = [] }) {
  if (problems.length === 0 && !(failures > 0)) return null;
  const last = recent[0];
  // o banco fala da regra pelo código; aqui ela aparece pelo nome
  const named = (p) => {
    const description = rules.find((r) => r.key === p.key)?.description;
    return description ? p.problem.replace(p.key, `"${description.replace(/\.$/, "")}"`) : p.problem;
  };
  return (
    <Banner tone="danger" title={problems.length > 0 ? "Regra com valor inválido" : "Cálculo de XP com falha"}>
      {problems.map((p) => <div key={p.key}>{named(p)}</div>)}
      {failures > 0 && (
        <div>
          {failures === 1 ? "1 cálculo de XP falhou" : `${failures} cálculos de XP falharam`} nos últimos 7 dias. O que os alunos fizeram foi gravado; só o XP dessas ações ficou de fora.
          {last && (last.bad_rules ?? []).length === 0 ? " A última falha não veio de uma regra: avise o suporte técnico." : ""}
        </div>
      )}
      {problems.length > 0 && <div>Corrija na aba Regras.</div>}
    </Banner>
  );
}

// Regras que existem no banco mas nada usa ainda: não aparecem para editar (AR07).
const HIDDEN_RULES = new Set(["flags.social_feed_enabled"]);

function RulesPanel({ rules: allRules, onSave }) {
  const rules = allRules.filter((r) => !HIDDEN_RULES.has(r.key));
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

/** fields: [chave, rótulo na lista, tipo, rótulo no campo de edição (opcional)]. O título (%s = a meta) aparece como nome do item. */
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
              {fields.map(([k, label, type, editLabel]) => (
                <TextField key={k} label={editLabel ?? label} type={type === "number" ? "number" : "text"} value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
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
                {m.title ? String(m.title).replace("%s", m.target_default ?? "N") : m.name}
                <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{fields.filter(([k]) => k !== "title" && k !== "name").map(([k, label]) => `${label}: ${m[k]}`).join(" · ")}</div>
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

// Textos em português para o que o banco devolve em código.
const SUSPECT_LABEL = {
  too_fast: "rápido demais", rate_limit: "muitas respostas por minuto", repeated_question_farming: "questão repetida demais",
  duplicate_event: "resposta repetida", invalid_attempt: "tentativa inválida",
};
const suspectLabel = (reason) => SUSPECT_LABEL[reason] ?? "não contou";
const JOB_LABEL = { daily: "Rotina diária", close_week: "Fechamento da semana", close_month: "Fechamento do mês" };
function jobSummary(job) {
  const r = job.result ?? {};
  if (r.skipped) return "não rodou (Arena desligada)";
  if (job.job === "close_week") return r.closed === false ? "nada a fechar" : `${r.promoted ?? 0} subiram de liga, ${r.relegated ?? 0} desceram`;
  if (job.job === "daily") return `${r.scores ?? 0} notas atualizadas, ${r.streaks_broken ?? 0} sequências interrompidas`;
  return "concluída";
}
const VISIBILITY_LABEL = { abbreviated: "nome abreviado", username: "@usuário", anonymous: "anônimo", hidden: "escondido" };
const dayBR = (iso) => String(iso ?? "").split("-").reverse().join("/");
const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Auditoria de um aluno: a equipe acha o aluno pelo nome ou e-mail (o código interno só é usado por trás). */
function UserAudit({ leagues = [], missions = [] }) {
  const { backend } = useSession();
  const [search, setSearch] = React.useState("");
  const query = useDebounced(search.trim());
  const found = useLoad(() => (query.length >= 3 && !UUID.test(query) ? backend.rpc("app_admin_users", { p_search: query, p_limit: 8 }) : Promise.resolve(null)), [backend, query]);
  const [person, setPerson] = React.useState(null);
  const [data, setData] = React.useState(null);
  const [state, setState] = React.useState({ busy: false, error: null });
  const load = async (target) => {
    setPerson(target);
    setState({ busy: true, error: null });
    try {
      setData(await backend.rpc("app_admin_gamification_user", { p_user_id: target.id, p_limit: 100 }));
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error: messageOf(error, "Não foi possível abrir esse aluno.") });
    }
  };
  const recalc = async () => {
    setState({ busy: true, error: null });
    try {
      await backend.rpc("app_admin_gamification_recalculate", { p_user_id: person.id });
      await load(person);
    } catch (error) {
      setState({ busy: false, error: messageOf(error) });
    }
  };
  const people = found.data?.items ?? [];
  const leagueName = (slug) => (slug ? leagues.find((l) => l.slug === slug)?.name ?? capitalize(slug) : "—");
  const missionName = (slug) => {
    const title = missions.find((m) => m.slug === slug)?.title;
    return title ? title.replace("%s", "N") : slug;
  };
  return (
    <Card>
      <div style={{ font: "var(--type-label)", marginBottom: 8 }}>Auditoria por aluno</div>
      <TextField label="Buscar aluno por nome ou e-mail" icon="search" value={search} onChange={(e) => setSearch(e.target.value)} hint="Digite pelo menos 3 letras." />
      {UUID.test(search.trim()) && (
        <div style={{ marginTop: 8 }}><Button size="sm" variant="secondary" loading={state.busy} onClick={() => load({ id: search.trim(), label: "Aluno" })}>Ver este aluno</Button></div>
      )}
      {people.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, marginTop: 8 }}>
          {people.map((u) => (
            <button key={u.id} type="button" className="sm-btn sm-btn--ghost sm-btn--sm" onClick={() => load({ id: u.id, label: u.name ? `${u.name} · ${u.email}` : u.email })}>
              {u.name ? `${u.name} · ${u.email}` : u.email}
            </button>
          ))}
        </div>
      )}
      {query.length >= 3 && !UUID.test(query) && found.data && people.length === 0 && (
        <p style={{ margin: "8px 0 0", font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Nenhum aluno encontrado.</p>
      )}
      {person && data && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ font: "var(--type-label)" }}>{person.label}</strong>
          <Button variant="secondary" size="sm" onClick={recalc} disabled={state.busy}>Recalcular a partir do histórico</Button>
        </div>
      )}
      {state.error && <div style={{ marginTop: 8 }}><Banner tone="danger">{state.error}</Banner></div>}
      {data?.stats && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge>XP {data.stats.total_xp}</Badge><Badge>Score {data.stats.stazia_score}{data.stats.provisional ? " (calibração)" : ""}</Badge><Badge>Moedas {data.stats.coins}</Badge>
            <Badge>Questões {data.stats.questions_answered}</Badge><Badge>Sequência {data.stats.current_streak}</Badge><Badge>Liga {leagueName(data.stats.current_league)}</Badge>
            <Badge>Aparece no ranking como: {VISIBILITY_LABEL[data.preferences?.leaderboard_visibility] ?? "—"}</Badge>
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 12 }}>
            {data.events.map((e) => (
              <div key={e.id} style={{ display: "flex", gap: 10, padding: "6px 10px", borderTop: "1px solid var(--border-subtle)", font: "var(--type-caption)", opacity: e.is_valid ? 1 : 0.6 }}>
                <span style={{ width: 110, flex: "none", color: "var(--text-tertiary)" }}>{dateTimeBR(e.created_at)}</span>
                <span style={{ width: 60, flex: "none", font: "700 12px var(--font-mono)", color: e.xp_awarded > 0 ? "var(--xp-text)" : "var(--text-tertiary)" }}>{e.xp_awarded > 0 ? `+${e.xp_awarded} XP` : "0 XP"}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{EVENT_LABEL[e.event_type] ?? "Evento"}{e.metadata?.topic ? ` · ${e.metadata.topic}` : ""}{e.metadata?.mission ? ` · ${missionName(e.metadata.mission)}` : ""}</span>
                {!e.is_valid && <Badge size="sm" tone="danger">{suspectLabel(e.fraud_reason)}</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
      {data && !data.stats && <p style={{ margin: "8px 0 0", font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Este aluno ainda não tem dados na Arena.</p>}
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
  const leagueLabel = (slug) => (slug === "sem liga" ? "Sem liga" : data.leagues?.find((l) => l.slug === slug)?.name ?? capitalize(slug));
  const saveRule = async (key, value, enabled) => setData(await backend.rpc("app_admin_gamification_save_rule", { p_key: key, p_value: value, p_enabled: enabled }));
  const saveAchievement = async (a) => setData(await backend.rpc("app_admin_gamification_save_achievement", { p_achievement: a }));
  const saveMission = async (x) => setData(await backend.rpc("app_admin_gamification_save_mission", { p_mission: x }));
  const saveReward = async (x) => setData(await backend.rpc("app_admin_gamification_save_reward", { p_reward: x }));
  const grid = { display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))", gap: 12 };
  const TABS = [["metricas", "Métricas"], ["regras", "Regras"], ["medalhas", "Medalhas"], ["missoes", "Missões e loja"], ["auditoria", "Auditoria"]];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <RulesHealth problems={data.rule_problems ?? []} failures={m.xp_failures_7d ?? 0} recent={m.xp_failures_recent ?? []} rules={data.rules ?? []} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map(([v, l]) => <button key={v} type="button" className="sm-chip" aria-pressed={tab === v} onClick={() => setTab(v)}>{l}</button>)}
      </div>
      {tab === "metricas" && (
        <>
          <div style={grid}>
            <StatCard label="Ativos (7 dias)" value={m.users_active} caption={`${m.users_total} com dados na Arena`} icon="users" />
            <StatCard label="XP hoje" value={Number(m.xp_today).toLocaleString("pt-BR")} caption={`${Number(m.xp_7d).toLocaleString("pt-BR")} em 7 dias`} tone="warning" icon="zap" />
            <StatCard label="Moedas emitidas" value={Number(m.coins_issued).toLocaleString("pt-BR")} caption="desde o início" tone="info" icon="coins" />
            <StatCard label="Suspeitos (7 dias)" value={m.suspicious_7d} caption={Object.entries(m.suspicious_by_reason ?? {}).map(([k, n]) => `${suspectLabel(k)}: ${n}`).join(" · ") || "nenhum"} tone={m.suspicious_7d > 0 ? "danger" : "success"} icon="shield" />
          </div>
          <div style={grid}>
            <StatCard label="Missões (7 dias)" value={m.missions_completed_7d} caption="concluídas" tone="success" icon="target" />
            <StatCard label="Medalhas (7 dias)" value={m.achievements_7d} caption="desbloqueadas" icon="award" />
            <StatCard label="Sequência média" value={m.avg_streak ?? 0} caption="entre quem tem sequência" tone="warning" icon="flame" />
            <StatCard label="Eventos (24 h)" value={m.events_24h} caption={m.season ? `semana de ${dayBR(m.season.starts_on)} a ${dayBR(m.season.ends_on)}` : "sem semana de liga aberta"} tone="neutral" icon="activity" />
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
                {Object.entries(m.by_league ?? {}).map(([k, n]) => <Badge key={k}>{leagueLabel(k)}: {n}</Badge>)}
              </div>
              <div style={{ font: "var(--type-label)", margin: "16px 0 8px" }}>Últimas rotinas</div>
              {(m.jobs ?? []).map((j) => (
                <div key={j.id} style={{ font: "var(--type-caption)", color: "var(--text-secondary)", padding: "3px 0" }}>{dateTimeBR(j.ran_at)} · {JOB_LABEL[j.job] ?? "Rotina"} · {jobSummary(j)}</div>
              ))}
              {(m.jobs ?? []).length === 0 && <span style={{ color: "var(--text-tertiary)", font: "var(--type-body-sm)" }}>A rotina diária ainda não rodou (ela roda todo dia às 00h05, horário de Brasília).</span>}
            </Card>
          </div>
        </>
      )}
      {tab === "regras" && <RulesPanel rules={data.rules} onSave={saveRule} />}
      {tab === "medalhas" && <AchievementsPanel items={data.achievements} onSave={saveAchievement} />}
      {tab === "missoes" && (
        <>
          <SimpleEditor title="Missões" items={data.missions} onSave={saveMission} fields={[["title", "Título (use %s onde entra a meta)"], ["target_default", "Meta", "number", "Meta (vale para as próximas missões)"], ["xp_reward", "XP", "number"], ["coins_reward", "Moedas", "number"]]} />
          <SimpleEditor title="Recompensas" items={data.rewards} onSave={saveReward} fields={[["name", "Nome"], ["description", "Descrição"], ["cost_coins", "Custo em moedas", "number"]]} />
          <Card>
            <div style={{ font: "var(--type-label)", marginBottom: 8 }}>Níveis e ligas</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {data.levels.map((l) => <Badge key={l.slug} icon={l.icon}>{l.name} {l.min_score}–{l.max_score}</Badge>)}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {data.leagues.map((l) => <Badge key={l.slug} icon={l.icon} tone="neutral">{l.position}. {l.name}</Badge>)}
            </div>
            <p style={{ margin: "8px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>As faixas de nível e a ordem das ligas só mudam com ajuda do suporte técnico. Quantos sobem, quantos descem e o tamanho do grupo ficam na aba Regras, em Ligas.</p>
          </Card>
        </>
      )}
      {tab === "auditoria" && <UserAudit leagues={data.leagues ?? []} missions={data.missions ?? []} />}
    </div>
  );
}
