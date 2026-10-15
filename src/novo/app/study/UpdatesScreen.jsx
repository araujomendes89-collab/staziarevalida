// Atualizações com dados do banco (app_guideline_updates, app_guideline_update, app_start_guideline_questions).
// Visual de 14/10/2026 (prévia interativa aprovada pelo dono): cabeçalho com busca, filtros de área e ano e progresso de
// leitura; cartões com faixa na cor da área (paleta v2 dos Grandes Temas), fonte e data à vista e selo "Novo"; detalhe em
// abas (O que mudou / Conduta e impacto / O que a prova cobra / Armadilha / Linha do tempo / Flashcards / Miniquiz).
// Os flashcards usam a cor do Grande Tema ligado à atualização (slug ...-gr-016 → GR-016) ou, sem tema, a da área.
// "Marcar como lido" fica só neste navegador (atualizacoesLidas.js): não há tabela de leitura de atualização no banco.
// Só aparece ao aluno o que o administrador publicou, e o banco só deixa publicar o que um revisor médico aprovou no
// documento oficial (registra quem e quando); recusar ou mudar o texto tira do ar. O aviso "Ainda sem conferência médica"
// do detalhe e o selo "Sem conferência médica" do cartão e da tabela ficam só como proteção, caso algum dia chegue ao aluno
// algo sem conferência (AT04: o selo aparece em todo lugar onde a conduta aparece, não só no detalhe).
import React from "react";
import { AnswerOption, Badge, Banner, Button, Card, Chip, EmptyState, Flashcard, Icon, ProgressBar, SegmentedControl, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { AREAS, areaLabel } from "../practice/format.js";
import { areaVars, atualizacaoVars } from "./temaCores.js";
import { useLidas } from "./atualizacoesLidas.js";
import "./atualizacoes.css";

const PRIORITY = { 1: ["Prioridade muito alta", "streak"], 2: ["Prioridade alta", "warning"], 3: ["Prioridade moderada", "neutral"], 4: ["Prioridade baixa", "neutral"] };
const dateBR = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "");
const ANO_ATUAL = () => new Date().getFullYear();
/** "Novo": a mudança é deste ano. */
const isNew = (item) => (item.years ?? []).some((y) => Number(y) >= ANO_ATUAL());

/** Texto longo da equipe: linhas "1. ..." viram lista numerada, "- ..." ou "• ..." viram lista; o resto, parágrafos. */
export function Texto({ text, className = "at-text" }) {
  const blocks = [];
  let list = null;
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    const num = /^(\d+)[.)]\s+(.*)$/.exec(line);
    const bul = /^[-•]\s+(.*)$/.exec(line);
    const kind = num ? "ol" : bul ? "ul" : null;
    if (kind) {
      if (!list || list.kind !== kind) blocks.push((list = { kind, items: [] }));
      list.items.push(num ? num[2] : bul[1]);
    } else {
      list = null;
      if (line) blocks.push({ kind: "p", text: line });
    }
  }
  if (!blocks.length) return <div className={className}><p>—</p></div>;
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.kind === "p" ? <p key={i}>{b.text}</p> : React.createElement(b.kind, { key: i }, b.items.map((t, j) => <li key={j}>{t}</li>))
      )}
    </div>
  );
}

/** Selo da área, na cor da área. */
function AreaTag({ area }) {
  return (
    <span className="at-area at-scope" style={areaVars(area)}>
      <span className="at-dot" aria-hidden="true" />
      {areaLabel(area)}
    </span>
  );
}

function NewSeal({ item }) {
  if (!isNew(item)) return null;
  return (
    <span className="at-new" title={`Mudança de ${ANO_ATUAL()}`}>
      <Icon name="sparkles" size={12} />
      Novo
    </span>
  );
}

function Years({ years, size = "sm" }) {
  return (years ?? []).map((y) => (
    <Badge key={y} size={size} tone="info">
      {y}
    </Badge>
  ));
}

/** Selo do cartão e da tabela: ainda sem conferência de um revisor médico no documento oficial (o detalhe explica). */
function NoReviewSeal({ item }) {
  if (item.reviewed) return null;
  return (
    <Badge tone="warning" icon="shield-alert" size="sm">
      Sem conferência médica
    </Badge>
  );
}

