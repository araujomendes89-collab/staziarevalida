// Missões do dia e da semana (app_gamification_missions). O progresso vem dos fatos no banco.
// Visual do pacote "Novas telas" (onda 6, 15/10/2026): computador = dois quadros lado a lado; tablet = um embaixo do outro;
// celular = resumo dourado com anel, abas Hoje/Semana, lista e botão "Estudar agora" preso embaixo. Títulos, metas e prêmios vêm do banco.
import React from "react";
import { Banner, Icon } from "../../ds";
import { useSession } from "../session.jsx";
import { Panel, RichIcon, Tile, useBreakpoint } from "../evolucao/ui.jsx";
import moeda from "../../ds/icons-stazia/moeda-stazia-3d.svg";
import { PlayError, Skeleton } from "./components.jsx";
import { usePlayLoad } from "./usePlay.js";
import "./arena.css";

// tipo da missão (coluna "kind" do banco) -> ícone ilustrado do pacote; sem par, usa o ícone gravado na missão
const KIND_ICON = { correct: "file-question", questions: "file-question", areas: "book-open", review: "notebook-pen", flashcards: "layers", accuracy: "target", simulados: "timer" };

const fmtDate = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "");
const pct = (m) => Math.min(100, Math.round((100 * m.progress) / Math.max(1, m.target)));
const progText = (m) => (m.kind === "accuracy" ? `${m.progress}% / ${m.target}%` : `${m.progress}/${m.target}`);

function Coins({ n }) {
  if (!n) return null;
  return (
    <>
      <img src={moeda} alt="" width={14} height={14} className="ar-coin" draggable="false" />
      <span>{n}</span>
    </>
  );
}

function MissionIcon({ m, size = 28 }) {
  if (m.done) return <Icon name="check" size={Math.round(size * 0.75)} style={{ color: "var(--success-text)" }} />;
  return <RichIcon name={KIND_ICON[m.kind] ?? m.icon ?? "target"} size={size} fallback={m.icon || "target"} />;
}

function Bar({ m }) {
  return (
    <span className={`ar-bar${m.done ? " ar-bar--done" : ""}`} role="progressbar" aria-label={m.title} aria-valuenow={m.progress} aria-valuemin={0} aria-valuemax={m.target}>
      <span style={{ width: `${m.done ? 100 : m.progress ? Math.max(4, pct(m)) : 0}%` }} />
    </span>
  );
}

/** Linha de missão do computador e do tablet. */
function MissionRow({ m }) {
  return (
    <li className={`ar-mrow${m.done ? " is-done" : ""}`}>
      <Tile tone={m.done ? "green" : "blue"} size={44} radius={13}>
        <MissionIcon m={m} />
      </Tile>
      <span className="ar-mrow__body">
        <span className="ar-mrow__top">
          <span className="ar-mrow__t">{m.title}</span>
          {m.done ? (
            <span className="ar-mrow__p ar-mrow__p--done">
              <Icon name="check" size={14} />
              Concluída
            </span>
          ) : (
            <span className="ar-mrow__p">{progText(m)}</span>
          )}
        </span>
        <Bar m={m} />
        <span className="ar-reward">
          <span>+{m.xp} XP</span>
          {m.coins ? <i aria-hidden="true">·</i> : null}
          <Coins n={m.coins} />
        </span>
      </span>
    </li>
  );
}

/** Linha compacta do celular: prêmio à direita, barra com o número embaixo do título. */
function MissionRowMobile({ m }) {
  return (
    <li>
      <Tile tone={m.done ? "green" : "blue"} size={40} radius={12}>
        <MissionIcon m={m} size={26} />
      </Tile>
      <span className="ar-mrow__body">
        <span className="ar-mrow__t">{m.title}</span>
        <span className="ar-mrow__bar">
          <Bar m={m} />
          {m.done ? (
            <span className="ar-mrow__p ar-mrow__p--done">
              <Icon name="check" size={14} />
              Concluída
            </span>
          ) : (
            <span className="ar-mrow__p">{progText(m)}</span>
          )}
        </span>
      </span>
      <span className="ar-mside">
        <span>+{m.xp} XP</span>
        {m.coins ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Coins n={m.coins} />
          </span>
        ) : null}
      </span>
    </li>
  );
}

function Ring({ done, total }) {
  const r = 25;
  const c = 2 * Math.PI * r;
  const p = total ? done / total : 0;
  return (
    <span className="ar-ring" aria-hidden="true">
      <svg className="ar-ring__svg" width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--ar-gold-line)" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--xp)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} />
      </svg>
      <RichIcon name="trophy" size={28} fallback="trophy" />
    </span>
  );
}

