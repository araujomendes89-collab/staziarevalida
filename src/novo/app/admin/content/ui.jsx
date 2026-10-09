// Peças comuns do painel da Central de Conteúdo.
import React from "react";
import { Badge, Banner, Button, Card, ProgressBar, SelectField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { dateBR, messageOf, TextArea } from "../common.jsx";
import { CLAIM_STATUS, CRITICAL, isMockModel, pick, VERDICTS } from "./labels.js";
import { hubAvailable, hubPost } from "./api.js";

/** Como o trecho foi achado (busca por significado ligada): só pelas palavras, só pelo sentido ou pelos dois. */
const MATCH_LABEL = { significado: "pelo sentido", ambos: "palavras e sentido" };

export function StatusBadge({ map, value, size = "sm" }) {
  const [label, tone] = pick(map, value);
  return (
    <Badge tone={tone} size={size}>
      {label}
    </Badge>
  );
}

export function Section({ title, action, children, padding = 20 }) {
  return (
    <Card padding={padding}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, font: "var(--type-h4)" }}>{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function KeyValue({ items }) {
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "minmax(120px, max-content) 1fr", gap: "6px 16px", margin: 0, font: "var(--type-body-sm)" }}>
      {items
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => (
          <React.Fragment key={k}>
            <dt style={{ color: "var(--text-tertiary)" }}>{k}</dt>
            <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{v ?? "—"}</dd>
          </React.Fragment>
        ))}
    </dl>
  );
}

/** Texto preservado como veio (quebras de linha mantidas). */
export function Pre({ children, tone }) {
  return (
    <div
      style={{
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        font: "var(--type-body-sm)",
        background: tone === "brand" ? "var(--surface-brand-soft)" : "var(--surface-sunken)",
        borderRadius: "var(--radius-sm)",
        padding: "8px 10px",
      }}
    >
      {children || <span style={{ color: "var(--text-tertiary)" }}>(sem texto)</span>}
    </div>
  );
}

export const Label = ({ children }) => <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".04em", margin: "10px 0 4px" }}>{children}</div>;

export function useAction() {
  const [state, setState] = React.useState({ busy: false, error: null, done: null });
  const run = async (fn, done = "Feito.") => {
    setState({ busy: true, error: null, done: null });
    try {
      const result = await fn();
      setState({ busy: false, error: null, done });
      return result;
    } catch (error) {
      setState({ busy: false, error: messageOf(error, error?.message || "Não foi possível concluir."), done: null });
      return undefined;
    }
  };
  const feedback = state.error ? <Banner tone="danger">{state.error}</Banner> : state.done ? <Banner tone="success">{state.done}</Banner> : null;
  return { ...state, run, feedback };
}

/**
 * Andamento do envio de um PDF: `track(fn)` chama fn(opts) (opts vai a hubUploadPdf) e zera ao terminar, com ou sem erro.
 * O banco local não informa porcentagem: aparece só o texto, sem número inventado.
 */
export function useUploadProgress() {
  const [up, setUp] = React.useState({ stage: null, pct: 0 });
  const opts = {
    onStage: (stage) => setUp((u) => ({ ...u, stage })),
    onProgress: (pct) => setUp((u) => ({ ...u, pct })),
  };
  const track = async (fn) => {
    setUp({ stage: "enviando", pct: 0 });
    try {
      return await fn(opts);
    } finally {
      setUp({ stage: null, pct: 0 });
    }
  };
  return { ...up, track, bar: <UploadProgress stage={up.stage} pct={up.pct} /> };
}

/** Barra de porcentagem do envio ("Enviando o arquivo… 45%"); depois "Conferindo o arquivo…" sem porcentagem. */
export function UploadProgress({ stage, pct }) {
  if (!stage) return null;
  const sending = stage === "enviando";
  return (
    <div style={{ minWidth: 200, flex: 1 }}>
      <ProgressBar value={sending ? pct : 100} label={sending ? `Enviando o arquivo… ${pct}%` : "Conferindo o arquivo…"} />
    </div>
  );
}

/** Uma afirmação clínica: o que o PDF afirma, o que a referência estabelece e a conferência. */
const CONFIDENCE = { HIGH: ["Confiança alta", "success"], MODERATE: ["Confiança moderada", "info"], REVIEW_REQUIRED: ["Revisão obrigatória", "danger"] };