function PriorityBadge({ priority, size = "sm" }) {
  const [label, tone] = PRIORITY[priority] ?? PRIORITY[2];
  return (
    <Badge tone={tone} icon={priority === 1 ? "flame" : undefined} size={size}>
      {label}
    </Badge>
  );
}

/** Instituição e data da fonte, bem visíveis (cartão e detalhe). */
function SourceLine({ item }) {
  if (!item.institution && !item.publication_label) return null;
  return (
    <div className="at-source">
      <span className="at-source__icon">
        <Icon name="landmark" size={18} />
      </span>
      <div style={{ minWidth: 0 }}>
        {item.institution && <div className="at-source__org">{item.institution}</div>}
        {item.publication_label && (
          <div className="at-source__date">
            <Icon name="calendar-days" size={14} style={{ flex: "none", marginTop: 1 }} />
            <span>{item.publication_label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Cartão da lista: faixa na cor da área, selos, fonte e data, e se já foi lido. */
function UpdateCard({ item, onOpen, compact = false, read = false }) {
  const open = (e) => {
    if (e.type === "click" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(item);
    }
  };
  return (
    <Card interactive onClick={open} onKeyDown={open} role="button" aria-label={`Ver o que mudou: ${item.topic}${read ? " (lida)" : ""}`} className="at-card at-scope" style={areaVars(item.area)} padding={20}>
      <div className="at-card__head">
        <AreaTag area={item.area} />
        <span className="at-card__tags">
          <NewSeal item={item} />
          <NoReviewSeal item={item} />
          <Years years={item.years} />
        </span>
      </div>
      <div className="at-card__title">{item.topic}</div>
      {item.subtopic && <div className="at-card__sub">{item.subtopic}</div>}
      {!compact && item.current_conduct && (
        <p className="at-card__conduct">
          <b style={{ color: "var(--text-primary)" }}>Conduta vigente: </b>
          {item.current_conduct.replace(/\s*\n\s*/g, " ")}
        </p>
      )}
      <SourceLine item={item} />
      <div className="at-card__foot">
        {read && (
          <span className="at-read">
            <Icon name="circle-check" size={16} /> Lida
          </span>
        )}
        <span className="at-card__cta">
          Ver o que mudou <Icon name="chevron-right" size={16} />
        </span>
      </div>
    </Card>
  );
}

/** Tabela comparativa: antes × agora. No celular vira lista de cartões. */
function CompareTable({ items, onOpen, mobile }) {
  if (mobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((u) => (
          <Card key={u.id} className="at-card at-scope" style={{ ...areaVars(u.area), gap: 0 }} padding={16}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <AreaTag area={u.area} />
              <NoReviewSeal item={u} />
            </div>
            <div style={{ font: "700 15px/1.35 var(--font-sans)", margin: "8px 0 10px" }}>{u.topic}</div>
            <div style={{ font: "700 12px var(--font-sans)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em" }}>Antes</div>
            <p style={{ margin: "2px 0 10px", font: "var(--type-body-sm)", color: "var(--text-secondary)", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{u.before_text ?? "—"}</p>
            <div style={{ font: "700 12px var(--font-sans)", color: "var(--at-ink)", textTransform: "uppercase", letterSpacing: ".05em" }}>Agora</div>
            <p style={{ margin: "2px 0 12px", font: "var(--type-body-sm)", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{u.current_conduct ?? "—"}</p>
            <div>
              <Button size="sm" variant="secondary" iconRight="chevron-right" onClick={() => onOpen(u)}>Ver detalhes</Button>
            </div>
          </Card>
        ))}
      </div>
    );
  }
  const th = { textAlign: "left", padding: "12px 14px", font: "700 12px var(--font-sans)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "1px solid var(--border-default)" };
  const td = { padding: "14px", verticalAlign: "top", borderBottom: "1px solid var(--border-subtle)", font: "var(--type-body-sm)" };
  const clamp = { display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" };
  return (
    <Card padding={0} style={{ borderRadius: 20, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: "24%" }}>Tema e área</th>
            <th style={{ ...th, width: "33%" }}>Antes</th>
            <th style={{ ...th, width: "33%", color: "var(--success-text)" }}>Agora (conduta vigente)</th>
            <th style={th} aria-label="Ação" />
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr key={u.id} className="at-scope" style={areaVars(u.area)}>
              <td style={td} className="at-row-mark">
                <div style={{ font: "700 14px/1.35 var(--font-sans)", marginBottom: 6, overflowWrap: "anywhere" }}>{u.topic}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <AreaTag area={u.area} />
                  <NoReviewSeal item={u} />
                </div>
              </td>
              <td style={{ ...td, color: "var(--text-secondary)" }}><div style={clamp}>{u.before_text ?? "—"}</div></td>
              <td style={td}><div style={clamp}>{u.current_conduct ?? "—"}</div></td>
              <td style={td}>
                <Button size="sm" variant="ghost" iconRight="chevron-right" onClick={() => onOpen(u)}>Ver</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Questão de treino da equipe (não é questão oficial do INEP): marcar, confirmar e ver o comentário. */
function PracticeQuestion({ q }) {
  const [picked, setPicked] = React.useState(null);
  const [done, setDone] = React.useState(false);
  const state = (id) => (!done ? (picked === id ? "selected" : "idle") : id === q.answer ? "correct" : id === picked ? "incorrect" : "dimmed");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, font: "400 16px/1.6 var(--font-sans)", textWrap: "pretty" }}>{q.statement}</p>
      <div role="radiogroup" aria-label="Alternativas" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.options.map((o) => (
          <div key={o.id}>
            <AnswerOption letter={o.id} state={state(o.id)} onClick={() => !done && setPicked(o.id)}>
              {o.text}
            </AnswerOption>
            {done && o.justification && <p style={{ margin: "6px 4px 0 44px", font: "var(--type-body-sm)", color: o.id === q.answer ? "var(--success-text)" : "var(--text-secondary)" }}>{o.justification}</p>}
          </div>
        ))}
      </div>
      {!done ? (
        <div>
          <Button disabled={!picked} iconRight="check" onClick={() => setDone(true)}>Confirmar</Button>
        </div>
      ) : (
        q.commentary && (
          <div style={{ padding: 14, borderRadius: 14, background: "var(--surface-subtle)", border: "1px solid var(--border-subtle)", font: "var(--type-body-sm)" }}>
            <b>Comentário: </b>
            {q.commentary}
          </div>
        )
      )}
    </div>
  );
}

/** Miniquiz feito com os próprios flashcards: a pergunta do cartão e duas respostas (a dele e a de outro cartão). */
function FlashQuiz({ cards }) {
  const [answers, setAnswers] = React.useState({});
  const n = cards.length;
  const right = Object.entries(answers).filter(([i, a]) => a === cards[i].back).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {cards.map((c, i) => {
        const other = cards[(i + 1) % n].back;
        const opts = i % 2 === 0 ? [c.back, other] : [other, c.back];
        const picked = answers[i];
        const done = picked != null;
        return (
          <div key={i} className="at-quiz" role="group" aria-label={`Pergunta ${i + 1} de ${n}`}>
            <div className="at-quiz__q">
              {i + 1}. {c.front}
            </div>
            {opts.map((o, k) => (
              <button
                key={k}
                type="button"
                className={`at-quiz__opt${done && o === c.back ? " is-right" : ""}${done && o === picked && o !== c.back ? " is-wrong" : ""}`}
                disabled={done}
                aria-pressed={picked === o}
                onClick={() => setAnswers((a) => ({ ...a, [i]: o }))}
              >
                {o}
              </button>
            ))}
            <div aria-live="polite">
              {done && (
                <span className="at-quiz__fb" style={{ color: picked === c.back ? "var(--success-text)" : "var(--danger-text)" }}>
                  {picked === c.back ? "Certo!" : "Não é essa. A resposta certa está em verde."}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {Object.keys(answers).length === n && (
        <Banner tone={right === n ? "success" : "info"} title={`Você acertou ${right} de ${n}`}>
          {right === n ? "Mandou bem. Revise os flashcards de vez em quando para não esquecer." : "Volte às abas O que mudou e Armadilha e tente de novo depois."}
        </Banner>
      )}
    </div>
  );
}

/** Abas com teclado (setas, Início e Fim) e painel ligado por aria. */
function UpdateTabs({ tabs, value, onChange }) {
  const refs = React.useRef({});
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.value === value);
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length];
    onChange(next.value);
    refs.current[next.value]?.focus();
  };
  return (
    <div className="at-tabs" role="tablist" aria-label="Partes da atualização" onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.value}
          ref={(el) => (refs.current[t.value] = el)}
          id={`at-tab-${t.value}`}
          type="button"
          role="tab"
          className="at-tab"
          aria-selected={t.value === value}
          aria-controls={`at-panel-${t.value}`}
          tabIndex={t.value === value ? 0 : -1}
          onClick={() => onChange(t.value)}
        >
          <Icon name={t.icon} size={16} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

function PanelTitle({ icon, children }) {
  return (
    <h3 className="at-panel__title">
      <span className="at-panel__icon">
        <Icon name={icon} size={18} />
      </span>
      {children}
    </h3>
  );
}

/** lidas/onToggleRead vêm da lista (mesmo estado do progresso); usado sozinho, o detalhe lê e grava por conta própria. */
export function UpdateDetail({ slug, go, onBack, lidas: lidasLista, onToggleRead }) {
  const { backend, user } = useSession();
  const mobile = useMobile();
  const [u, setU] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [card, setCard] = React.useState(0);
  const [tab, setTab] = React.useState("mudou");
  const [lidasProprias, alternarPropria] = useLidas(user?.id);
  const lidas = lidasLista ?? lidasProprias;
  const alternarLida = onToggleRead ?? alternarPropria;
  React.useEffect(() => {
    let alive = true;
    backend
      .rpc("app_guideline_update", { p_slug: slug })
      .then((r) => alive && (r ? setU(r) : setError("Atualização não encontrada.")))
      .catch(() => alive && setError("Não foi possível abrir a atualização."));
    return () => {
      alive = false;
    };
  }, [backend, slug]);
  const train = async () => {
    setBusy(true);
    try {
      const s = await backend.rpc("app_start_guideline_questions", { p_slug: slug, p_count: 20 });
      go("sessao", { s: s.session_id });
    } catch {
      setError("Não foi possível abrir o treino. Tente de novo.");
      setBusy(false);
    }
  };
  const back = (
    <div>
      <Button variant="ghost" size="sm" icon="arrow-left" onClick={onBack}>Voltar para as atualizações</Button>
    </div>
  );
  if (error && !u) return <>{back}<Banner tone="danger">{error}</Banner></>;
  if (!u) return <>{back}<p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p></>;

  const flash = u.flashcards ?? [];
  const quiz = u.practice_questions ?? [];
  const read = Boolean(lidas[u.slug ?? slug]);
  const tabs = [
    { value: "mudou", label: "O que mudou", icon: "repeat" },
    (u.current_conduct || u.clinical_impact) && { value: "conduta", label: "Conduta e impacto", icon: "stethoscope" },
    u.exam_impact && { value: "prova", label: "O que a prova cobra", icon: "graduation-cap" },
    u.trap && { value: "armadilha", label: "Armadilha", icon: "triangle-alert" },
    u.timeline?.length > 0 && { value: "tempo", label: "Linha do tempo", icon: "history" },
    flash.length > 0 && { value: "flash", label: "Flashcards", icon: "layers" },
    (quiz.length > 0 || flash.length > 1) && { value: "quiz", label: "Miniquiz", icon: "list-checks" },
  ].filter(Boolean);
  const longConduct = (u.current_conduct ?? "").length > 700;
  const timeline = [...(u.timeline ?? [])].sort((a, b) => Number(a.year) - Number(b.year));

  const panels = {
    mudou: (
      <>
        <PanelTitle icon="repeat">O que mudou na conduta</PanelTitle>
        <div className="at-compare">
          <div className="at-box at-box--before">
            <div className="at-box__label">
              <Icon name="history" size={14} /> Antes
            </div>
            <Texto text={u.before_text} />
          </div>
          <div className={`at-box at-box--now${longConduct ? "" : " is-short"}`}>
            <div className="at-box__label">
              <Icon name="circle-check" size={14} /> Agora · conduta vigente
            </div>
            <Texto text={u.current_conduct} />
            {longConduct && (
              <div style={{ marginTop: 8 }}>
                <Button size="sm" variant="link" iconRight="chevron-right" onClick={() => setTab("conduta")}>Ler a conduta completa</Button>
              </div>
            )}
          </div>
        </div>
      </>
    ),
    conduta: (
      <>
        <PanelTitle icon="stethoscope">Conduta atual</PanelTitle>
        <Texto text={u.current_conduct} />
        {u.clinical_impact && (
          <>
            <div className="at-subhead">Impacto na prática</div>
            <Texto text={u.clinical_impact} />
          </>
        )}
      </>
    ),
    prova: (
      <>
        <PanelTitle icon="graduation-cap">O que a prova cobra</PanelTitle>
        <div className="at-callout">
          <div className="at-callout__title">
            <Icon name="lightbulb" size={16} /> O que lembrar para o Revalida
          </div>
          <Texto text={u.exam_impact} />
        </div>
      </>
    ),
    armadilha: (
      <>
        <PanelTitle icon="triangle-alert">Armadilha</PanelTitle>
        <div className="at-trap" role="note" aria-label="Pegadinha da banca">
          <div className="at-trap__title">
            <Icon name="triangle-alert" size={16} /> Pegadinha da banca
          </div>
          <Texto text={u.trap} />
        </div>
      </>
    ),
    tempo: (
      <>
        <PanelTitle icon="history">Linha do tempo</PanelTitle>
        <ol className="at-timeline" aria-label="Transição">
          {timeline.map((t, i) => (
            <li key={`${t.year}-${i}`}>
              <span className="at-timeline__year">{t.year}</span>
              <span className="at-timeline__text">{t.text}</span>
            </li>
          ))}
        </ol>
      </>
    ),
    flash: flash.length > 0 && (
      <>
        <PanelTitle icon="layers">Flashcards de fixação</PanelTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
          <Flashcard key={card} front={flash[card].front} back={flash[card].back} area={areaLabel(u.area)} height={mobile ? 360 : 300} className="sm-flash--tema" style={atualizacaoVars(u.slug ?? slug, u.area)} />
          {flash.length > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <Button size="sm" variant="ghost" icon="chevron-left" disabled={card === 0} onClick={() => setCard(card - 1)}>Anterior</Button>
              <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }} aria-live="polite">{card + 1} de {flash.length}</span>
              <Button size="sm" variant="ghost" iconRight="chevron-right" disabled={card === flash.length - 1} onClick={() => setCard(card + 1)}>Próximo</Button>
            </div>
          )}
        </div>
      </>
    ),
    quiz: (
      <>
        <PanelTitle icon="list-checks">Miniquiz</PanelTitle>
        {flash.length > 1 && (
          <>
            <p style={{ margin: "0 0 12px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Escolha a resposta certa de cada flashcard.</p>
            <FlashQuiz cards={flash} />
          </>
        )}
        {quiz.length > 0 && (
          <>
            <div className="at-subhead">Questão de treino</div>
            <p style={{ margin: "0 0 12px", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Questão escrita pela equipe para fixar a mudança. Não é questão oficial do INEP.</p>
            {quiz.map((q, i) => <PracticeQuestion key={i} q={q} />)}
          </>
        )}
      </>
    ),
  };
  const current = tabs.some((t) => t.value === tab) ? tab : "mudou";

  return (
    <div className="at-detail at-scope" style={areaVars(u.area)}>
      {back}
      <Card className="at-detail__hero" padding={mobile ? 20 : 32}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <AreaTag area={u.area} />
          <NewSeal item={u} />
          <Years years={u.years} />
          <PriorityBadge priority={u.priority} />
          {read && (
            <span className="at-read">
              <Icon name="circle-check" size={16} /> Lida
            </span>
          )}
        </div>
        <h2 className="at-detail__title">{u.topic}</h2>
        {u.subtopic && <p className="at-detail__sub">{u.subtopic}</p>}
        <SourceLine item={u} />
        <div style={{ marginTop: 16 }}>
          {u.reviewed ? (
            <Badge tone="success" icon="shield-check" style={{ whiteSpace: "normal", height: "auto", minHeight: 24, padding: "5px 10px", lineHeight: 1.35, borderRadius: 12 }}>Conferido por revisor médico no documento oficial em {dateBR(u.reviewed_at)}</Badge>
          ) : (
            <Banner tone="warning" title="Ainda sem conferência médica">
              Esta atualização ainda não foi conferida por um revisor médico no documento oficial. Use como guia de estudo e confira a fonte antes de levar para a prática.
            </Banner>
          )}
        </div>
        <div className="at-detail__actions">
          <Button iconRight="arrow-right" loading={busy} onClick={train}>
            Treinar questões deste tema
          </Button>
          <Button variant="secondary" icon={read ? "circle-check" : "check"} aria-pressed={read} onClick={() => alternarLida(u.slug ?? slug)}>
            {read ? "Lida · desmarcar" : "Marcar como lida"}
          </Button>
        </div>
      </Card>
      {error && <Banner tone="danger">{error}</Banner>}

      <UpdateTabs tabs={tabs} value={current} onChange={setTab} />
      <Card className="at-panel" padding={mobile ? 18 : 24} role="tabpanel" id={`at-panel-${current}`} aria-labelledby={`at-tab-${current}`} tabIndex={0}>
        {panels[current]}
      </Card>

      <Card style={{ borderRadius: 24 }} padding={mobile ? 18 : 24}>
        <PanelTitle icon="landmark">Fonte oficial</PanelTitle>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 280px" }}>
            <div style={{ font: "600 15px/1.4 var(--font-sans)", overflowWrap: "anywhere" }}>{u.document_title ?? "Documento a confirmar"}</div>
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 2, overflowWrap: "anywhere" }}>{[u.institution, u.publication_label].filter(Boolean).join(" · ")}</div>
            <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 6 }}>Consulte sempre o documento original.</div>
          </div>
          {u.source_url ? (
            <Button variant="secondary" iconRight="external-link" onClick={() => window.open(u.source_url, "_blank", "noopener")}>Abrir documento oficial</Button>
          ) : (
            <Badge tone="warning">Endereço oficial em conferência</Badge>
          )}
        </div>
      </Card>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Button variant="ghost" icon={read ? "circle-check" : "check"} aria-pressed={read} onClick={() => alternarLida(u.slug ?? slug)}>
          {read ? "Lida · desmarcar" : "Terminei: marcar como lida"}
        </Button>
      </div>
    </div>
  );
}

export function UpdatesScreen({ go }) {
  const { backend, user } = useSession();
  const mobile = useMobile();
  const [area, setArea] = React.useState("");
  const [year, setYear] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [view, setView] = React.useState("lista");
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [open, setOpen] = React.useState(null);
  const [tick, setTick] = React.useState(0);
  const [all, setAll] = React.useState([]); // endereços de todas as publicadas (resposta sem filtro), para o progresso
  const [lidas, alternarLida] = useLidas(user?.id);
  React.useEffect(() => {
    let alive = true;
    setError(null);
    const semFiltro = !area && year == null && !q.trim();
    backend
      .rpc("app_guideline_updates", { p_area: area || null, p_year: year, p_search: q.trim() || null })
      .then((r) => {
        if (!alive) return;
        setData(r);
        if (semFiltro && r?.items) setAll(r.items.map((i) => i.slug));
      })
      .catch(() => alive && setError("Não foi possível carregar as atualizações."));
    return () => {
      alive = false;
    };
  }, [backend, area, year, q, tick]);

  const openItem = (item) => {
    setOpen(item.slug);
    window.scrollTo(0, 0);
  };
  if (open) return <UpdateDetail slug={open} go={go} onBack={() => setOpen(null)} lidas={lidas} onToggleRead={alternarLida} />;
  if (error) return <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={() => setTick((n) => n + 1)}>Tentar de novo</Button>}>{error}</Banner>;
  if (!data) return <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;

  const filtering = Boolean(area || year || q.trim());
  // destaque só quando há mais atualizações do que as destacadas (senão repetiria a lista inteira)
  const top = data.items.filter((i) => i.priority === 1).slice(0, 4);
  const featured = data.items.length > top.length ? top : [];
  const totalAll = all.length || data.total;
  const readCount = all.filter((s) => lidas[s]).length;
  const areas = AREAS.filter((a) => (data.by_area?.[a.id] ?? 0) > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <Card style={{ borderRadius: 24 }} padding={mobile ? 18 : 24}>
        <div className="at-hero">
          <div className="at-hero__top">
            <div style={{ minWidth: 0, flex: "1 1 320px" }}>
              <span className="sm-overline">Atualizações e diretrizes</span>
              <h2 className="at-hero__title">O que mudou nas condutas</h2>
              <p className="at-hero__lead">Antes × agora, o que cai no Revalida e a fonte oficial de cada mudança. Consulte sempre o documento original.</p>
            </div>
            {data.total > 0 && (
              <div className="at-progress">
                <ProgressBar label="Seu progresso" valueLabel={`${readCount} de ${totalAll} ${totalAll === 1 ? "lida" : "lidas"}`} value={readCount} max={Math.max(totalAll, 1)} />
                <span className="at-progress__note">Fica salvo só neste aparelho e navegador.</span>
              </div>
            )}
          </div>
          {data.total > 0 && (
            <>
              <TextField icon="search" aria-label="Buscar atualização" placeholder="Buscar por tema, conduta, fármaco, vacina ou órgão" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="at-filters">
                <div className="at-filters__row" role="group" aria-label="Grande área">
                  <span className="at-filters__label" aria-hidden="true">Área</span>
                  <Chip selected={area === ""} onClick={() => setArea("")} count={data.total}>
                    Todas as áreas
                  </Chip>
                  {areas.map((a) => (
                    <Chip key={a.id} className="sm-chip at-chip-area at-scope" style={areaVars(a.id)} selected={area === a.id} onClick={() => setArea(area === a.id ? "" : a.id)} count={data.by_area[a.id]}>
                      <span className="at-dot" aria-hidden="true" />
                      {a.label}
                    </Chip>
                  ))}
                </div>
                <div className="at-filters__row" role="group" aria-label="Ano da mudança">
                  <span className="at-filters__label" aria-hidden="true">Ano</span>
                  <Chip selected={year === null} onClick={() => setYear(null)}>Todos os anos</Chip>
                  {data.years.map((y) => (
                    <Chip key={y} selected={year === y} onClick={() => setYear(year === y ? null : y)}>
                      {y}
                    </Chip>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
      {data.total === 0 ? (
        <EmptyState
          icon="shield-check"
          title="As atualizações estão em conferência médica"
          description="Cada atualização só aparece aqui depois de conferida no documento oficial. Enquanto isso, treine com as questões oficiais."
          action={<Button onClick={() => go("questoes")}>Montar um treino</Button>}
        />
      ) : (
        <>
          {!filtering && view === "lista" && featured.length > 0 && (
            <section aria-labelledby="at-destaque">
              <div style={{ marginBottom: 12 }}>
                <span className="sm-overline" id="at-destaque">Atualizações em destaque</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "minmax(0,1fr)" : `repeat(${Math.min(featured.length, 4)},minmax(0,1fr))`, gap: 16 }}>
                {featured.map((i) => <UpdateCard key={i.id} item={i} onOpen={openItem} compact read={Boolean(lidas[i.slug])} />)}
              </div>
            </section>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }} aria-live="polite">
              Exibindo {data.items.length} de {data.total} {data.total === 1 ? "atualização" : "atualizações"}
            </div>
            <SegmentedControl label="Modo de exibição" value={view} onChange={setView} options={[{ value: "lista", label: "Lista" }, { value: "tabela", label: "Tabela comparativa" }]} />
          </div>
          {data.items.length === 0 ? (
            <EmptyState icon="search" title="Nenhuma atualização com esses filtros" description="Tente outra área, outro ano ou outro termo." />
          ) : view === "tabela" ? (
            <CompareTable items={data.items} onOpen={openItem} mobile={mobile} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "minmax(0,1fr)" : "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
              {data.items.map((i) => <UpdateCard key={i.id} item={i} onOpen={openItem} read={Boolean(lidas[i.slug])} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