export function MissionsScreen({ go }) {
  const { backend, boot } = useSession();
  const bp = useBreakpoint();
  const [tab, setTab] = React.useState("hoje");
  const m = usePlayLoad(() => backend.rpc("app_gamification_missions"), [backend]);
  if (boot?.play?.enabled === false) return <Banner tone="info">As missões fazem parte da Stazia Arena, que está desligada no momento.</Banner>;
  if (m.error) return <PlayError retry={m.reload} />;
  if (!m.data) return <Skeleton height={360} />;
  const d = m.data;
  const daily = d.daily ?? [];
  const weekly = d.weekly ?? [];
  const dailyDone = daily.filter((x) => x.done).length;
  const weeklyDone = weekly.filter((x) => x.done).length;
  const bonus = d.daily_bonus;
  const study = () => go("questoes");

  if (bp === "narrow") {
    const list = tab === "hoje" ? daily : weekly;
    return (
      <div className="ev ar">
        <div className={`ar-msum${bonus?.done ? " is-done" : ""}`}>
          <Ring done={dailyDone} total={daily.length} />
          <span>
            <span className="ar-msum__t">
              <span className="ar-mono">
                {dailyDone} de {daily.length}
              </span>{" "}
              missões de hoje
            </span>
            {bonus && (
              <span className="ar-msum__s" style={{ display: "block" }}>
                {bonus.done ? "Bônus do dia garantido: " : "Complete todas e ganhe "}
                <b>+{bonus.xp} XP</b> e <b>+{bonus.coins} moedas</b>
              </span>
            )}
          </span>
        </div>
        <div className="ar-seg" role="tablist" aria-label="Missões">
          <button type="button" role="tab" aria-selected={tab === "hoje"} onClick={() => setTab("hoje")}>
            Hoje {dailyDone}/{daily.length}
          </button>
          <button type="button" role="tab" aria-selected={tab === "semana"} onClick={() => setTab("semana")}>
            Semana {weeklyDone}/{weekly.length}
          </button>
        </div>
        {tab === "semana" && (
          <p className="ar-week">
            De <b>{fmtDate(d.week_start).slice(0, 5)}</b> a <b>{fmtDate(d.week_end)}</b> · <b>{weeklyDone} de {weekly.length}</b> concluídas
          </p>
        )}
        {list.length ? (
          <ul className="ar-mlist ar-mlist--m">
            {list.map((x) => (
              <MissionRowMobile key={x.slug} m={x} />
            ))}
          </ul>
        ) : (
          <p className="ar-empty-line">Nenhuma missão por enquanto.</p>
        )}
        {tab === "hoje" && <p className="ar-foot">Renovam todo dia no seu fuso. Concluir qualquer missão já garante o dia na sua sequência.</p>}
        <div className="ar-sticky-space" aria-hidden="true" />
        <div className="ar-sticky">
          <button type="button" className="ar-btn" onClick={study}>
            Estudar agora <Icon name="arrow-right" size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ev ar">
      <div className="ar-actions">
        <button type="button" className="ar-btn" onClick={study}>
          Estudar agora <Icon name="arrow-right" size={18} />
        </button>
      </div>
      <div className="ar-cols">
        <Panel className="ar-mcard" aria-label="Missões de hoje">
          <div className="ar-mcard__head">
            <Tile tone="blue" size={44} radius={13}>
              <RichIcon name="target" size={29} />
            </Tile>
            <span>
              <h2 className="ar-mcard__h">Missões de hoje</h2>
              <span className="ar-mcard__sub">Renovam todo dia no seu fuso</span>
            </span>
            <span className="ar-count">
              {dailyDone} de {daily.length}
            </span>
          </div>
          {daily.length ? (
            <ul className="ar-mlist">
              {daily.map((x) => (
                <MissionRow key={x.slug} m={x} />
              ))}
            </ul>
          ) : (
            <p className="ar-empty-line">Nenhuma missão por enquanto.</p>
          )}
          {bonus && (
            <div className={`ar-bonus${bonus.done ? " is-done" : ""}`}>
              <RichIcon name="trophy" size={34} fallback="trophy" />
              <span>
                <span className="ar-bonus__t">{bonus.done ? "Bônus do dia garantido" : "Complete todas"}</span>
                <span className="ar-bonus__v">
                  +{bonus.xp} XP · +{bonus.coins} moedas
                </span>
              </span>
            </div>
          )}
          <p className="ar-foot">Concluir qualquer missão já garante o dia na sua sequência.</p>
        </Panel>
        <Panel className="ar-mcard" aria-label="Missões da semana">
          <div className="ar-mcard__head">
            <Tile tone="violet" size={44} radius={13}>
              <RichIcon name="calendar-days" size={29} />
            </Tile>
            <span>
              <h2 className="ar-mcard__h">Missões da semana</h2>
              <span className="ar-mcard__sub ar-mono">
                {fmtDate(d.week_start)} a {fmtDate(d.week_end)}
              </span>
            </span>
            <span className="ar-count">
              {weeklyDone} de {weekly.length}
            </span>
          </div>
          {weekly.length ? (
            <ul className="ar-mlist">
              {weekly.map((x) => (
                <MissionRow key={x.slug} m={x} />
              ))}
            </ul>
          ) : (
            <p className="ar-empty-line">Nenhuma missão por enquanto.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