/** Nível calculado por regras (nunca uma porcentagem), com os componentes à vista no texto de ajuda. */
function ConfidenceBadge({ claimId }) {
  const { backend } = useSession();
  const [c, setC] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    backend.rpc("app_ch_claim_confidence", { p_claim_id: claimId }).then((r) => alive && setC(r), () => {});
    return () => {
      alive = false;
    };
  }, [backend, claimId]);
  if (!c) return null;
  const k = c.components;
  const why = [
    k.best_authority ? `melhor fonte: nível ${k.best_authority}` : "sem fonte oficial compatível",
    `${k.official_sources} fonte(s) oficial(is)`,
    k.cited_with_page ? "citação com página" : "sem citação com página",
    k.human_checked ? "conferida por pessoa" : "sem conferência humana",
    k.numbers_supported ? "números sustentados" : "número sem sustentação",
    k.conflict ? "conflito entre fontes" : null,
    k.critical_pending ? "dado crítico sem conferência" : null,
  ].filter(Boolean).join(" · ");
  const [label, tone] = CONFIDENCE[c.level] ?? [c.level, "neutral"];
  return <Badge size="sm" tone={tone} title={why}>{label}</Badge>;
}

export function ClaimCard({ claim, onChanged, canConfirm }) {
  const { backend } = useSession();
  const act = useAction();
  const [linking, setLinking] = React.useState(false);
  const pending = claim.critical_kinds?.length > 0 && !claim.critical_checked;
  return (
    <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px 0" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <StatusBadge map={CLAIM_STATUS} value={claim.status} />
        {claim.id && <ConfidenceBadge claimId={claim.id} />}
        {claim.page_no != null && <Badge size="sm">p. {claim.page_no}</Badge>}
        {(claim.critical_kinds ?? []).map((k) => (
          <Badge key={k} size="sm" tone="danger" icon="triangle-alert">
            {CRITICAL[k] ?? k}
          </Badge>
        ))}
        {claim.critical_kinds?.length > 0 && (claim.critical_checked ? <Badge size="sm" tone="success" icon="badge-check">conferida por pessoa</Badge> : <Badge size="sm" tone="warning">conferência humana pendente</Badge>)}
      </div>
      <Label>O que o PDF afirma</Label>
      <Pre>{claim.statement}</Pre>
      {claim.proposed_text && (
        <>
          <Label>Texto proposto para o material</Label>
          <Pre tone="brand">{claim.proposed_text}</Pre>
        </>
      )}
      <Label>O que a referência estabelece</Label>
      {(claim.evidence ?? []).length === 0 && <p style={{ margin: 0, color: "var(--text-tertiary)", font: "var(--type-body-sm)" }}>Nenhuma evidência vinculada.</p>}
      {(claim.evidence ?? []).map((e, i) => (
        <div key={i} style={{ marginBottom: 8, opacity: e.stale ? 0.6 : 1 }}>
          <Pre>{e.quote}</Pre>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, alignItems: "center", font: "var(--type-caption)", color: "var(--text-secondary)" }}>
            <StatusBadge map={CLAIM_STATUS} value={e.verdict} />
            {e.numeric_check?.by === "worker" && <Badge size="sm" tone="ai">proposta pela IA</Badge>}
            {e.numeric_check?.simulated && <Badge size="sm" tone="danger">simulação (não vale)</Badge>}
            {e.stale && <Badge size="sm" tone="warning">fonte substituída</Badge>}
            {e.numeric_check && e.numeric_check.ok === false && (
              <Badge size="sm" tone="danger">
                não confere: {[...(e.numeric_check.missing_in_evidence ?? []), ...(e.numeric_check.negations_missing_in_evidence ?? [])].join(", ")}
              </Badge>
            )}
            <span>
              {e.source} · {e.organ}
              {e.version ? ` · versão ${e.version}` : ""}
              {e.section ? ` · ${e.section}` : ""}
              {e.page != null ? ` · p. ${e.page}` : ""}
            </span>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <Button size="sm" variant="secondary" icon="link" onClick={() => setLinking((v) => !v)}>
          {linking ? "Fechar" : "Vincular evidência"}
        </Button>
        {pending && canConfirm && (
          <Button size="sm" variant="secondary" icon="badge-check" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_confirm_critical", { p_claim_id: claim.id }), "Conferência registrada.").then((r) => r && onChanged?.())}>
            Confirmar conferência de {claim.critical_kinds.map((k) => CRITICAL[k] ?? k).join(", ")}
          </Button>
        )}
      </div>
      {act.feedback}
      {linking && <EvidenceForm claim={claim} onLinked={() => (setLinking(false), onChanged?.())} />}
    </div>
  );
}

/** Busca nas fontes cadastradas e vínculo manual de evidência (o banco confere números e negações). */
function EvidenceForm({ claim, onLinked }) {
  const { backend } = useSession();
  const [query, setQuery] = React.useState((claim.proposed_text ?? claim.statement).slice(0, 160));
  const [results, setResults] = React.useState(null);
  const [chosen, setChosen] = React.useState(null);
  const [quote, setQuote] = React.useState("");
  const [verdict, setVerdict] = React.useState("compatible");
  const [mode, setMode] = React.useState(null);
  const act = useAction();
  // pelo servidor: com a busca por significado ligada, ele faz o vetor da pergunta (a chave nunca vem ao navegador)
  const search = () =>
    act.run(async () => {
      if (hubAvailable(backend)) {
        const r = await hubPost(backend, "/search", { query, filters: {}, limit: 10 });
        setMode(r.mode);
        setResults(r.results);
      } else {
        setMode("palavras");
        setResults(await backend.rpc("app_ch_search_passages", { p_query: query, p_filters: {}, p_limit: 10 }));
      }
    }, null);
  return (
    <div style={{ marginTop: 10, padding: 12, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", gap: 8 }}>
      <TextArea label="Buscar nas fontes cadastradas" value={query} onChange={setQuery} rows={2} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Button size="sm" icon="search" onClick={search} loading={act.busy && !chosen}>
          Buscar
        </Button>
        {mode && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Busca por {mode}</span>}
      </div>
      {results && results.length === 0 && <Banner tone="warning">Nenhum trecho encontrado. Cadastre a fonte oficial com o documento completo (aba Fontes).</Banner>}
      {(results ?? []).map((p) => (
        <button
          key={p.passage_id}
          type="button"
          className="sm-row"
          style={{ alignItems: "flex-start", flexDirection: "column", borderColor: chosen?.passage_id === p.passage_id ? "var(--selected-border)" : undefined }}
          onClick={() => (setChosen(p), setQuote(p.text))}
        >
          <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>
            {p.source} · {p.organ} · {p.version ? `versão ${p.version} · ` : ""}
            {p.section ?? ""} {p.page != null ? `· p. ${p.page}` : ""} · {p.status === "current" ? "vigente" : p.status}
            {MATCH_LABEL[p.match] && (
              <>
                {" "}
                <Badge size="sm">
                  {MATCH_LABEL[p.match]}
                  {p.similarity != null ? ` · ${Math.round(p.similarity * 100)}% parecido` : ""}
                </Badge>
              </>
            )}
          </span>
          <span style={{ font: "var(--type-body-sm)", textAlign: "left" }}>{p.text.slice(0, 400)}</span>
        </button>
      ))}
      {chosen && (
        <>
          <TextArea label="Trecho citado (recorte só o que sustenta a afirmação, sem alterar palavras)" value={quote} onChange={setQuote} rows={4} />
          <SelectField label="Conferência" value={verdict} onChange={(e) => setVerdict(e.target.value)} options={VERDICTS.map(([value, label]) => ({ value, label }))} />
          <div>
            <Button
              size="sm"
              icon="check"
              loading={act.busy}
              onClick={() =>
                act
                  .run(() => backend.rpc("app_ch_link_evidence", { p_claim_id: claim.id, p_evidence: { source_id: chosen.source_id, passage_id: chosen.passage_id, section: chosen.section, page: chosen.page, quote, verdict } }), "Evidência vinculada.")
                  .then((r) => r && onLinked())
              }
            >
              Vincular
            </Button>
          </div>
        </>
      )}
      {act.feedback}
    </div>
  );
}

export const ModelBadge = ({ model }) =>
  model ? (
    <Badge size="sm" tone={isMockModel(model) ? "danger" : "ai"}>
      {isMockModel(model) ? "simulação de desenvolvimento" : model}
    </Badge>
  ) : null;

export const shortHash = (h) => (h ? `${h.slice(0, 10)}…` : "—");
export const when = (iso) => (iso ? `${dateBR(iso)} ${new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "—");
