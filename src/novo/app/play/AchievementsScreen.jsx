// Conquistas (app_gamification_achievements) em grade por categoria e raridade, mais a loja de
// recompensas com moedas (app_gamification_rewards / app_claim_reward). Nada compra XP nem posição.
import React from "react";
import { Badge, Banner, Button, Card, Icon, Tabs } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { messageOf } from "../admin/common.jsx";
import { CATEGORY, RARITY } from "./format.js";
import { AchievementCard, PlayError, Skeleton } from "./components.jsx";
import { usePlayLoad } from "./usePlay.js";

export function AchievementGrid({ items, mobile }) {
  const [category, setCategory] = React.useState("todas");
  const [detail, setDetail] = React.useState(null);
  const cats = ["todas", ...Object.keys(CATEGORY).filter((c) => items.some((i) => i.category === c)), "secretas"];
  const shown = items.filter((i) => (category === "todas" ? true : category === "secretas" ? i.secret : i.category === category));
  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <Tabs label="Categoria" value={category} onChange={setCategory} tabs={cats.map((c) => ({ value: c, label: c === "todas" ? "Todas" : c === "secretas" ? "Secretas" : CATEGORY[c], count: c === "todas" ? items.filter((i) => i.unlocked_at).length : undefined }))} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {shown.map((item) => (
          <AchievementCard key={item.slug} item={item} onClick={() => setDetail(item)} />
        ))}
      </div>
      {detail && (
        <div className="play-overlay" role="dialog" aria-modal="true" aria-label={detail.name} onClick={() => setDetail(null)}>
          <div className="play-modal play-pop" onClick={(e) => e.stopPropagation()}>
            <span style={{ width: 72, height: 72, borderRadius: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", background: detail.unlocked_at ? "var(--xp-bg)" : "var(--locked-bg)", color: detail.unlocked_at ? "var(--xp-text)" : "var(--locked)" }}>
              <Icon name={detail.unlocked_at || !detail.secret ? detail.icon : "lock"} size={36} />
            </span>
            <div style={{ marginTop: 12 }}>
              <Badge size="sm">{RARITY[detail.rarity]}</Badge> <Badge size="sm" tone="neutral">{CATEGORY[detail.category]}</Badge>
            </div>
            <h2 style={{ margin: "8px 0 0", font: "var(--type-h2)" }}>{detail.name}</h2>
            <p style={{ margin: "8px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{detail.description}</p>
            <p style={{ margin: "8px 0 0", font: "600 13px var(--font-sans)", color: detail.unlocked_at ? "var(--success-text)" : "var(--xp-text)" }}>
              {detail.unlocked_at ? `Desbloqueada em ${new Date(detail.unlocked_at).toLocaleDateString("pt-BR")}` : "Recompensa:"} {!detail.unlocked_at && `+${detail.xp} XP${detail.coins ? ` · ${detail.coins} moedas` : ""}`}
            </p>
            <div style={{ marginTop: 20 }}>
              <Button onClick={() => setDetail(null)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function RewardsStore({ coinsName }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const store = usePlayLoad(() => backend.rpc("app_gamification_rewards"), [backend]);
  const [state, setState] = React.useState({ busy: null, error: null, done: null });
  const claim = async (slug) => {
    setState({ busy: slug, error: null, done: null });
    try {
      const data = await backend.rpc("app_claim_reward", { p_slug: slug });
      store.setData(data);
      setState({ busy: null, error: null, done: slug });
    } catch (error) {
      setState({ busy: null, error: messageOf(error, "Não foi possível resgatar agora."), done: null });
    }
  };
  if (store.error) return <PlayError retry={store.reload} />;
  if (!store.data) return <Skeleton height={200} />;
  const d = store.data;
  if (d.enabled === false) return <Banner tone="info">A loja está desligada no momento.</Banner>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span className="sm-overline" style={{ color: "var(--text-secondary)" }}>Loja</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, font: "700 22px var(--font-sans)" }}>
            <Icon name="coins" size={22} style={{ color: "var(--xp)" }} /> {d.coins} <span style={{ font: "500 14px var(--font-sans)", color: "var(--text-tertiary)" }}>{coinsName ?? "Stazia Coins"}</span>
          </div>
        </div>
        <Badge tone="info" icon="snowflake">{d.freezes} de {d.freeze_max} proteções</Badge>
      </div>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {d.catalog.map((r) => {
          const affordable = d.coins >= r.cost;
          const blocked = r.kind === "streak_freeze" ? d.freezes >= d.freeze_max : r.owned;
          return (
            <Card key={r.slug} style={{ borderRadius: 20, display: "flex", flexDirection: "column", gap: 10 }} padding={16}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--surface-brand-soft)", color: "var(--text-brand)" }}>
                  <Icon name={r.icon} size={20} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "600 14px var(--font-sans)" }}>{r.name}</div>
                  <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{r.description}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "700 14px var(--font-sans)", color: "var(--xp-text)" }}>
                  <Icon name="coins" size={14} /> {r.cost}
                </span>
                <Button size="sm" variant={blocked ? "secondary" : "primary"} disabled={blocked || !affordable} loading={state.busy === r.slug} onClick={() => claim(r.slug)}>
                  {state.done === r.slug ? "Resgatada!" : blocked ? (r.kind === "streak_freeze" ? "No máximo" : "Já é sua") : affordable ? "Resgatar" : "Faltam moedas"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Moedas vêm de acertos, missões e medalhas. Nada aqui compra XP, score ou posição no ranking.</p>
    </div>
  );
}

export function AchievementsScreen() {
  const { backend, boot } = useSession();
  const mobile = useMobile();
  const [tab, setTab] = React.useState("medalhas");
  const a = usePlayLoad(() => backend.rpc("app_gamification_achievements"), [backend]);
  if (boot?.play?.enabled === false) return <Banner tone="info">As conquistas fazem parte do Stazia Play, que está desligado no momento.</Banner>;
  const coins = boot?.play?.flags?.coins !== false;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {coins && <Tabs label="Conquistas" value={tab} onChange={setTab} tabs={[{ value: "medalhas", label: "Medalhas", icon: "award", count: a.data?.unlocked }, { value: "loja", label: "Recompensas", icon: "gift" }]} />}
      {tab === "medalhas" && (a.error ? <PlayError retry={a.reload} /> : !a.data ? <Skeleton height={320} /> : (
        <>
          <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{a.data.unlocked} de {a.data.total} medalhas. A raridade é só visual: nenhuma vale mais no ranking.</p>
          <AchievementGrid items={a.data.items} mobile={mobile} />
        </>
      ))}
      {tab === "loja" && <RewardsStore coinsName={boot?.play?.names?.coins} />}
    </div>
  );
}
