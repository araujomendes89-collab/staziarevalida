// Atualizações & Diretrizes com dados do banco (app_guideline_updates, app_guideline_update, app_start_guideline_questions).
// Mesma estrutura do app anterior (o que mudou: antes × agora; o que lembrar para o Revalida; fonte; flashcards; questão de
// treino; tabela comparativa) com o layout de "Materiais oficiais" do novo design (prototype/Study1.jsx).
// Só aparece ao aluno o que o administrador publicou; o selo de conferência só existe quando um revisor médico conferiu
// no documento oficial (o banco registra quem e quando).
import React from "react";
import { AnswerOption, Badge, Banner, Button, Card, Chip, EmptyState, Flashcard, Icon, SegmentedControl, TextField } from "../../ds";
import { IconTile } from "../../prototype/RealIcons.jsx";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { areaLabel } from "../practice/format.js";
import { AreaTabs } from "./LessonsScreen.jsx";

const AREA_TONE = { CLINICA_MEDICA: "--area-clinica", CIRURGIA_GERAL: "--area-cirurgia", PEDIATRIA: "--area-pediatria", GINECOLOGIA_OBSTETRICIA: "--area-go", MEDICINA_FAMILIA_COMUNIDADE: "--area-preventiva" };
const PRIORITY = { 1: ["Prioridade muito alta", "streak"], 2: ["Prioridade alta", "warning"], 3: ["Prioridade moderada", "neutral"], 4: ["Prioridade baixa", "neutral"] };
const dateBR = (iso) => (iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "");

function AreaTag({ area }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "600 12px var(--font-sans)", color: "var(--text-secondary)" }}>
      <span style={{ width: 8, height: 8, borderRadius: 3, background: `var(${AREA_TONE[area] ?? "--action-primary"})` }} />
      {areaLabel(area)}
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

function PriorityBadge({ priority, size = "sm" }) {
  const [label, tone] = PRIORITY[priority] ?? PRIORITY[2];
  return (
    <Badge tone={tone} icon={priority === 1 ? "flame" : undefined} size={size}>
      {label}
    </Badge>
  );
}

