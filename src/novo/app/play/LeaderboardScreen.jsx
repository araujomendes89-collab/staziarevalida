// Classificação (app_leaderboard, app_leaderboard_near_me, app_public_profile) e Liga (app_league_current).
// Nunca carrega o ranking inteiro: 50 por página, posição própria em consulta separada, "perto de mim" por janela.
// Visual do pacote "Novas telas" (onda 6, 15/10/2026): computador = Ranking e Liga da semana lado a lado; tablet e celular =
// abas Ranking | Liga da semana. Só aparecem alunos que a função devolve (nomes já tratados no banco); vazio = "Ninguém neste ranking".
// As ligas (nome, ícone, cor) vêm do banco; com a arte do pacote ligada, o escudo 3D da liga substitui o ícone (G10.4, 16/10/2026).
import React from "react";
import { Badge, Banner, Button, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { Panel, RichIcon, Tile, useBreakpoint } from "../evolucao/ui.jsx";
import { endsIn, gapText, KIND_LABEL, KINDS, leagueColor, movementText, pluralDays, RARITY, topLabel } from "./format.js";
import { PlayError, Skeleton } from "./components.jsx";
import { usePlayLoad } from "./usePlay.js";
import { ARTE_MIN, ArteLiga, useArteLigada, useArtesDoPacote } from "./Medalha.jsx";
import { arteDaLiga } from "../../ds/medalhas-pacote/index.js";
import "./play.css";
import "./arena.css";

const initials = (name) =>
  String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function Av({ name, small }) {
  const ini = initials(name);
  return (
    <span className={`ar-av${small ? " ar-av--sm" : ""}`} aria-hidden="true">
      {ini || <Icon name="user" size={small ? 16 : 18} />}
    </span>
  );
}

function PublicProfile({ profile, onClose }) {
  React.useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="play-overlay" role="dialog" aria-modal="true" aria-label={`Perfil de ${profile.name}`} onClick={onClose}>
      <div className="play-modal play-pop" style={{ textAlign: "left" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Av name={profile.avatar ?? profile.name} />
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "800 20px var(--font-sans)" }}>{profile.name}</div>
            <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
              {profile.level_info?.name} · {profile.provisional ? "score em calibração" : `${profile.score} pts`}
              {profile.rank ? ` · #${profile.rank} de ${profile.total}` : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 16 }}>
          {[
            ["Questões", profile.questions],
            ["Acertos", profile.accuracy != null ? `${Math.round(profile.accuracy)}%` : "—"],
            ["Sequência", profile.streak != null ? `${profile.streak} d` : "—"],
          ].map(([l, v]) => (
            <div key={l} style={{ padding: 12, borderRadius: 14, background: "var(--surface-subtle)" }}>
              <div style={{ font: "500 11px var(--font-sans)", color: "var(--text-tertiary)" }}>{l}</div>
              <div style={{ font: "700 18px var(--font-mono)" }}>{v}</div>
            </div>
          ))}
        </div>
        {profile.achievements?.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="sm-overline" style={{ color: "var(--text-secondary)", marginBottom: 8 }}>
              Medalhas
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {profile.achievements.slice(0, 12).map((a) => (
                <Badge key={a.slug} size="sm" icon={a.icon} tone={a.rarity === "lendaria" ? "pro" : a.rarity === "epica" ? "ai" : "neutral"}>
                  {a.name}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}

const rowValue = (row, kind) =>
  kind === "precisao"
    ? `${Math.round(Number(row.value))}%`
    : kind === "evolucao"
      ? `${Number(row.value) > 0 ? "+" : ""}${Number(row.value)} pts`
      : kind === "streak"
        ? pluralDays(Number(row.value))
        : kind === "geral"
          ? row.value
          : `${Number(row.value).toLocaleString("pt-BR")} XP`;

/** Uma linha do ranking: posição (1º a 3º com as cores ouro, prata e bronze), avatar, nome, nível/acertos/sequência e valor. */
function Row({ row, kind, onOpen, position }) {
  const rank = position ?? row.rank;
  const frame = row.frame === "gold" ? "var(--league-ouro)" : row.frame === "teal" ? "var(--teal-500)" : null;
  return (
    <li>
      <button type="button" className="ar-row" onClick={onOpen ? () => onOpen(row) : undefined} data-static={onOpen ? undefined : ""} aria-current={row.is_me ? "true" : undefined}>
        <span className={`ar-row__pos${rank <= 3 ? ` ar-row__pos--${rank}` : ""}`}>{rank}</span>
        <span style={{ borderRadius: 999, padding: frame ? 2 : 0, boxShadow: frame ? `0 0 0 2px ${frame}` : "none", flex: "none" }}>
          <Av name={row.avatar} small />
        </span>
        <span className="ar-row__who">
          <span className="ar-row__n">{row.is_me ? "Você" : row.name}</span>
          <span className="ar-row__m">
            {row.level && <span style={{ textTransform: "capitalize" }}>{row.level}</span>}
            {row.accuracy != null && <span>{Math.round(Number(row.accuracy))}% acertos</span>}
            {row.streak != null && row.streak > 0 && (
              <span className="ar-streak">
                <Icon name="flame" size={12} /> {row.streak}
              </span>
            )}
          </span>
        </span>
        <span className="ar-row__v">{rowValue(row, kind)}</span>
      </button>
    </li>
  );
}

/** Sua posição: fora do ranking, linha tracejada com o seu avatar; dentro, posição, TOP, movimento e quanto falta. */
function MeRow({ me, kind, name, mobile }) {
  if (!me) {
    return (
      <div className="ar-me">
        <Av name={name} />
        <span className="ar-me__t">
          {mobile ? (
            <>
              <b>Você</b>Ainda não aparece neste ranking
            </>
          ) : (
            "Você ainda não aparece neste ranking."
          )}
        </span>
        <span className="ar-me__dash" aria-hidden="true">
          —
        </span>
      </div>
    );
  }
  const move = movementText(me.week_change);
  const top = topLabel(me.percentile);
  return (
    <div className="ar-me ar-me--in">
      <Av name={name} />
      <span className="ar-me__t">
        Sua posição
        <span className="ar-me__pos" style={{ display: "block" }}>
          #{me.rank} <small>de {Number(me.total).toLocaleString("pt-BR")}</small>
        </span>
      </span>
      {top && <Badge tone="brand">{top}</Badge>}
      {move && <span style={{ font: "600 13px var(--font-sans)", color: me.week_change > 0 ? "var(--success-text)" : me.week_change < 0 ? "var(--danger-text)" : "var(--text-tertiary)" }}>{move}</span>}
      {me.next?.length > 0 && (
        <span className="ar-me__gaps">
          {me.next.map((n) => (
            <span key={n.rank}>{gapText(n, kind)}</span>
          ))}
        </span>
      )}
    </div>
  );
}

export function Leaderboard({ go, mobile, titled }) {
  const { backend, boot } = useSession();
  const [kind, setKind] = React.useState("geral");
  const [offset, setOffset] = React.useState(0);
  const [near, setNear] = React.useState(false);
  const [profile, setProfile] = React.useState(null);
  const limit = 50;
  const board = usePlayLoad(() => (near ? backend.rpc("app_leaderboard_near_me", { p_kind: kind, p_radius: 5 }) : backend.rpc("app_leaderboard", { p_kind: kind, p_offset: offset, p_limit: limit })), [backend, kind, offset, near]);
  const open = async (row) => {
    if (row.is_me) return go("perfil");
    try {
      const p = await backend.rpc("app_public_profile", { p_public_id: row.public_id });
      if (p) setProfile(p);
    } catch {
      /* perfil indisponível */
    }
  };
  const change = (k) => {
    setKind(k);
    setOffset(0);
    setNear(false);
  };
  const data = board.data;
  const rows = data?.rows ?? [];
  const myName = boot?.profile?.name;
  const chips = (
    <div role="tablist" aria-label="Tipo de ranking" className={`ar-chips${mobile ? " ar-chips--scroll" : ""}`}>
      {KINDS.map((k) => (
        <button key={k} type="button" role="tab" aria-selected={kind === k} className="ar-chip" onClick={() => change(k)}>
          {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );
  const empty = (
    <div className="ar-empty">
      <Tile tone="gold" size={64} radius={19}>
        <RichIcon name="trophy" size={42} fallback="trophy" />
      </Tile>
      <span className="ar-empty__t">{mobile ? "Ninguém neste ranking ainda" : "Ninguém neste ranking ainda."}</span>
      <span className="ar-empty__s">Responda questões para aparecer aqui.{mobile ? ` ${Number(data?.total ?? 0).toLocaleString("pt-BR")} alunos.` : ""}</span>
      <button type="button" className="ar-btn" onClick={() => go("questoes")} style={{ marginTop: 6 }}>
        Responder questões {!mobile && <Icon name="arrow-right" size={18} />}
      </button>
    </div>
  );
  const body = (
    <>
      {board.error && <PlayError retry={board.reload} />}
      {!data && !board.error && <Skeleton height={240} />}
      {data && data.enabled === false && <Banner tone="info">A classificação está desligada no momento.</Banner>}
      {data && data.enabled !== false && (
        <>
          <MeRow me={data.me} kind={kind} name={myName} mobile={mobile} />
          {kind === "precisao" && <p className="ar-foot">Entra quem tem pelo menos 200 questões válidas.</p>}
          {kind === "evolucao" && <p className="ar-foot">Precisão dos últimos 14 dias contra os 14 anteriores, com no mínimo 20 questões em cada janela.</p>}
          {!(mobile && rows.length === 0) && (
            <div className="ar-label">
              <span>{near ? "Alunos ao seu redor" : `Ranking · ${KIND_LABEL[kind]}`}</span>
              {!near && (
                <span>
                  <b>{Number(data.total ?? 0).toLocaleString("pt-BR")}</b> alunos
                </span>
              )}
            </div>
          )}
          {data.me && (
            <div className="ar-tools">
              <button type="button" className="ar-ghost" aria-pressed={near} onClick={() => setNear((v) => !v)}>
                <Icon name="locate" size={16} />
                {near ? "Ver o topo" : "Ver perto de mim"}
              </button>
            </div>
          )}
          {rows.length === 0 ? (
            empty
          ) : (
            <ol className="ar-rows" aria-label={`Ranking ${KIND_LABEL[kind]}`}>
              {rows.map((row) => (
                <Row key={row.public_id ?? row.rank} row={row} kind={kind} onOpen={open} />
              ))}
            </ol>
          )}
          {!near && data.total > limit && (
            <div className="ar-pager">
              <button type="button" className="ar-ghost" disabled={offset === 0 || board.loading} onClick={() => setOffset(Math.max(0, offset - limit))}>
                <Icon name="chevron-left" size={16} /> Anteriores
              </button>
              <span className="ar-mono">
                {offset + 1}–{Math.min(offset + limit, data.total)}
              </span>
              <button type="button" className="ar-ghost" disabled={offset + limit >= data.total || board.loading} onClick={() => setOffset(offset + limit)}>
                Próximos <Icon name="chevron-right" size={16} />
              </button>
            </div>
          )}
        </>
      )}
      {profile && <PublicProfile profile={profile} onClose={() => setProfile(null)} />}
    </>
  );
  return (
    <Panel className={mobile ? "ar-panel-m" : "ar-rank"} aria-label="Ranking">
      {titled && <h2 className="ar-h2">Ranking</h2>}
      {chips}
      {body}
    </Panel>
  );
}

/** Selo da liga: com a arte do pacote, o escudo 3D (nunca abaixo de 64 px); sem ela, o ícone do banco (Lucide) na cor da liga. */
function LeagueBadge({ league, small, artes }) {
  const nome = artes ? arteDaLiga(league?.slug) : null;
  if (nome && artes[nome]) {
    return (
      <span className="ar-lart" aria-hidden="true">
        <ArteLiga league={league} size={ARTE_MIN} artes={artes} />
      </span>
    );
  }
  return (
    <span className={`ar-lbadge${small ? " ar-lbadge--sm" : ""}`} style={small ? { background: `color-mix(in oklab, ${leagueColor(league)} 16%, transparent)`, color: leagueColor(league) } : { color: leagueColor(league) }} aria-hidden="true">
      <Icon name={league?.icon || "medal"} size={small ? 22 : 30} />
    </span>
  );
}

/** `fold`: lista recolhível (fechada ao abrir), usada no computador quando o aluno já está num grupo (G10.3, decisão D4 provisória). */
function LeagueList({ leagues, current, mobile, artes, fold }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  if (!leagues?.length) return null;
  const list = [...leagues].sort((a, b) => (b.position ?? 0) - (a.position ?? 0)); // da mais alta à inicial, como no pacote
  const title = mobile ? `As ${list.length} ligas, da mais alta à inicial` : `As ${list.length} ligas`;
  const items = (
    <ol className={`ar-leagues${mobile ? " ar-leagues--m" : ""}`} id={fold ? id : undefined}>
      {list.map((l) => (
        <li key={l.slug} className={current === l.slug ? "is-me" : undefined} aria-current={current === l.slug ? "true" : undefined}>
          <LeagueBadge league={l} small artes={artes} />
          <span className="ar-leagues__n">{l.name}</span>
          {current === l.slug && <Badge tone="brand" size="sm">Sua liga</Badge>}
        </li>
      ))}
    </ol>
  );
  if (fold) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h3 className="ar-h3">
          <button type="button" className="ar-lfold" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
            <span>{title}</span>
            <Icon name="chevron-down" size={18} className={`ar-how__chev${open ? " is-open" : ""}`} />
          </button>
        </h3>
        {open && items}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h3 className={mobile ? "ar-h3 ar-h3--m" : "ar-h3"}>{title}</h3>
      {items}
    </div>
  );
}

/** `load`: a leitura da liga já feita pela tela (computador); `listOut`: "As N ligas" fica fora deste quadro (coluna do ranking). */
export function LeagueView({ mobile, titled, load, listOut }) {
  const { backend } = useSession();
  const own = usePlayLoad(() => (load ? Promise.resolve(null) : backend.rpc("app_league_current")), [backend, Boolean(load)]);
  const league = load ?? own;
  const artes = useArtesDoPacote(useArteLigada());
  const d = league.data;
  const wrap = (children) => (
    <Panel className={mobile ? "ar-panel-m" : "ar-league"} aria-label="Liga da semana" style={mobile ? { background: "transparent", border: 0, boxShadow: "none", padding: 0 } : undefined}>
      {titled && <h2 className="ar-h2">Liga da semana</h2>}
      {children}
    </Panel>
  );
  if (league.error) return wrap(<PlayError retry={league.reload} />);
  if (!d) return wrap(<Skeleton height={240} />);
  if (d.enabled === false) return wrap(<Banner tone="info">As ligas estão desligadas no momento.</Banner>);
  const leagues = d.leagues ?? [];
  if (!d.joined) {
    const first = [...leagues].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
    const size = d.group_size ?? 30;
    const up = d.promote ?? 3;
    const down = d.relegate ?? 3;
    return wrap(
      <>
        <div className="ar-lhero">
          <div className="ar-lhero__top">
            <LeagueBadge league={first} artes={artes} />
            <span className="ar-lhero__txt">
              <span className="ar-kicker">Entre na liga</span>
              <span className="ar-lhero__t">Você entra na liga com o primeiro XP da semana</span>
              {!mobile && (
                <span className="ar-lhero__s">
                  Grupos de até <span className="ar-mono">{size}</span> alunos ativos. Sobem os {d.promote_pct ?? 10}% primeiros (<span className="ar-mono">{up}</span> num grupo cheio) e descem os {d.relegate_pct ?? 10}% últimos (<span className="ar-mono">{down}</span>). A semana fecha na segunda-feira.
                </span>
              )}
            </span>
          </div>
          {mobile && (
            <>
              <div className="ar-lhero__stats">
                <span>
                  <b>{size}</b>alunos por grupo
                </span>
                <span>
                  <b>{up}</b>primeiros sobem
                </span>
                <span>
                  <b>{down}</b>últimos descem
                </span>
              </div>
              <span className="ar-lhero__s">A semana fecha na segunda-feira.</span>
            </>
          )}
        </div>
        <LeagueList leagues={leagues} mobile={mobile} artes={artes} />
      </>,
    );
  }
  const n = d.rows.length;
  const relegationFrom = n >= d.min_group_for_relegation ? n - d.relegate + 1 : Infinity;
  return wrap(
    <>
      <div className="ar-lhero">
        <div className="ar-lhero__top">
          <LeagueBadge league={d.league} artes={artes} />
          <span className="ar-lhero__txt">
            <span className="ar-kicker">Liga {d.league.name}</span>
            <span className="ar-lhero__t">
              Grupo {d.group_no} · termina em {endsIn(d.season.ends_on)}
            </span>
            <span className="ar-lhero__s">
              Top {d.promote} sobem{relegationFrom !== Infinity ? ` · do ${relegationFrom}º para baixo descem` : " · grupo pequeno: ninguém desce esta semana"}.
            </span>
          </span>
        </div>
      </div>
      <ol className="ar-rows" aria-label={`Grupo ${d.group_no} da liga ${d.league.name}`} style={mobile ? { background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: 20, padding: 6 } : undefined}>
        {d.rows.map((row, i) => (
          <React.Fragment key={row.public_id ?? i}>
            {i === d.promote && n > d.promote && (
              <li className="ar-zone ar-zone--up">
                <Icon name="chevrons-up" size={14} /> Promoção
              </li>
            )}
            {row.position === relegationFrom && (
              <li className="ar-zone ar-zone--down">
                <Icon name="chevrons-down" size={14} /> Rebaixamento
              </li>
            )}
            <Row row={{ ...row, value: row.weekly_xp }} kind="semana" position={row.position} />
          </React.Fragment>
        ))}
      </ol>
      {!listOut && <LeagueList leagues={leagues} current={d.league.slug} mobile={mobile} artes={artes} />}
      {d.history?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 className="ar-h3">Semanas anteriores</h3>
          <div className="ar-hist">
            {d.history.slice(0, 8).map((h) => (
              <div key={h.starts_on}>
                <span>{new Date(h.starts_on).toLocaleDateString("pt-BR")}</span>
                <span style={{ textTransform: "capitalize" }}>
                  {(leagues.find((l) => l.slug === h.league)?.name ?? h.league.replace("_", " "))} · #{h.position}
                </span>
                <Badge size="sm" tone={h.outcome === "promoted" ? "success" : h.outcome === "relegated" ? "danger" : "neutral"}>
                  {{ promoted: "Subiu", relegated: "Desceu", stayed: "Manteve" }[h.outcome] ?? "—"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </>,
  );
}

/** Computador: Ranking e Liga lado a lado. Com o aluno num grupo, "As N ligas" desce para baixo do ranking, recolhível,
 *  para as duas colunas terem altura parecida (G10.3, decisão D4 provisória). Sem grupo, a lista fica no quadro da liga, como no pacote. */
function RankingWide({ go, leagues }) {
  const { backend } = useSession();
  const league = usePlayLoad(() => (leagues ? backend.rpc("app_league_current") : Promise.resolve(null)), [backend, leagues]);
  const artes = useArtesDoPacote(useArteLigada());
  const d = league.data;
  const listLeft = Boolean(leagues && d && d.enabled !== false && d.joined && d.leagues?.length);
  return (
    <div className="ev ar">
      <div className="ar-cols">
        <div className="ar-colL">
          <Leaderboard go={go} titled />
          {listLeft && (
            <Panel className="ar-lfold-card" aria-label={`As ${d.leagues.length} ligas`}>
              <LeagueList leagues={d.leagues} current={d.league?.slug} artes={artes} fold />
            </Panel>
          )}
        </div>
        {leagues && <LeagueView titled load={league} listOut={listLeft} />}
      </div>
    </div>
  );
}

export function LeaderboardScreen({ go }) {
  const { boot } = useSession();
  const bp = useBreakpoint();
  const [tab, setTab] = React.useState("ranking");
  if (boot?.play?.enabled === false) return <Banner tone="info">A classificação faz parte da Stazia Arena, que está desligada no momento.</Banner>;
  const leagues = boot?.play?.flags?.leagues !== false;
  const mobile = bp === "narrow";
  if (bp === "wide") return <RankingWide go={go} leagues={leagues} />;
  return (
    <div className="ev ar">
      {leagues && (
        <div className="ar-seg" role="tablist" aria-label="Classificação">
          <button type="button" role="tab" aria-selected={tab === "ranking"} onClick={() => setTab("ranking")}>
            Ranking
          </button>
          <button type="button" role="tab" aria-selected={tab === "liga"} onClick={() => setTab("liga")}>
            Liga da semana
          </button>
        </div>
      )}
      {tab === "ranking" || !leagues ? <Leaderboard go={go} mobile={mobile} /> : <LeagueView mobile={mobile} />}
    </div>
  );
}

export { RARITY };
