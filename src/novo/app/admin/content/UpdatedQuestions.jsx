// Painel "Questões atualizadas" (SQIE): gabarito oficial × resposta atual, tipo de mudança, data, fonte e situação.
import React from "react";
import { Badge, Button, EmptyState, SelectField, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, useLoad } from "../common.jsx";
import { AREA_LABEL } from "./labels.js";
import { Section, when } from "./ui.jsx";

const CHANGE = {
  NEW_RECOMMENDATION: "Recomendação nova", REMOVED_RECOMMENDATION: "Recomendação removida", MODIFIED_RECOMMENDATION: "Recomendação modificada", DOSE_CHANGED: "Dose",
  CUT_OFF_CHANGED: "Ponto de corte", SCREENING_CHANGED: "Rastreamento", DIAGNOSTIC_CRITERIA_CHANGED: "Critério diagnóstico", TREATMENT_CHANGED: "Tratamento",
  CONTRAINDICATION_CHANGED: "Contraindicação", TIMING_CHANGED: "Tempo", AGE_RANGE_CHANGED: "Faixa etária", GESTATIONAL_AGE_CHANGED: "Idade gestacional",
  FOLLOW_UP_CHANGED: "Seguimento", TERMINOLOGY_CHANGED: "Terminologia", NO_CLINICAL_IMPACT: "Sem impacto clínico", SOURCE_CHANGED: "Fonte mudou (sem comparação)",
};
const STATUS = { queued: "Aguardando reanálise", review_required: "Para decidir", reviewed: "Decidida", dismissed: "Dispensada" };
const PAGE = 20;

export function UpdatedQuestions() {
  const { backend } = useSession();
  const [area, setArea] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [differs, setDiffers] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const filters = { area, status, differs, search };
  const { data, error, reload } = useLoad(() => backend.rpc("app_updated_questions", { p_filters: filters, p_limit: PAGE, p_offset: page * PAGE }), [backend, area, status, differs, search, page]);
  const pages = Math.max(Math.ceil((data?.total ?? 0) / PAGE), 1);
  return (
    <Section title="Questões atualizadas">
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <div style={{ width: 200 }}>
          <SelectField label="Área" value={area} onChange={(e) => (setArea(e.target.value), setPage(0))} options={[{ value: "", label: "Todas" }, ...Object.entries(AREA_LABEL).map(([value, label]) => ({ value, label }))]} />
        </div>
        <div style={{ width: 200 }}>
          <SelectField label="Situação" value={status} onChange={(e) => (setStatus(e.target.value), setPage(0))} options={[{ value: "", label: "Todas" }, ...Object.entries(STATUS).map(([value, label]) => ({ value, label }))]} />
        </div>
        <div style={{ width: 220 }}>
          <TextField label="Tema" value={search} onChange={(e) => (setSearch(e.target.value), setPage(0))} />
        </div>
        <Button size="sm" variant={differs ? "primary" : "secondary"} onClick={() => (setDiffers((v) => !v), setPage(0))}>
          Só onde o gabarito seria outro hoje
        </Button>
      </div>
      {error && <LoadError error={error} retry={reload} />}
      {!data && !error && <Loading />}
      {data?.items.length === 0 && <EmptyState icon="inbox" title="Nenhuma questão atualizada" description="Quando uma fonte oficial mudar, as questões afetadas aparecem aqui com o tipo de mudança." />}
      {data?.items.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", font: "var(--type-body-sm)" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
                {["Questão", "Prova", "Tema", "Gabarito oficial", "Resposta atual", "Mudança", "Detectada", "Fonte", "Situação"].map((h) => (
                  <th key={h} style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.question_id} style={{ borderTop: "1px solid var(--border-subtle)", verticalAlign: "top" }}>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.critical && <Badge size="sm" tone="danger">crítico</Badge>} {r.number}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.exam_id}{r.year ? ` · ${r.year}` : ""}</td>
                  <td style={{ padding: "6px 8px" }}>{r.topic}</td>
                  <td style={{ padding: "6px 8px" }}>{r.official_answer ?? "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{r.current_answer ?? <span style={{ color: "var(--text-tertiary)" }}>não conferida</span>}</td>
                  <td style={{ padding: "6px 8px" }}>{CHANGE[r.change_type] ?? r.change_type ?? "—"}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{when(r.detected_at)}</td>
                  <td style={{ padding: "6px 8px" }}>{r.source ?? "—"}</td>
                  <td style={{ padding: "6px 8px" }}><Badge size="sm" tone={r.status === "reviewed" ? "success" : "warning"}>{STATUS[r.status] ?? r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 12 }}>
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span style={{ font: "var(--type-label)" }}>{page + 1}/{pages}</span>
          <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      )}
    </Section>
  );
}
