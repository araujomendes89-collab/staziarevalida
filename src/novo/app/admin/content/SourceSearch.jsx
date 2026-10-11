// Fontes oficiais com IA, parte 1: pedir a busca e acompanhar as buscas recentes.
// A IA só procura nos sites da lista (Sites oficiais); o servidor baixa e confere cada achado; o dono aprova ou
// rejeita em "Fontes encontradas". Tela só da Administração: o aluno nunca vê.
import React from "react";
import { Badge, Banner, Button, SelectField, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { useMobile } from "../../Shell.jsx";
import { AREAS } from "../../practice/format.js";
import { PROVIDER_NAME, usd } from "../ai/aiApi.js";
import { LoadError, Loading, useLoad } from "../common.jsx";
import { hubGet } from "./api.js";
import { SEARCH_STATUS } from "./labels.js";
import { Section, StatusBadge, useAction, when } from "./ui.jsx";

const NOTICE = "A busca roda no processamento da Central (até ~10 minutos); pode sair da tela.";
const OFF = "desligada — configure na Central de IAs";
const ACTIVE = new Set(["na_fila", "buscando", "conferindo"]);
const caption = { font: "var(--type-caption)", color: "var(--text-tertiary)" };
const areaName = (id) => AREAS.find((a) => a.id === id)?.label ?? null;

/** A resposta do banco pode vir como lista ou dentro de um objeto: aceita os dois. */
const listOf = (data, ...keys) => (Array.isArray(data) ? data : keys.map((k) => data?.[k]).find(Array.isArray) ?? []);

export function SourceSearchPanel({ onRequested }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [area, setArea] = React.useState("");
  const [mode, setMode] = React.useState("tema");
  const [theme, setTheme] = React.useState("");
  const [qty, setQty] = React.useState("5");
  const [free, setFree] = React.useState("");
  const [result, setResult] = React.useState(null);
  const act = useAction();
  const listId = React.useId();

  const status = useLoad(() => hubGet(backend, "/source-search/status"), [backend]);
  const themes = useLoad(() => backend.rpc("app_incidence", { p_dimension: "topic", p_area: area || null }), [backend, area]);
  const suggestions = listOf(themes.data, "rows").map((r) => r.key).filter(Boolean).slice(0, 80);

  const ready = Boolean(status.data?.ready);
  const n = Number(qty);
  const filled = mode === "tema" ? theme.trim().length > 0 : Number.isInteger(n) && n >= 1 && n <= 10;

  const changeQty = (value) => {
    const digits = value.replace(/\D/g, "");
    setQty(digits === "" ? "" : String(Math.min(10, Math.max(1, Number(digits)))));
  };

  const submit = () =>
    act
      .run(async () => {
        setResult(null);
        const r = await backend.rpc("app_ch_source_search_start", {
          p_request: { area: area || null, theme: mode === "tema" ? theme.trim() : null, top_themes: mode === "top" ? n : null, free_text: free.trim() || null },
        });
        setResult(listOf(r, "searches"));
        return r;
      }, null)
      .then((r) => {
        if (!r) return;
        onRequested?.();
      });

  const fresh = (result ?? []).filter((x) => !x.duplicate);
  const repeated = (result ?? []).filter((x) => x.duplicate);

  return (
    <Section title="Buscar fontes com IA">
      <div data-testid="source-search" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          A IA procura documentos só nos sites oficiais da lista abaixo. O servidor baixa e confere cada achado, e nada vira fonte sem a sua aprovação.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ font: "var(--type-label)" }}>Situação da busca:</span>
          {status.loading && !status.data && !status.error ? <span style={caption}>conferindo…</span> : status.error ? <Badge size="sm" tone="danger">indisponível</Badge> : ready ? <Badge size="sm" tone="success">pronta</Badge> : <Badge size="sm" tone="warning">{OFF}</Badge>}
        </div>
        {status.error && <LoadError error={status.error} retry={status.reload} />}
        {[...(status.data?.problems ?? []), ...(status.data?.warnings ?? [])].map((p, i) => (
          <span key={i} style={caption}>
            {p}
          </span>
        ))}
        <div data-testid="source-search-form" style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          <SelectField label="Área" value={area} onChange={(e) => setArea(e.target.value)} options={[{ value: "", label: "Todas" }, ...AREAS.map((a) => ({ value: a.id, label: a.label }))]} />
          <SelectField label="O que buscar" value={mode} onChange={(e) => setMode(e.target.value)} options={[{ value: "tema", label: "Um tema" }, { value: "top", label: "Temas mais cobrados" }]} />
          {mode === "tema" ? (
            <>
              <TextField label="Tema" list={listId} value={theme} maxLength={120} onChange={(e) => setTheme(e.target.value)} placeholder="ex.: Bronquiolite" />
              <datalist id={listId}>
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>
          ) : (
            <TextField label="Quantos temas (1 a 10)" type="number" inputMode="numeric" min="1" max="10" value={qty} onChange={(e) => changeQty(e.target.value)} hint="Os temas que mais caem nas provas oficiais da área; uma busca por tema." />
          )}
          <TextField label="Texto livre (opcional)" value={free} maxLength={300} onChange={(e) => setFree(e.target.value)} placeholder="ex.: PCDT mais recente de hepatite C" />
        </div>
        {act.feedback}
        {repeated.map((x) => (
          <Banner key={x.id} tone="info">{`Já havia uma busca igual na fila: ${x.theme}.`}</Banner>
        ))}
        {fresh.length > 0 && (
          <Banner tone="success">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>{fresh.length === 1 ? `Busca pedida: ${fresh[0].theme}.` : `${fresh.length} buscas pedidas: ${fresh.map((x) => x.theme).join(", ")}.`}</span>
              <span>{NOTICE}</span>
            </div>
          </Banner>
        )}
        <div>
          <Button icon="search" disabled={!ready || !filled} loading={act.busy} onClick={submit}>
            Buscar
          </Button>
        </div>
      </div>
    </Section>
  );
}

