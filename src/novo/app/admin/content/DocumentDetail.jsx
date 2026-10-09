// Detalhe de um documento: etapas, inventário, PDF ao lado da extração, afirmações e execuções de IA.
import { LicensePanel } from "./License.jsx";
import React from "react";
import { Badge, Banner, Button, Checkbox, SelectField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { useMobile } from "../../Shell.jsx";
import { LoadError, Loading, TextArea, useLoad } from "../common.jsx";
import { hubAvailable, hubDocumentUrl, hubPost } from "./api.js";
import { BLOCK_STATUS, BLOCK_TYPE, DOC_STATUS, JOB_STATUS, RIGHTS, STEP_LABEL } from "./labels.js";
import { ClaimCard, KeyValue, Label, ModelBadge, Pre, Section, StatusBadge, useAction, when } from "./ui.jsx";

const BUSY = new Set(["received", "extracting", "classifying", "verifying_sources", "drafting"]);

export function DocumentDetail({ id, go, isAdmin, params }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_document", { p_document_id: id }), [backend, id]);
  const running = data && (BUSY.has(data.document.status) || data.jobs.some((j) => j.status === "queued" || j.status === "running"));
  React.useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const d = data.document;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Button variant="ghost" size="sm" icon="undo-2" onClick={() => go("documentos")}>
          Documentos
        </Button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, font: "var(--type-h3)", overflowWrap: "anywhere" }}>{d.name}</h2>
        <StatusBadge map={DOC_STATUS} value={d.status} size="md" />
        {d.purpose === "reference_source" && <Badge tone="info">Fonte de referência</Badge>}
      </div>
      {d.failure && (
        <Banner tone={d.failure.startsWith("Pendência") ? "warning" : "danger"} title={d.failure.startsWith("Pendência") ? "Pendência" : "Falha"}>
          {d.failure}
        </Banner>
      )}
      <Jobs jobs={data.jobs} onChanged={reload} />
      <Inventory inv={data.inventory} onPage={(n) => go("documentos", { id, pagina: String(n) })} />
      <Viewer doc={d} pages={data.pages} page={Number(params.get("pagina")) || 1} setPage={(n) => go("documentos", { id, pagina: String(n) })} onChanged={reload} />
      <Section title={`Afirmações clínicas (${data.claims.length})`}>
        {data.claims.length === 0 && <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Nenhuma afirmação extraída ainda.</p>}
        {data.claims.map((c) => (
          <ClaimCard key={c.id} claim={c} onChanged={reload} canConfirm />
        ))}
      </Section>
      <Rights doc={d} onChanged={reload} />
      <LicensePanel doc={d} isAdmin={isAdmin} onChanged={reload} />
      <Section title="Procedência">
        <KeyValue
          items={[
            ["SHA-256", <code key="h">{d.sha256}</code>],
            ["Páginas", d.page_count],
            ["Tipo", { text: "PDF com texto", scanned: "Digitalizado (OCR)", mixed: "Misto (texto e digitalizado)" }[d.text_kind]],
            ["Autor", d.author],
            ["Editora", d.publisher],
            ["Data/edição", d.edition_date],
            ["Idioma", d.language],
            ["Enviado em", when(d.provenance?.uploaded_at ?? d.created_at)],
            ["Arquivo original", d.provenance?.original_file_name],
            ["Procedência", d.provenance?.source],
            ["Extrator", d.provenance?.extraction?.parser ? Object.entries(d.provenance.extraction.parser).map(([k, v]) => `${k} ${v ?? "—"}`).join(" · ") : undefined],
          ]}
        />
      </Section>
      {isAdmin && <AiRuns runs={data.ai_runs} />}
    </div>
  );
}