/** Cartão da lista (mesma linguagem dos cartões de "Atualizações em destaque" do protótipo). */
function UpdateCard({ item, onOpen, compact = false }) {
  return (
    <Card interactive onClick={() => onOpen(item)} onKeyDown={(e) => e.key === "Enter" && onOpen(item)} role="button" aria-label={`Ver o que mudou: ${item.topic}`} style={{ borderRadius: 20, display: "flex", flexDirection: "column", gap: 12 }} padding={20}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <AreaTag area={item.area} />
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Years years={item.years} />
        </span>
      </div>
      <div style={{ font: "600 16px/1.35 var(--font-sans)" }}>{item.topic}</div>
      {!compact && item.current_conduct && (
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          <b style={{ color: "var(--text-primary)" }}>Conduta vigente: </b>
          {item.current_conduct}
        </p>
      )}
      <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[item.institution, item.publication_label].filter(Boolean).join(" · ")}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "600 13px var(--font-sans)", color: "var(--text-link)", whiteSpace: "nowrap" }}>
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
          <Card key={u.id} style={{ borderRadius: 20 }} padding={16}>
            <AreaTag area={u.area} />
            <div style={{ font: "600 15px/1.35 var(--font-sans)", margin: "6px 0 10px" }}>{u.topic}</div>
            <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".04em" }}>Antes</div>
            <p style={{ margin: "2px 0 10px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{u.before_text ?? "—"}</p>
            <div style={{ font: "var(--type-caption)", color: "var(--success-text)", textTransform: "uppercase", letterSpacing: ".04em" }}>Agora</div>
            <p style={{ margin: "2px 0 10px", font: "var(--type-body-sm)" }}>{u.current_conduct ?? "—"}</p>
            <Button size="sm" variant="secondary" iconRight="chevron-right" onClick={() => onOpen(u)}>Ver detalhes</Button>
          </Card>
        ))}
      </div>
    );
  }
  const th = { textAlign: "left", padding: "12px 14px", font: "var(--type-caption)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "1px solid var(--border-default)" };
  const td = { padding: "14px", verticalAlign: "top", borderBottom: "1px solid var(--border-subtle)", font: "var(--type-body-sm)" };
  return (
    <Card padding={0} style={{ borderRadius: 20, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
            <tr key={u.id}>
              <td style={td}>
                <div style={{ font: "600 14px/1.35 var(--font-sans)", marginBottom: 6 }}>{u.topic}</div>
                <AreaTag area={u.area} />
              </td>
              <td style={{ ...td, color: "var(--text-secondary)" }}>{u.before_text ?? "—"}</td>
              <td style={td}>{u.current_conduct ?? "—"}</td>
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

export function UpdateDetail({ slug, go, onBack }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [u, setU] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [card, setCard] = React.useState(0);
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
  const section = (icon, tone, title, children) => (
    <Card style={{ borderRadius: 24 }} padding={mobile ? 18 : 24}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <IconTile name={icon} size={32} tone={tone} />
        <h3 style={{ margin: 0, font: "600 17px var(--font-sans)" }}>{title}</h3>
      </div>
      {children}
    </Card>
  );
  const flash = u.flashcards ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {back}
      <Card style={{ borderRadius: 28, borderLeft: `4px solid var(${AREA_TONE[u.area] ?? "--action-primary"})` }} padding={mobile ? 20 : 32}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <AreaTag area={u.area} />
          <Years years={u.years} />
          <PriorityBadge priority={u.priority} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
          <div style={{ flex: "1 1 360px", minWidth: 0 }}>
            <h2 style={{ margin: 0, font: `700 ${mobile ? 22 : 28}px/1.2 var(--font-sans)`, letterSpacing: "-0.015em" }}>{u.topic}</h2>
            <p style={{ margin: "8px 0 0", color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>
              {[u.subtopic, u.institution && `${u.institution}${u.publication_label ? ` (${u.publication_label})` : ""}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button iconRight="arrow-right" loading={busy} onClick={train}>
            Treinar questões deste tema
          </Button>
        </div>
        <div style={{ marginTop: 16 }}>
          {u.reviewed ? (
            <Badge tone="success" icon="shield-check">Conferido por revisor médico no documento oficial em {dateBR(u.reviewed_at)}</Badge>
          ) : (
            <Banner tone="warning" title="Ainda sem conferência médica">
              Esta atualização ainda não foi conferida por um revisor médico no documento oficial. Use como guia de estudo e confira a fonte antes de levar para a prática.
            </Banner>
          )}
        </div>
      </Card>
      {error && <Banner tone="danger">{error}</Banner>}

      {section("repeat", "brand", "O que mudou na conduta",
        <>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div style={{ padding: 16, borderRadius: 16, background: "var(--surface-subtle)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, font: "600 12px var(--font-sans)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                <Icon name="history" size={14} /> Antes
              </div>
              <p style={{ margin: "8px 0 0", font: "400 15px/1.6 var(--font-sans)", color: "var(--text-secondary)" }}>{u.before_text ?? "—"}</p>
            </div>
            <div style={{ padding: 16, borderRadius: 16, background: "var(--success-bg)", border: "1px solid var(--success-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, font: "600 12px var(--font-sans)", color: "var(--success-text)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                <Icon name="circle-check" size={14} /> Conduta vigente
              </div>
              <p style={{ margin: "8px 0 0", font: "500 15px/1.6 var(--font-sans)" }}>{u.current_conduct ?? "—"}</p>
            </div>
          </div>
          {u.timeline?.length > 0 && (
            <ol aria-label="Transição" style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {u.timeline.map((t) => (
                <li key={t.year} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <Badge tone="info">{t.year}</Badge>
                  <span style={{ font: "var(--type-body-sm)", lineHeight: 1.6 }}>{t.text}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {(u.exam_impact || u.trap || u.clinical_impact) &&
        section("graduation-cap", "warning", "O que lembrar para o Revalida",
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {u.exam_impact && (
              <div>
                <div className="sm-overline" style={{ color: "var(--text-secondary)" }}>Como pode aparecer na prova</div>
                <p style={{ margin: "6px 0 0", font: "400 15px/1.6 var(--font-sans)" }}>{u.exam_impact}</p>
              </div>
            )}
            {u.trap && (
              <div style={{ padding: 14, borderRadius: 14, background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, font: "700 13px var(--font-sans)", color: "var(--warning-text)" }}>
                  <Icon name="triangle-alert" size={16} /> Pegadinha da banca
                </div>
                <p style={{ margin: "6px 0 0", font: "var(--type-body-sm)", lineHeight: 1.6 }}>{u.trap}</p>
              </div>
            )}
            {u.clinical_impact && (
              <div>
                <div className="sm-overline" style={{ color: "var(--text-secondary)" }}>Impacto clínico</div>
                <p style={{ margin: "6px 0 0", font: "400 15px/1.6 var(--font-sans)", color: "var(--text-secondary)" }}>{u.clinical_impact}</p>
              </div>
            )}
          </div>
        )}

      {section("landmark", "navy", "Fonte oficial",
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <div style={{ font: "600 15px/1.4 var(--font-sans)" }}>{u.document_title ?? "Documento a confirmar"}</div>
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 2 }}>{[u.institution, u.publication_label].filter(Boolean).join(" · ")}</div>
            <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 6 }}>Consulte sempre o documento original.</div>
          </div>
          {u.source_url ? (
            <Button variant="secondary" iconRight="external-link" onClick={() => window.open(u.source_url, "_blank", "noopener")}>Abrir documento oficial</Button>
          ) : (
            <Badge tone="warning">Endereço oficial em conferência</Badge>
          )}
        </div>
      )}

      {flash.length > 0 &&
        section("layers", "brand", "Flashcards de fixação",
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Flashcard key={card} front={flash[card].front} back={flash[card].back} area={areaLabel(u.area)} height={mobile ? 260 : 220} />
            {flash.length > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Button size="sm" variant="ghost" icon="chevron-left" disabled={card === 0} onClick={() => setCard(card - 1)}>Anterior</Button>
                <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{card + 1} de {flash.length}</span>
                <Button size="sm" variant="ghost" iconRight="chevron-right" disabled={card === flash.length - 1} onClick={() => setCard(card + 1)}>Próximo</Button>
              </div>
            )}
          </div>
        )}

      {u.practice_questions?.length > 0 &&
        section("file-question", "brand", "Questão de treino",
          <>
            <p style={{ margin: "0 0 12px", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Questão escrita pela equipe para fixar a mudança. Não é questão oficial do INEP.</p>
            {u.practice_questions.map((q, i) => <PracticeQuestion key={i} q={q} />)}
          </>
        )}
    </div>
  );
}

export function UpdatesScreen({ go }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [area, setArea] = React.useState("");
  const [year, setYear] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [view, setView] = React.useState("lista");
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [open, setOpen] = React.useState(null);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    setError(null);
    backend
      .rpc("app_guideline_updates", { p_area: area || null, p_year: year, p_search: q.trim() || null })
      .then((r) => alive && setData(r))
      .catch(() => alive && setError("Não foi possível carregar as atualizações."));
    return () => {
      alive = false;
    };
  }, [backend, area, year, q, tick]);

  const openItem = (item) => {
    setOpen(item.slug);
    window.scrollTo(0, 0);
  };
  if (open) return <UpdateDetail slug={open} go={go} onBack={() => setOpen(null)} />;
  if (error) return <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={() => setTick((n) => n + 1)}>Tentar de novo</Button>}>{error}</Banner>;
  if (!data) return <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Carregando…</p>;

  const filtering = Boolean(area || year || q.trim());
  // destaque só quando há mais atualizações do que as destacadas (senão repetiria a lista inteira)
  const top = data.items.filter((i) => i.priority === 1).slice(0, 4);
  const featured = data.items.length > top.length ? top : [];
  return (
    <>
      <Card style={{ borderRadius: 24 }} padding={24}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TextField icon="search" aria-label="Buscar atualização" placeholder="Buscar por tema, conduta, fármaco, vacina ou órgão" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <IconTile name="shield-check" size={20} radius={6} tone="success" />
              Antes × agora, o que cai no Revalida e a fonte de cada mudança
            </span>
            <span>Consulte sempre o documento original.</span>
          </div>
        </div>
      </Card>
      {data.total === 0 ? (
        <>
          <EmptyState
            icon="shield-check"
            title="As atualizações estão em conferência médica"
            description="Cada atualização só aparece aqui depois de conferida no documento oficial. Enquanto isso, treine com as questões oficiais."
            action={<Button onClick={() => go("questoes")}>Montar um treino</Button>}
          />
        </>
      ) : (
        <>
          <AreaTabs value={area} onChange={setArea} counts={data.by_area} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Ano da mudança">
              <Chip selected={year === null} onClick={() => setYear(null)}>Todos os anos</Chip>
              {data.years.map((y) => (
                <Chip key={y} selected={year === y} onClick={() => setYear(year === y ? null : y)}>
                  {y}
                </Chip>
              ))}
            </div>
            <SegmentedControl label="Modo de exibição" value={view} onChange={setView} options={[{ value: "lista", label: "Lista" }, { value: "tabela", label: "Tabela comparativa" }]} />
          </div>
          {!filtering && view === "lista" && featured.length > 0 && (
            <div>
              <div style={{ marginBottom: 12 }}>
                <span className="sm-overline">Atualizações em destaque</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "minmax(0,1fr)" : `repeat(${Math.min(featured.length, 4)},minmax(0,1fr))`, gap: 16 }}>
                {featured.map((i) => <UpdateCard key={i.id} item={i} onOpen={openItem} compact />)}
              </div>
            </div>
          )}
          <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
            Exibindo {data.items.length} de {data.total} {data.total === 1 ? "atualização" : "atualizações"}
          </div>
          {data.items.length === 0 ? (
            <EmptyState icon="search" title="Nenhuma atualização com esses filtros" description="Tente outra área, outro ano ou outro termo." />
          ) : view === "tabela" ? (
            <CompareTable items={data.items} onOpen={openItem} mobile={mobile} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "minmax(0,1fr)" : "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
              {data.items.map((i) => <UpdateCard key={i.id} item={i} onOpen={openItem} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}
