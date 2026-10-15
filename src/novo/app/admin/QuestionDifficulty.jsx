// Administração › Questões › Dificuldade validada (1 a 5).
// SÓ CADASTRO HUMANO: a equipe escolhe o nível depois de conferir a questão. Nada aqui calcula, estima ou pede a uma IA.
// O aluno só vê o nível validado depois de responder num treino (app_question_difficulty); nunca no simulado.
import React from "react";
import { Badge, Banner, Button, Card, EmptyState, Icon, SelectField, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { useMobile } from "../Shell.jsx";
import { AREAS, areaLabel } from "../practice/format.js";
import { dateBR, ListRow, LoadError, Loading, messageOf, TextArea, useDebounced } from "./common.jsx";

const PAGE = 50;
const NOTE_MAX = 500;
export const LEVELS = [
  { value: 1, label: "Muito fácil" },
  { value: 2, label: "Fácil" },
  { value: 3, label: "Média" },
  { value: 4, label: "Difícil" },
  { value: 5, label: "Muito difícil" },
];
export const levelName = (level) => LEVELS.find((l) => l.value === level)?.label ?? "";
const AREA_OPTIONS = AREAS.map((a) => ({ value: a.id, label: a.label }));
const LEVEL_FILTER = [
  { value: "", label: "Todas" },
  { value: "none", label: "Sem dificuldade validada" },
  ...LEVELS.map((l) => ({ value: String(l.value), label: `${l.value} · ${l.label}` })),
];

/** Cinco barrinhas: as acesas são o nível validado. Só enfeite; o texto ao lado diz o mesmo. */
export function LevelBars({ level }) {
  return (
    <span aria-hidden="true" style={{ display: "inline-flex", gap: 3, alignItems: "flex-end" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ width: 5, height: 6 + n * 3, borderRadius: 2, background: n <= level ? "var(--action-primary)" : "var(--border-default)" }} />
      ))}
    </span>
  );
}