export function RecentSearches({ reloadKey = 0 }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_source_searches", { p_limit: 20 }), [backend, reloadKey]);
  const items = listOf(data, "items", "searches");
  const running = items.some((s) => ACTIVE.has(s.status));
  React.useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(reload, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  return (
    <Section title="Buscas recentes">
      <div data-testid="recent-searches">
        {error && <LoadError error={error} retry={reload} />}
        {!data && !error && <Loading />}
        {data && items.length === 0 && <p style={{ margin: 0, ...caption }}>Nenhuma busca pedida ainda.</p>}
        {items.map((s) => (
          <SearchRow key={s.id} search={s} />
        ))}
      </div>
    </Section>
  );
}

function SearchRow({ search: s }) {
  const [open, setOpen] = React.useState(false);
  const discarded = Array.isArray(s.discarded) ? s.discarded : [];
  const count = Number(s.discarded_count ?? discarded.length);
  const searches = Number(s.web_searches ?? 0);
  const checked = Number(s.verified_count ?? 0);
  const reasons = [s.message, s.job_error].filter((x, i, all) => x && all.indexOf(x) === i);
  return (
    <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "10px 0", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <strong>{s.theme || s.free_text || "Sem tema"}</strong>
        {areaName(s.area) && <span style={{ color: "var(--text-secondary)" }}>{areaName(s.area)}</span>}
        {s.origin === "incidencia" && <Badge size="sm" tone="info">tema mais cobrado</Badge>}
        <StatusBadge map={SEARCH_STATUS} value={s.status} />
        <span style={caption}>{when(s.created_at)}</span>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        {s.provider && <span>{`${PROVIDER_NAME[s.provider] ?? s.provider} · ${s.model ?? "modelo não informado"}`}</span>}
        {s.provider && <span>{`${searches} ${searches === 1 ? "busca" : "buscas"}`}</span>}
        {s.provider && <span>{usd(s.cost_usd)}</span>}
        {(s.status === "concluida" || checked > 0) && <span>{`${checked} ${checked === 1 ? "conferido" : "conferidos"}`}</span>}
        {count > 0 && (
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ all: "unset", cursor: "pointer", textDecoration: "underline" }}>
            {`${count} ${count === 1 ? "descartado" : "descartados"}`}
          </button>
        )}
      </div>
      {reasons.map((r) => (
        <span key={r} style={{ font: "var(--type-body-sm)", color: s.status === "falhou" ? "var(--danger-text)" : "var(--text-secondary)" }}>
          {r}
        </span>
      ))}
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 12, borderLeft: "3px solid var(--border-subtle)" }}>
          {discarded.map((d, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ font: "var(--type-body-sm)" }}>{d.titulo || "Sem título"}</span>
              <span style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>{d.motivo}</span>
              {d.link && <code style={{ ...caption, overflowWrap: "anywhere" }}>{d.link}</code>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
