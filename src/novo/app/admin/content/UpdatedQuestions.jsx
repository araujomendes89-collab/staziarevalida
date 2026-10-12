// Painel "Questões atualizadas" (SQIE): gabarito oficial × resposta atual, tipo de mudança, data, fonte e situação.
import React from "react";
import { Badge, Banner, Button, EmptyState, SelectField, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, useLoad } from "../common.jsx";
import { hubAvailable, hubPost } from "./api.js";
import { AREA_LABEL } from "./labels.js";
import { Section, useAction, when } from "./ui.jsx";

const CHANGE = {
  NEW_RECOMMENDATION: "Recomendação nova", REMOVED_RECOMMENDATION: "Recomendação removida", MODIFIED_RECOMMENDATION: "Recomendação modificada", DOSE_CHANGED: "Dose",
  CUT_OFF_CHANGED: "Ponto de corte", SCREENING_CHANGED: "Rastreamento", DIAGNOSTIC_CRITERIA_CHANGED: "Critério diagnóstico", TREATMENT_CHANGED: "Tratamento",
  CONTRAINDICATION_CHANGED: "Contraindicação", TIMING_CHANGED: "Tempo", AGE_RANGE_CHANGED: "Faixa etária", GESTATIONAL_AGE_CHANGED: "Idade gestacional",
  FOLLOW_UP_CHANGED: "Seguimento", TERMINOLOGY_CHANGED: "Terminologia", NO_CLINICAL_IMPACT: "Sem impacto clínico", SOURCE_CHANGED: "Fonte mudou (sem comparação)",
};
const STATUS = { queued: "Aguardando reanálise", review_required: "Para decidir", reviewed: "Decidida", dismissed: "Dispensada" };
const PAGE = 20;

/** O motivo que o servidor devolve fala em termos técnicos (nome da chave, variável): aqui sai em português simples. */
export function friendlyPending(text) {
  return String(text ?? "")
    .replace(/Content Lab/g, "Central de Conteúdo")
    .replace(/\s*\((?:sinalizador\s+)?[A-Za-z_]+(?:=\w+)?\)/g, "")
    .trim();
}

/**
 * Reanálise por IA das questões cuja fonte oficial mudou (CC18): quantas esperam, o botão do administrador, a rodada automática
 * (chave "Análise automática") e o resultado da última rodada. A IA só propõe; o revisor médico decide na fila abaixo.
 */
function ReanalysisBox({ onDone }) {
  const { backend, boot } = useSession();
  const isAdmin = boot?.role === "admin";
  const { data, reload } = useLoad(() => backend.rpc("app_ch_reanalysis_status").catch(() => null), [backend]);
  const act = useAction();
  const [note, setNote] = React.useState(null);
  // banco ainda sem a atualização: a caixa não aparece (nada de erro técnico)
  if (!data) return null;
  const last = data.last_summary ?? {};
  const waiting = data.waiting ?? 0;
  const ask = () => {
    setNote(null);
    return act
      .run(async () => {
        const r = await hubPost(backend, "/questions/reanalysis");
        setNote(r.now ? "A reanálise começou. Volte em alguns minutos para ver as propostas." : "Pedido enviado: o processamento reanalisa na próxima rodada (até 10 minutos). Volte a esta tela para ver o resultado.");
        reload();
        onDone?.();
        return r;
      }, null);
  };
  return (
    <Section title="Reanálise por IA">
      <p style={{ margin: "0 0 8px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        Quando uma fonte oficial muda, a IA relê o trecho antigo e o novo e propõe o que mudou para cada questão afetada. Ela só propõe: nada vai ao aluno sem a decisão de um revisor médico.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Badge tone={waiting > 0 ? "warning" : "neutral"}>{waiting === 0 ? "Nenhuma questão esperando reanálise" : `${waiting} questão(ões) esperando reanálise`}</Badge>
        <Badge tone={data.auto ? "success" : "neutral"}>{data.auto ? "Análise automática ligada" : "Análise automática desligada"}</Badge>
        {data.requested_at && <Badge tone="info">Pedido enviado em {when(data.requested_at)}</Badge>}
        {isAdmin && hubAvailable(backend) && (
          <Button size="sm" icon="brain" loading={act.busy} disabled={waiting === 0 || Boolean(data.requested_at)} onClick={ask}>
            Reanalisar agora
          </Button>
        )}
      </div>
      {!data.auto && <p style={{ margin: "8px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Para a IA reanalisar sozinha a cada rodada, o administrador liga a "Análise automática" em Configuração e custos.</p>}
      {act.feedback}
      {note && <Banner tone="success">{note}</Banner>}
      {data.last_finished_at && (
        <p style={{ margin: "8px 0 0", font: "var(--type-body-sm)" }}>
          Última rodada ({data.last_manual ? "pedida por um administrador" : "automática"}): terminou em {when(data.last_finished_at)} · {last.saved ?? 0} proposta(s) gravada(s) · {last.skipped ?? 0} pulada(s)
          {last.pending ? `. Parou porque: ${friendlyPending(last.pending)}` : "."}
        </p>
      )}
      {data.last_started_at && !data.last_finished_at && <p style={{ margin: "8px 0 0", font: "var(--type-body-sm)" }}>Uma rodada começou em {when(data.last_started_at)} e ainda não terminou.</p>}
    </Section>
  );
}

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
    <>
    <ReanalysisBox onDone={reload} />
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
    </>
  );
}