/** Editor de uma questão: nível 1 a 5, nota opcional, salvar e remover. */
export function DifficultyEditor({ item, onSaved, onCancel }) {
  const { backend } = useSession();
  const [level, setLevel] = React.useState(item.level ?? null);
  const [note, setNote] = React.useState(item.note ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  const save = async (nextLevel) => {
    setBusy(true);
    setError(null);
    try {
      await backend.rpc("app_admin_set_question_difficulty", { p_question_id: item.id, p_level: nextLevel, p_note: nextLevel == null ? null : note.trim() || null });
      onSaved();
    } catch (e) {
      setError(messageOf(e, "Não foi possível gravar a dificuldade. Tente de novo."));
      setBusy(false);
    }
  };
  const changed = level !== (item.level ?? null) || note.trim() !== (item.note ?? "");

  return (
    <div role="group" aria-label={`Dificuldade de ${item.code}`} style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 4px 4px" }}>
      <div className="sm-field__label" id={`nivel-${item.id}`}>
        Nível validado
      </div>
      <div role="radiogroup" aria-labelledby={`nivel-${item.id}`} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
        {LEVELS.map((l) => {
          const on = level === l.value;
          return (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setLevel(l.value)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 8px", borderRadius: 12, cursor: "pointer",
                border: `2px solid ${on ? "var(--selected-border)" : "var(--border-default)"}`,
                background: on ? "var(--selected-bg)" : "var(--surface-card)",
                color: "var(--text-primary)", font: "600 14px var(--font-sans)",
              }}
            >
              <LevelBars level={l.value} />
              <span>
                {l.value} · {l.label}
              </span>
            </button>
          );
        })}
      </div>
      <TextArea label="Nota (opcional)" rows={2} maxLength={NOTE_MAX} value={note} onChange={setNote} hint={`${note.length}/${NOTE_MAX} caracteres. Ex.: quem validou e por quê.`} />
      <Banner tone="info">Só você, da equipe, define a dificuldade. O aluno vê o nível apenas depois de responder num treino, nunca no simulado.</Banner>
      {error && <Banner tone="danger">{error}</Banner>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={() => save(level)} disabled={level == null || !changed} loading={busy}>
          Salvar dificuldade
        </Button>
        {item.level != null && (
          <Button variant="secondary" onClick={() => save(null)} disabled={busy}>
            Remover dificuldade
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Fechar
        </Button>
      </div>
    </div>
  );
}

/** A lista, página por página, com busca por código ou tema, área, prova de origem e nível. */
export function QuestionDifficulty({ onBack }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [filters, setFilters] = React.useState({ search: "", area: "", level: "none" });
  const search = useDebounced(filters.search.trim());
  const [state, setState] = React.useState({ data: null, error: null, loading: true });
  const [tick, setTick] = React.useState(0);
  const [open, setOpen] = React.useState(null);
  const seq = React.useRef(0);
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  React.useEffect(() => {
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    backend.rpc("app_admin_question_difficulties", { p_filters: { search, area: filters.area, level: filters.level }, p_limit: PAGE, p_offset: 0 }).then(
      (data) => mine === seq.current && setState({ data, error: null, loading: false }),
      (error) => mine === seq.current && setState((s) => ({ ...s, error, loading: false }))
    );
  }, [backend, search, filters.area, filters.level, tick]);

  const more = async () => {
    const mine = ++seq.current;
    const loaded = state.data?.items ?? [];
    setState((s) => ({ ...s, loading: true }));
    try {
      const page = await backend.rpc("app_admin_question_difficulties", { p_filters: { search, area: filters.area, level: filters.level }, p_limit: PAGE, p_offset: loaded.length });
      if (mine !== seq.current) return;
      const seen = new Set(loaded.map((q) => q.id));
      setState({ data: { ...page, items: loaded.concat(page.items.filter((q) => !seen.has(q.id))) }, error: null, loading: false });
    } catch (error) {
      if (mine === seq.current) setState((s) => ({ ...s, error, loading: false }));
    }
  };

  const data = state.data;
  const missing = data ? data.questions_total - data.validated_total : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="secondary" icon="arrow-left" onClick={onBack}>
          Voltar às questões
        </Button>
      </div>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, font: "var(--type-h3, 700 20px var(--font-sans))", color: "var(--text-primary)" }}>Dificuldade validada</h2>
            <p style={{ margin: "4px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
              De 1 (muito fácil) a 5 (muito difícil). É um cadastro feito por pessoas da equipe: o sistema não calcula nem sugere nada.
            </p>
          </div>
          {data && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} aria-live="polite">
              <Badge tone="brand" size="sm">
                {data.validated_total} com dificuldade validada
              </Badge>
              <Badge tone={missing > 0 ? "warning" : "success"} size="sm">
                {missing} sem dificuldade validada
              </Badge>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.4fr)", gap: 12 }}>
            <TextField label="Buscar" icon="search" placeholder="Código ou tema" value={filters.search} onChange={(e) => set({ search: e.target.value })} />
            <SelectField label="Área" value={filters.area} onChange={(e) => set({ area: e.target.value })} options={[{ value: "", label: "Todas" }, ...AREA_OPTIONS]} />
            <SelectField label="Dificuldade" value={filters.level} onChange={(e) => set({ level: e.target.value })} options={LEVEL_FILTER} />
          </div>
        </div>
      </Card>
      {state.error && <LoadError error={state.error} retry={() => setTick((n) => n + 1)} />}
      {!data && !state.error && <Loading />}
      {data && (
        <>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }} aria-live="polite">
            {data.total} {data.total === 1 ? "questão" : "questões"}
          </div>
          {data.items.length === 0 ? (
            <EmptyState icon="check-circle" title={filters.level === "none" ? "Nenhuma questão sem dificuldade validada" : "Nenhuma questão encontrada"} description="Ajuste a busca ou os filtros." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.items.map((q) => (
                <div key={q.id} style={{ display: "flex", flexDirection: "column" }}>
                  <ListRow onClick={() => setOpen(open === q.id ? null : q.id)} label={`${open === q.id ? "Fechar" : "Definir dificuldade de"} ${q.code}`}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ font: "600 13px var(--font-mono)", color: "var(--text-secondary)" }}>{q.code}</span>
                        <Badge tone="brand" size="sm">
                          {areaLabel(q.area)}
                        </Badge>
                        {q.origin === "staziamed" && (
                          <Badge tone="neutral" size="sm">
                            Inédita
                          </Badge>
                        )}
                        {q.level != null ? (
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", font: "600 13px var(--font-sans)", color: "var(--text-primary)" }}>
                            <LevelBars level={q.level} /> {q.level} · {levelName(q.level)}
                          </span>
                        ) : (
                          <Badge tone="warning" size="sm">
                            Sem dificuldade validada
                          </Badge>
                        )}
                      </div>
                      <span style={{ font: "600 15px var(--font-sans)", color: "var(--text-primary)" }}>{q.topic}</span>
                      <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.excerpt}</span>
                      {q.level != null && (
                        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                          Validada em {dateBR(q.validated_at)}
                          {q.validated_by ? ` por ${q.validated_by}` : ""}
                          {q.note ? ` · ${q.note}` : ""}
                        </span>
                      )}
                    </div>
                    <Icon name={open === q.id ? "chevron-up" : "chevron-down"} size={18} style={{ color: "var(--text-tertiary)", flex: "none", alignSelf: "center" }} />
                  </ListRow>
                  {open === q.id && (
                    <Card>
                      <DifficultyEditor
                        key={`${q.id}-${q.level}-${q.note}`}
                        item={q}
                        onCancel={() => setOpen(null)}
                        onSaved={() => {
                          setOpen(null);
                          setTick((n) => n + 1);
                        }}
                      />
                    </Card>
                  )}
                </div>
              ))}
            </div>
          )}
          {data.items.length < data.total && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Button variant="secondary" onClick={more} loading={state.loading}>
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
