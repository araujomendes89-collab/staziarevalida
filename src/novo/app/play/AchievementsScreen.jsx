// Conquistas (app_gamification_achievements) no desenho do pacote "Novas telas" (onda 7): computador com cartões, tablet com
// detalhe + grade de 6, celular com detalhe + grade de 4 ("Ver todas"). Medalhas e números vêm do banco; bloqueadas mostram o
// critério e, quando o banco tem o número, o progresso (progressoMedalha.js). Secretas bloqueadas nunca mostram o critério.
// A arte 3D do pacote só aparece com VITE_MEDALHAS_ARTE_PACOTE=1 (prévia); sem ela, ícones Lucide do banco.
// Recompensas: a loja com moedas (app_gamification_rewards / app_claim_reward). Nada compra XP nem posição.
import React from "react";
import { Banner, Button, Icon, Tabs } from "../../ds";
import { useSession } from "../session.jsx";
import { messageOf } from "../admin/common.jsx";
import { Panel, RichIcon, Tile, useBreakpoint } from "../evolucao/ui.jsx";
import { CATEGORY, RARITY } from "./format.js";
import { PlayError, Skeleton } from "./components.jsx";
import { usePlayLoad } from "./usePlay.js";
import { Medalha, Moeda, useArteLigada, useArtesDoPacote } from "./Medalha.jsx";
import { progressoDaMedalha } from "./progressoMedalha.js";
import "./conquistas.css";

const dataBR = (iso) => new Date(iso).toLocaleDateString("pt-BR");
const rotulo = (item) => `${item.name}${item.unlocked_at ? ", desbloqueada" : ", bloqueada"}`;

function Recompensa({ item, artes }) {
  if (!item.xp && !item.coins) return null;
  return (
    <span className="cq-reward">
      <span className="cq-num">+{item.xp} XP</span>
      {item.coins ? (
        <>
          <span className="cq-dot" aria-hidden="true">·</span>
          <Moeda artes={artes} />
          <span className="cq-num" aria-label={`${item.coins} moedas`}>{item.coins}</span>
        </>
      ) : null}
    </span>
  );
}

function Raridade({ rarity }) {
  return <span className={`cq-rar cq-rar--${rarity}`}>{RARITY[rarity] ?? rarity}</span>;
}

/** Linha de situação: data de desbloqueio ou progresso real (quando há número confiável). */
function Situacao({ item, resumo }) {
  if (item.unlocked_at) return <span className="cq-done">Desbloqueada em {dataBR(item.unlocked_at)}</span>;
  const p = progressoDaMedalha(item, resumo);
  if (!p) return null;
  return (
    <span className="cq-prog">
      <span className="cq-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.pct} aria-label={`Progresso de ${item.name}`}>
        <span style={{ width: `${p.pct}%` }} />
      </span>
      <span className="cq-prog__text">{p.texto}</span>
    </span>
  );
}

function Detalhe({ item, artes, resumo, size = 56 }) {
  return (
    <Panel className="cq-detail" aria-live="polite">
      <Medalha item={item} size={size} artes={artes} lockPin={false} />
      <span className="cq-detail__body">
        <span className="cq-name">{item.name}</span>
        {item.description && <span className="cq-req">{item.description}</span>}
        <span className="cq-meta">
          <Recompensa item={item} artes={artes} />
          <Raridade rarity={item.rarity} />
        </span>
        <Situacao item={item} resumo={resumo} />
      </span>
    </Panel>
  );
}

function JanelaDetalhe({ item, artes, resumo, onClose }) {
  React.useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="play-overlay" role="dialog" aria-modal="true" aria-label={item.name} onClick={onClose}>
      <div className="play-modal play-pop cq-modal" onClick={(e) => e.stopPropagation()}>
        <Medalha item={item} size={96} artes={artes} lockPin={false} />
        <span className="cq-meta" style={{ justifyContent: "center" }}>
          <Raridade rarity={item.rarity} />
          <span className="cq-rar">{CATEGORY[item.category] ?? item.category}</span>
        </span>
        <h2 style={{ margin: 0, font: "var(--type-h2)", color: "var(--text-primary)" }}>{item.name}</h2>
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{item.description}</p>
        <Recompensa item={item} artes={artes} />
        <div style={{ width: "100%", maxWidth: 320 }}>
          <Situacao item={item} resumo={resumo} />
        </div>
        <div style={{ marginTop: 12 }}>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}