function Jobs({ jobs, onChanged }) {
  const { backend } = useSession();
  const act = useAction();
  if (!jobs.length) return null;
  return (
    <Section title="Etapas do processamento">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {jobs.map((j) => {
          const m = j.metrics ?? {};
          return (
            <div key={j.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
              <strong style={{ minWidth: 170 }}>{STEP_LABEL[j.step] ?? j.step}</strong>
              <StatusBadge map={JOB_STATUS} value={j.status} />
              <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                tentativa {j.attempts}/{j.max_attempts}
                {m.ms != null ? ` · ${(m.ms / 1000).toFixed(1)} s` : ""}
                {m.ai_calls ? ` · ${m.ai_calls} chamada(s) de IA` : ""}
                {m.cache_hits ? ` · ${m.cache_hits} reaproveitada(s)` : ""}
                {m.cost_usd != null ? ` · US$ ${Number(m.cost_usd).toFixed(4)}` : m.ai_calls ? " · custo não configurado" : ""}
                {m.rejections ? ` · ${m.rejections} recusa(s) da conferência` : ""}
              </span>
              {["succeeded", "dead", "failed", "blocked"].includes(j.status) && hubAvailable(backend) && (
                <Button size="sm" variant="ghost" icon="rotate-ccw" loading={act.busy} onClick={() => act.run(() => hubPost(backend, `/jobs/${j.id}/retry`), "Etapa de volta na fila.").then((r) => r && onChanged())}>
                  {j.status === "succeeded" ? "Reprocessar" : "Tentar de novo"}
                </Button>
              )}
              {j.error && <div style={{ flexBasis: "100%", font: "var(--type-body-sm)", color: j.status === "blocked" ? "var(--warning-text)" : "var(--danger-text)" }}>{j.error}</div>}
            </div>
          );
        })}
      </div>
      {act.feedback}
    </Section>
  );
}

function Inventory({ inv, onPage }) {
  if (!inv) return null;
  return (
    <Section title="Inventário da extração">
      {inv.complete ? (
        <Banner tone="success" icon="badge-check">
          Todas as {inv.pages} páginas registradas, sem elemento pendente ou ilegível.
        </Banner>
      ) : (
        <Banner tone="warning" icon="triangle-alert" title="Extração incompleta">
          {inv.pages}/{inv.expected_pages ?? "?"} páginas · {inv.unresolved.length} elemento(s) pendente(s) ou ilegível(is)
          {inv.pages_without_blocks.length > 0 && ` · páginas sem conteúdo extraído: ${inv.pages_without_blocks.join(", ")}`}. Nada é completado por inferência: resolva cada item conferindo o original.
        </Banner>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {Object.entries(inv.by_status).map(([k, n]) => (
          <StatusBadge key={k} map={{ [k]: [`${BLOCK_STATUS[k]?.[0] ?? k}: ${n}`, BLOCK_STATUS[k]?.[1] ?? "neutral"] }} value={k} />
        ))}
        {Object.entries(inv.by_type).map(([k, n]) => (
          <Badge key={k} size="sm">
            {BLOCK_TYPE[k] ?? k}: {n}
          </Badge>
        ))}
        {inv.flagged > 0 && (
          <Badge size="sm" tone="warning">
            {inv.flagged} com sinal de atenção
          </Badge>
        )}
      </div>
      {inv.unresolved.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {inv.unresolved.slice(0, 60).map((u) => (
            <button key={u.id} type="button" className="sm-btn sm-btn--secondary sm-btn--sm" onClick={() => onPage(u.page)}>
              p. {u.page} · {BLOCK_TYPE[u.type] ?? u.type} · {BLOCK_STATUS[u.status]?.[0]}
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

/** PDF original ao lado dos elementos extraídos da mesma página. */
function Viewer({ doc, pages, page, setPage, onChanged }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [url, setUrl] = React.useState(null);
  const [fileError, setFileError] = React.useState(null);
  const blocks = useLoad(() => backend.rpc("app_ch_blocks", { p_document_id: doc.id, p_page: page }), [backend, doc.id, page, pages.length, doc.status]);
  React.useEffect(() => {
    if (!hubAvailable(backend)) return undefined;
    let made = null;
    hubDocumentUrl(backend, doc.id).then((u) => setUrl((made = u)), (e) => setFileError(e.message));
    return () => made?.startsWith("blob:") && URL.revokeObjectURL(made);
  }, [backend, doc.id]);
  if (!pages.length) return null;
  const info = pages.find((p) => p.page_no === page);
  return (
    <Section
      title="Original × extração"
      action={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span style={{ font: "var(--type-label)" }}>
            p. {page}/{pages.length}
          </span>
          <Button size="sm" variant="secondary" disabled={page >= pages.length} onClick={() => setPage(page + 1)}>
            Próxima
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {info && <Badge size="sm">{{ text: "página com texto", scanned: "página digitalizada", empty: "página vazia" }[info.kind]}</Badge>}
        {info?.ocr_used && <Badge size="sm" tone="warning">lida por OCR</Badge>}
        {info?.printed_no && <Badge size="sm">número impresso: {info.printed_no}</Badge>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
        <div>
          {fileError && <Banner tone="warning">{fileError}</Banner>}
          {url && <iframe key={page} title="PDF original" src={`${url}#page=${page}`} style={{ width: "100%", height: mobile ? 420 : 720, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: mobile ? undefined : 720, overflowY: "auto" }}>
          {blocks.error && <LoadError error={blocks.error} retry={blocks.reload} />}
          {blocks.data?.length === 0 && <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Nenhum elemento nesta página.</p>}
          {(blocks.data ?? []).map((b) => (
            <BlockCard key={b.id} block={b} onChanged={() => (blocks.reload(), onChanged())} />
          ))}
        </div>
      </div>
    </Section>
  );
}

const FLAG_TEXT = {
  possible_prompt_injection: "Possível instrução embutida no texto: tratada só como texto, nunca seguida.",
  doubtful_ocr_critical: "OCR duvidoso em informação crítica (número, dose, unidade): conferir no original.",
  low_ocr_confidence: "Leitura por OCR com confiança baixa.",
  vector_diagram: "Fluxograma/diagrama desenhado: conferir setas, ordem e condições.",
  document_repaired: "Arquivo danificado ou cortado: conferir esta página com o original.",
  ocr_no_text: "OCR não reconheceu texto.",
};

function BlockCard({ block, onChanged }) {
  const { backend } = useSession();
  const [mode, setMode] = React.useState(null);
  const [status, setStatus] = React.useState(block.status);
  const [revised, setRevised] = React.useState(block.revised_text ?? "");
  const [reason, setReason] = React.useState("");
  const act = useAction();
  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge size="sm">
          #{block.idx} · {BLOCK_TYPE[block.type] ?? block.type}
        </Badge>
        <StatusBadge map={BLOCK_STATUS} value={block.status} />
        {block.ocr_confidence != null && <Badge size="sm">OCR {Math.round(block.ocr_confidence * 100)}%</Badge>}
        {(block.nodes ?? []).map((n) => (
          <Badge key={n.id} size="sm" tone={n.suggested ? "ai" : "brand"}>
            {n.name}
            {n.suggested ? " (sugerido)" : ""}
          </Badge>
        ))}
      </div>
      {(block.flags ?? []).map((f, i) => (
        <div key={i} style={{ font: "var(--type-caption)", color: "var(--warning-text)", marginTop: 4 }}>
          ⚠ {FLAG_TEXT[f.code] ?? f.detail ?? f.code}
        </div>
      ))}
      <Label>Texto original extraído (não se altera)</Label>
      <Pre>{block.original_text}</Pre>
      {block.revised_text && (
        <>
          <Label>Texto revisado</Label>
          <Pre tone="brand">{block.revised_text}</Pre>
        </>
      )}
      {block.status === "excluded" && <div style={{ font: "var(--type-caption)", marginTop: 4 }}>Excluído: {block.exclusion_reason}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <Button size="sm" variant="secondary" icon="pencil" onClick={() => setMode(mode === "resolve" ? null : "resolve")}>
          Revisar
        </Button>
        <Button size="sm" variant="secondary" icon="list-tree" onClick={() => setMode(mode === "classify" ? null : "classify")}>
          Classificar
        </Button>
      </div>
      {mode === "resolve" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} options={Object.entries(BLOCK_STATUS).map(([value, [label]]) => ({ value, label }))} />
          <TextArea label="Texto revisado (conferido no original; o extraído continua guardado)" value={revised} onChange={setRevised} rows={4} />
          {status === "excluded" && <TextArea label="Justificativa da exclusão" value={reason} onChange={setReason} rows={2} />}
          <div>
            <Button size="sm" icon="check" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_resolve_block", { p_block_id: block.id, p_status: status, p_revised_text: revised || null, p_reason: reason || null }), "Bloco atualizado.").then((r) => r && (setMode(null), onChanged()))}>
              Salvar
            </Button>
          </div>
        </div>
      )}
      {mode === "classify" && <ClassifyForm block={block} onDone={() => (setMode(null), onChanged())} />}
      {act.feedback}
    </div>
  );
}

/** Confirma (ou corrige) a classificação: um elemento pode estar em mais de uma área. */
function ClassifyForm({ block, onDone }) {
  const { backend } = useSession();
  const tax = useLoad(() => backend.rpc("app_ch_taxonomy"), [backend]);
  const [chosen, setChosen] = React.useState(() => new Set((block.nodes ?? []).map((n) => n.id)));
  const [filter, setFilter] = React.useState("");
  const act = useAction();
  if (!tax.data) return <Loading />;
  const nodes = tax.data.nodes.filter((n) => n.status === "active");
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path = (n) => {
    const parts = [];
    for (let x = n; x; x = byId.get(x.parent_id)) parts.unshift(x.name);
    return parts.join(" › ");
  };
  const shown = nodes.filter((n) => chosen.has(n.id) || (filter.trim().length >= 2 && path(n).toLowerCase().includes(filter.trim().toLowerCase()))).slice(0, 40);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      <input className="sm-input" style={{ padding: "8px 12px" }} placeholder="Buscar tema na taxonomia editorial…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {shown.map((n) => (
        <Checkbox
          key={n.id}
          label={path(n)}
          checked={chosen.has(n.id)}
          onChange={(e) => setChosen((s) => {
            const next = new Set(s);
            e.target.checked ? next.add(n.id) : next.delete(n.id);
            return next;
          })}
        />
      ))}
      <div>
        <Button size="sm" icon="check" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_classify_block", { p_block_id: block.id, p_node_ids: [...chosen] }), "Classificação confirmada.").then((r) => r && onDone())}>
          Confirmar classificação
        </Button>
      </div>
      {act.feedback}
    </div>
  );
}

function Rights({ doc, onChanged }) {
  const { backend } = useSession();
  const [status, setStatus] = React.useState(doc.rights_status);
  const [note, setNote] = React.useState(doc.rights_note ?? "");
  const act = useAction();
  return (
    <Section title="Direitos de uso">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} options={Object.entries(RIGHTS).map(([value, label]) => ({ value, label }))} />
        <TextArea label="Licença, autorização ou observação" value={note} onChange={setNote} rows={2} />
        {status !== "own" && status !== "licensed_adaptation" && (
          <Banner tone="info">Sem licença de adaptação, as unidades nascem como criação independente: o texto do original não é copiado (a conferência de cópia descarta trechos copiados).</Banner>
        )}
        <div>
          <Button size="sm" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_set_rights", { p_document_id: doc.id, p_status: status, p_note: note }), "Direitos atualizados.").then((r) => r && onChanged())}>
            Salvar
          </Button>
        </div>
        {act.feedback}
      </div>
    </Section>
  );
}

function AiRuns({ runs }) {
  if (!runs?.length) return null;
  return (
    <Section title="Execuções de IA">
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", font: "var(--type-body-sm)" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
              {["Etapa", "Modelo", "Prompt", "Situação", "Tokens (entrada/saída)", "Custo", "Tempo", "Recusas", "Quando"].map((h) => (
                <th key={h} style={{ padding: "6px 8px", borderBottom: "1px solid var(--border-default)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "6px 8px" }}>{STEP_LABEL[r.step] ?? r.step}</td>
                <td style={{ padding: "6px 8px" }}>
                  <ModelBadge model={r.model} />
                </td>
                <td style={{ padding: "6px 8px" }}>{r.prompt}</td>
                <td style={{ padding: "6px 8px" }}>{{ ok: "ok", rejected_by_check: "com recusas", invalid_output: "fora do formato", failed: "falhou" }[r.status] ?? r.status}</td>
                <td style={{ padding: "6px 8px" }}>{r.input_tokens ?? "—"} / {r.output_tokens ?? "—"}</td>
                <td style={{ padding: "6px 8px" }}>{r.cost_usd != null ? `US$ ${Number(r.cost_usd).toFixed(4)}` : "—"}</td>
                <td style={{ padding: "6px 8px" }}>{r.latency_ms != null ? `${(r.latency_ms / 1000).toFixed(1)} s` : "—"}</td>
                <td style={{ padding: "6px 8px" }}>{r.rejections || "—"}</td>
                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{when(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

