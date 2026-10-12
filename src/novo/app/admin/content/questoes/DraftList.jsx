// A lista dos rascunhos de Questões StaziaMed: filtros, contagens, distribuição do gabarito publicado e "Conferir pendentes".
import React from "react";
import { Badge, Banner, Button, Checkbox, EmptyState, SegmentedControl, SelectField, TextField } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { LoadError, Loading, useLoad } from "../../common.jsx";
import { hubPost } from "../api.js";
import { AREA_LABEL } from "../labels.js";
import { Section, useAction } from "../ui.jsx";
import { CostBox } from "./CostBox.jsx";
import { DraftDetail } from "./DraftDetail.jsx";
import { AREAS, LAYER, ORIGEM, SITUACAO_FILTRO, VERDICT, batchName } from "./labels.js";

const PAGE = 20;

export function DraftList({ isAdmin, isStaff, reviewerAreas }) {
  const { backend } = useSession();
  const [f, setF] = React.useState({ batch: "", status: "awaiting_medical_review", area: "", origin: "", topic: "", noTopic: false, blocked: false, minSimilarity: "" });
  const [page, setPage] = React.useState(0);
  const set = (patch) => (setPage(0), setPending(null), setF((v) => ({ ...v, ...patch })));
  const [pending, setPending] = React.useState(null);
  const act = useAction();
  const topic = f.noTopic ? "" : f.topic.trim() || null;
  const filters = {
    p_batch: f.batch || null,
    p_status: f.status || null,
    p_area: f.area || null,
    p_origin: f.origin || null,
    p_topic: topic,
    p_blocked: f.blocked ? true : null,
    p_min_similarity: f.minSimilarity.trim() && Number.isFinite(Number(f.minSimilarity)) ? Number(f.minSimilarity) : null,
  };
  const { data, error, reload } = useLoad(() => backend.rpc("app_draft_questions", { ...filters, p_limit: PAGE, p_offset: page * PAGE }), [backend, JSON.stringify(filters), page]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const pages = Math.max(Math.ceil(data.total / PAGE), 1);
  const c = data.counts ?? {};
  // o filtro que "Conferir pendentes" usa: o mesmo da lista
  const filtro = Object.fromEntries(Object.entries({ batch: filters.p_batch, status: filters.p_status, area: filters.p_area, origin: filters.p_origin, topic: filters.p_topic, blocked: filters.p_blocked, min_similarity: filters.p_min_similarity }).filter(([, v]) => v !== null));
  const calc = () => act.run(async () => setPending(await hubPost(backend, "/questoes-staziamed/estimativa", { acao: "conferir", filtro })), "Custo calculado.");
  const confirm = () =>
    act
      .run(async () => {
        const r = await hubPost(backend, "/questoes-staziamed/conferir", { rascunhos: pending.rascunhos });
        setPending(null);
        return r;
      }, "Conferência pedida: as tarefas entram na fila.")
      .then((r) => r && reload());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section title="Lotes e pedidos">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.batches.map((b) => (
            <Badge key={b.batch} tone="neutral">
              {batchName(b.batch)}: {b.awaiting} aguardando · {b.approved} aprovadas · {b.published ?? 0} publicadas · {b.needs_changes} com ajustes · {b.rejected} recusadas (de {b.total})
            </Badge>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, font: "var(--type-body-sm)" }} aria-label="Gabarito das publicadas">
          <strong>Gabarito das publicadas:</strong>
          {["A", "B", "C", "D"].map((l) => (
            <Badge key={l} size="sm" tone="neutral">
              {l}: {data.answer_distribution?.[l] ?? 0}
            </Badge>
          ))}
        </div>
      </Section>
      <Section title="Conferência independente">
        <p style={{ margin: "0 0 8px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          Cada camada é separada e nenhuma aprova nada. "Fonte insuficiente" e "não foi possível conferir" significam que falta o documento oficial no acervo, e não que o conteúdo esteja certo.
        </p>
        {Object.keys(LAYER).map((layer) => (
          <div key={layer} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "4px 0" }}>
            <strong style={{ minWidth: 250, font: "var(--type-body-sm)" }}>{LAYER[layer]}</strong>
            {Object.keys(data.checks?.[layer] ?? {}).length === 0 && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>ainda não rodou</span>}
            {Object.entries(data.checks?.[layer] ?? {}).map(([v, n]) => (
              <Badge key={v} size="sm" tone={VERDICT[v]?.[1] ?? "neutral"}>
                {VERDICT[v]?.[0] ?? v}: {n}
              </Badge>
            ))}
          </div>
        ))}
        {isStaff && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" variant="secondary" icon="list-checks" loading={act.busy} onClick={calc}>
                Conferir pendentes
              </Button>
              {pending && (
                <Button size="sm" icon="check" loading={act.busy} disabled={pending.rascunhos.length === 0} onClick={confirm}>
                  {pending.rascunhos.length === 0 ? "Nada pendente neste filtro" : `Confirmar conferência de ${pending.rascunhos.length} ${pending.rascunhos.length === 1 ? "rascunho" : "rascunhos"}`}
                </Button>
              )}
            </div>
            <CostBox estimate={pending} />
            {act.feedback}
          </div>
        )}
      </Section>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <SegmentedControl label="Situação" value={f.status} onChange={(v) => set({ status: v })} options={SITUACAO_FILTRO} />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ width: 200 }}>
          <SelectField aria-label="Filtrar por origem" value={f.origin} onChange={(e) => set({ origin: e.target.value })} options={[{ value: "", label: "Todas as origens" }, ...Object.entries(ORIGEM).map(([value, label]) => ({ value, label }))]} />
        </div>
        <div style={{ width: 240 }}>
          <SelectField aria-label="Filtrar por pedido ou lote" value={f.batch} onChange={(e) => set({ batch: e.target.value })} options={[{ value: "", label: "Todos os pedidos e lotes" }, ...data.batches.map((b) => ({ value: b.batch, label: batchName(b.batch) }))]} />
        </div>
        <div style={{ width: 220 }}>
          <SelectField aria-label="Filtrar por área" value={f.area} onChange={(e) => set({ area: e.target.value })} options={[{ value: "", label: "Todas as áreas" }, ...AREAS.map((value) => ({ value, label: AREA_LABEL[value] ?? value }))]} />
        </div>
        <div style={{ width: 220 }}>
          <TextField aria-label="Filtrar por tema" placeholder="Tema (texto exato)" value={f.topic} disabled={f.noTopic} onChange={(e) => set({ topic: e.target.value })} />
        </div>
        <Checkbox label="Sem tema" checked={f.noTopic} onChange={(e) => set({ noTopic: e.target.checked })} />
        <Checkbox label="Bloqueadas sem fonte oficial" checked={f.blocked} onChange={(e) => set({ blocked: e.target.checked })} />
        <div style={{ width: 160 }}>
          <TextField aria-label="Semelhança mínima" type="number" min={0} max={100} placeholder="Semelhança ≥ %" value={f.minSimilarity} onChange={(e) => set({ minSimilarity: e.target.value })} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label="Contagens">
        <Badge size="sm" tone="warning">{c.awaiting_medical_review ?? 0} aguardando</Badge>
        <Badge size="sm" tone="info">{c.needs_changes ?? 0} com ajustes</Badge>
        <Badge size="sm" tone="success">{c.approved ?? 0} aprovadas</Badge>
        <Badge size="sm" tone="success">{c.published ?? 0} publicadas</Badge>
        <Badge size="sm" tone="neutral">{c.retired ?? 0} recolhidas</Badge>
        <Badge size="sm" tone="danger">{c.rejected ?? 0} recusadas</Badge>
        <Badge size="sm" tone="danger">{c.blocked ?? 0} bloqueadas sem fonte oficial</Badge>
        {(c.stale ?? 0) > 0 && <Badge size="sm" tone="warning">{c.stale} com fonte desatualizada</Badge>}
      </div>
      {reviewerAreas.length > 0 && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Você pode decidir nas áreas: {reviewerAreas.map((a) => AREA_LABEL[a] ?? a).join(", ")}.</div>}
      <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{data.total} questões</div>
      {data.items.length === 0 && <EmptyState icon="file-question" title="Nenhuma questão aqui" description="Mude os filtros acima." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.items.map((d) => (
          <DraftDetail key={d.id} item={d} isAdmin={isAdmin} isStaff={isStaff} onChanged={reload} />
        ))}
      </div>
      {pages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span style={{ font: "var(--type-label)" }}>
            {page + 1}/{pages}
          </span>
          <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