const ORDEM = Object.keys(CATEGORY);
/** Ordem do pacote: Estudo, Precisão, Sequência, Áreas, Evolução, Especiais e, por último, as secretas (o banco ordena por texto). */
export function ordenarMedalhas(items) {
  const peso = (i) => (i.secret ? ORDEM.length : ORDEM.indexOf(i.category) === -1 ? ORDEM.length - 0.5 : ORDEM.indexOf(i.category));
  return items.map((i, n) => [i, n]).sort(([a, x], [b, y]) => peso(a) - peso(b) || x - y).map(([i]) => i);
}

export function AchievementGrid({ items: brutos, bp = "wide", artes = null, resumo = null }) {
  const items = React.useMemo(() => ordenarMedalhas(brutos), [brutos]);
  const [category, setCategory] = React.useState("todas");
  const [detail, setDetail] = React.useState(null);
  const [sel, setSel] = React.useState(null);
  const [todas, setTodas] = React.useState(false);
  const cats = ["todas", ...Object.keys(CATEGORY).filter((c) => items.some((i) => i.category === c && !i.secret)), ...(items.some((i) => i.secret) ? ["secretas"] : [])];
  const shown = items.filter((i) => (category === "todas" ? true : category === "secretas" ? i.secret : i.category === category && !i.secret));
  const pick = (c) => {
    setCategory(c);
    setSel(null);
  };
  const selected = shown.find((i) => i.slug === sel) ?? shown[0];
  const narrow = bp === "narrow";
  const visiveis = narrow && !todas ? shown.slice(0, 12) : shown;
  return (
    <>
      <div className={`cq-filters${narrow ? " cq-filters--scroll" : ""}`} role="tablist" aria-label="Categoria">
        {cats.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={category === c} className="cq-chip" onClick={() => pick(c)}>
            {c === "todas" ? "Todas" : c === "secretas" ? "Secretas" : CATEGORY[c]}
          </button>
        ))}
      </div>
      {bp === "wide" ? (
        <div className="cq-grid">
          {shown.map((item) => (
            <button key={item.slug} type="button" className="cq-card" onClick={() => setDetail(item)} aria-label={rotulo(item)}>
              <Medalha item={item} size={54} artes={artes} />
              <span className="cq-card__body">
                <span className="cq-name">{item.name}</span>
                {item.description && <span className="cq-req">{item.description}</span>}
                <span className="cq-meta">
                  <Recompensa item={item} artes={artes} />
                  <Raridade rarity={item.rarity} />
                </span>
                <Situacao item={item} resumo={resumo} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {selected && <Detalhe item={selected} artes={artes} resumo={resumo} size={narrow ? 56 : 60} />}
          {(() => {
            const grade = (
              <div className={`cq-tiles${narrow ? " cq-tiles--4" : ""}`}>
                {visiveis.map((item) => (
                  <button key={item.slug} type="button" className="cq-tile" aria-pressed={selected?.slug === item.slug} aria-label={rotulo(item)} onClick={() => setSel(item.slug)}>
                    <Medalha item={item} size={narrow ? 46 : 46} artes={artes} />
                    <span className="cq-tile__name">{item.name}</span>
                  </button>
                ))}
              </div>
            );
            if (!narrow) return grade;
            return (
              <Panel className="cq-section">
                {grade}
                {shown.length > 12 && (
                  <button type="button" className="cq-more" onClick={() => setTodas((v) => !v)}>
                    {todas ? "Mostrar menos" : `Ver todas as ${shown.length} medalhas`}
                  </button>
                )}
              </Panel>
            );
          })()}
        </>
      )}
      {detail && <JanelaDetalhe item={detail} artes={artes} resumo={resumo} onClose={() => setDetail(null)} />}
    </>
  );
}

export function RewardsStore({ coinsName, artes = null }) {
  const { backend } = useSession();
  const bp = useBreakpoint();
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
  if (!d.catalog?.length)
    return (
      <Panel className="cq-empty">
        <Tile tone="gold" size={64} radius={19}>
          {artes?.moeda ? <Moeda artes={artes} size={42} /> : <Icon name="coins" size={30} style={{ color: "var(--xp-text)" }} />}
        </Tile>
        <strong>Nenhuma recompensa ainda</strong>
        <span>As recompensas aparecem aqui conforme você ganha medalhas.</span>
      </Panel>
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel className="cq-summary">
        <Tile tone="gold" size={48} radius={14}>
          {artes?.moeda ? <Moeda artes={artes} size={30} /> : <Icon name="coins" size={24} style={{ color: "var(--xp-text)" }} />}
        </Tile>
        <span className="cq-summary__body">
          <span className="cq-summary__title">
            <span className="cq-num">{d.coins}</span> {coinsName ?? "Stazia Coins"}
          </span>
          <span className="cq-summary__note">
            {d.freezes} de {d.freeze_max} proteções de sequência
          </span>
        </span>
      </Panel>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div style={{ display: "grid", gridTemplateColumns: bp === "narrow" ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {d.catalog.map((r) => {
          const affordable = d.coins >= r.cost;
          const blocked = r.kind === "streak_freeze" ? d.freezes >= d.freeze_max : r.owned;
          return (
            <Panel key={r.slug} as="div" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Tile tone="blue" size={40} radius={12}>
                  <Icon name={r.icon} size={20} style={{ color: "var(--text-brand)" }} />
                </Tile>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cq-name" style={{ fontSize: 14 }}>{r.name}</div>
                  <div className="cq-req">{r.description}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span className="cq-reward" style={{ fontSize: 14 }}>
                  <Moeda artes={artes} /> <span className="cq-num">{r.cost}</span>
                </span>
                <Button size="sm" variant={blocked ? "secondary" : "primary"} disabled={blocked || !affordable} loading={state.busy === r.slug} onClick={() => claim(r.slug)}>
                  {state.done === r.slug ? "Resgatada!" : blocked ? (r.kind === "streak_freeze" ? "No máximo" : "Já é sua") : affordable ? "Resgatar" : "Faltam moedas"}
                </Button>
              </div>
            </Panel>
          );
        })}
      </div>
      <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Moedas vêm de acertos, missões e medalhas. Nada aqui compra XP, score ou posição no ranking.</p>
    </div>
  );
}

/** Resumo "X de N medalhas" com barra. */
function Resumo({ data, bp }) {
  const pct = data.total ? Math.round((100 * data.unlocked) / data.total) : 0;
  const barra = (
    <span className="cq-bar" role="progressbar" aria-valuemin={0} aria-valuemax={data.total} aria-valuenow={data.unlocked} aria-label="Medalhas conquistadas">
      <span style={{ width: `${pct}%` }} />
    </span>
  );
  const titulo = (
    <>
      <span className="cq-num">{data.unlocked}</span> de <span className="cq-num">{data.total}</span> medalhas
    </>
  );
  if (bp === "narrow")
    return (
      <div className="cq-summary--narrow">
        <span className="cq-summary__row">
          <strong>{titulo}</strong>
          <span>Raridade é só visual</span>
        </span>
        {barra}
      </div>
    );
  return (
    <Panel className="cq-summary">
      <Tile tone="gold" size={48} radius={14}>
        <RichIcon name="award" size={31} />
      </Tile>
      <span className="cq-summary__body">
        <span className="cq-summary__title">{titulo}</span>
        {barra}
        <span className="cq-summary__note">A raridade é só visual: nenhuma vale mais no ranking.</span>
      </span>
    </Panel>
  );
}

/** `aba`: "loja" abre em Recompensas. `arte`: true/false força a arte 3D do pacote (prévia); sem ele, segue VITE_MEDALHAS_ARTE_PACOTE (desligada no app). */
export function AchievementsScreen({ arte, aba } = {}) {
  const { backend, boot } = useSession();
  const bp = useBreakpoint();
  const artes = useArtesDoPacote(useArteLigada(arte));
  const [tab, setTab] = React.useState(aba === "loja" ? "loja" : "medalhas");
  const a = usePlayLoad(() => backend.rpc("app_gamification_achievements"), [backend]);
  // números do progresso (questões, acerto, maior sequência, evolução); se falhar, as medalhas aparecem sem barra
  const resumo = usePlayLoad(() => Promise.resolve(backend.rpc("app_gamification_summary")).catch(() => null), [backend]);
  if (boot?.play?.enabled === false) return <Banner tone="info">As conquistas fazem parte da Stazia Arena, que está desligada no momento.</Banner>;
  const coins = boot?.play?.flags?.coins !== false;
  return (
    <div className="ev cq">
      {coins && <Tabs label="Conquistas" value={tab} onChange={setTab} tabs={[{ value: "medalhas", label: "Medalhas", count: a.data?.unlocked }, { value: "loja", label: "Recompensas" }]} />}
      {tab === "medalhas" &&
        (a.error ? (
          <PlayError retry={a.reload} />
        ) : !a.data ? (
          <Skeleton height={320} />
        ) : (
          <>
            <Resumo data={a.data} bp={bp} />
            <AchievementGrid items={a.data.items ?? []} bp={bp} artes={artes} resumo={resumo.data} />
          </>
        ))}
      {tab === "loja" && <RewardsStore coinsName={boot?.play?.names?.coins} artes={artes} />}
    </div>
  );
}
