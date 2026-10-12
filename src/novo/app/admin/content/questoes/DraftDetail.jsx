// Um rascunho de Questão StaziaMed: resumo na lista e, aberto, o texto completo, as citações, a questão oficial mais parecida, as
// conferências, a revisão automática, a trilha e as ações (editar, conferir, buscar fonte, equilibrar, decidir, publicar, recolher).
import React from "react";
import { Badge, Banner, Button, Checkbox } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { TextArea } from "../../common.jsx";
import { hubPost } from "../api.js";
import { AREA_LABEL } from "../labels.js";
import { Label, Pre, useAction, when } from "../ui.jsx";
import { CostBox } from "./CostBox.jsx";
import { DraftEditor } from "./DraftEditor.jsx";
import { PublishBox } from "./PublishBox.jsx";
import { SourceProposal } from "./SourceProposal.jsx";
import { LAYER, PEDAGOGY_VERDICT, REVIEW_VERDICT, SEVERITY, SITUACAO, VERDICT, batchName } from "./labels.js";

const EVENT = {
  importada: "Importada do gerador antigo",
  gerada: "Gerada pelo servidor",
  editada: "Editada",
  fonte_proposta: "Fonte oficial proposta",
  fonte_aceita: "Fontes oficiais aplicadas",
  conferida: "Conferida",
  decisao: "Decisão do revisor",
  publicada: "Publicada",
  republicada: "Republicada",
  recolhida: "Recolhida",
};
const isFresh = (c) => typeof c?.passage_id === "string";

export function DraftDetail({ item, isAdmin, isStaff, onChanged }) {
  const { backend } = useSession();
  const [open, setOpen] = React.useState(false);
  const [detail, setDetail] = React.useState(null);
  const [loadError, setLoadError] = React.useState(null);
  const [editing, setEditing] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const [note, setNote] = React.useState("");
  const [sourcesChecked, setSourcesChecked] = React.useState(false);
  const [pending, setPending] = React.useState(null); // { kind: "conferir" | "fonte", estimate }
  const act = useAction();
  const [label, tone] = SITUACAO[item.situacao] ?? SITUACAO[item.status] ?? [item.status, "neutral"];
  const blockers = item.approval_blockers ?? [];

  const load = React.useCallback(() => {
    setLoadError(null);
    return backend.rpc("app_draft_question_detail", { p_id: item.id }).then(setDetail, (e) => setLoadError(e?.message ?? "Não foi possível abrir o rascunho."));
  }, [backend, item.id, item.content_hash]);
  React.useEffect(() => {
    if (open) load();
  }, [open, load]);
  const refresh = () => (onChanged(), load());

  const d = detail?.draft ?? item;
  const ai = d.ai_review;
  const pedagogy = ai?.pedagogia;
  const issues = [...(ai?.medical?.critical_issues ?? []), ...(ai?.pedagogical?.critical_issues ?? [])];
  const canEdit = item.can_edit && item.status !== "rejected";

  const decide = (decision, done) =>
    act.run(() => backend.rpc("app_draft_question_decide", { p_id: item.id, p_decision: decision, p_note: note || null, p_hash: item.content_hash, p_sources_checked: sourcesChecked }), done).then((r) => {
      if (r) refresh();
    });
  const estimate = (kind) =>
    act.run(async () => setPending({ kind, estimate: await hubPost(backend, "/questoes-staziamed/estimativa", kind === "conferir" ? { acao: "conferir", rascunhos: [item.id] } : { acao: "fonte", rascunho: item.id }) }), "Custo calculado.");
  const confirmPending = () =>
    act
      .run(async () => {
        if (pending.kind === "conferir") await hubPost(backend, "/questoes-staziamed/conferir", { rascunhos: [item.id] });
        else await hubPost(backend, `/questoes-staziamed/rascunhos/${item.id}/buscar-fonte`, {});
        setPending(null);
      }, pending?.kind === "conferir" ? "Conferência pedida: a tarefa entra na fila." : "Busca de fonte pedida: a tarefa entra na fila.")
      .then(() => load());
  const balance = () => act.run(() => backend.rpc("app_draft_balance_answer", { p_id: item.id, p_hash: item.content_hash }), "Gabarito equilibrado. As conferências e a revisão voltaram a zero.").then((r) => r && refresh());

  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 12 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ all: "unset", cursor: "pointer", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
        <Badge size="sm" tone={tone}>{label}</Badge>
        <Badge size="sm" tone="brand">{AREA_LABEL[item.area] ?? item.area}</Badge>
        <Badge size="sm">{batchName(item.batch)} · nº {item.slot}</Badge>
        {item.topic ? <Badge size="sm" tone="neutral">{item.topic}</Badge> : <Badge size="sm" tone="warning">sem tema</Badge>}
        {item.blocked_no_source && <Badge size="sm" tone="danger">Bloqueada: sem fonte oficial</Badge>}
        {item.stale_sources?.length > 0 && <Badge size="sm" tone="warning">fonte desatualizada: {item.stale_sources.join("; ")}</Badge>}
        {item.similarity_to_official >= 50 && <Badge size="sm" tone="warning">semelhança com questão oficial: {item.similarity_to_official}%</Badge>}
        {item.review_outdated && <Badge size="sm" tone="danger">texto mudou depois da revisão</Badge>}
        {Object.entries(item.checks ?? {}).filter(([, c]) => c.current && ["fail", "issues"].includes(c.verdict)).map(([layer, c]) => (
          <Badge key={layer} size="sm" tone={VERDICT[c.verdict][1]}>
            {LAYER[layer].split(" (")[0]}: {VERDICT[c.verdict][0]}
          </Badge>
        ))}
        {item.support_type === "IMAGE_REQUEST" && <Badge size="sm" tone="danger">pede imagem que não existe</Badge>}
        <strong style={{ flexBasis: "100%", font: "var(--type-body-sm)" }}>{item.title ?? item.stem.slice(0, 90)}</strong>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {loadError && <Banner tone="danger">{loadError}</Banner>}
          {item.blocked_no_source && (
            <Banner tone="danger" title="Bloqueada: sem fonte oficial">
              {item.generated_by === "gerador_antigo" ? "As citações deste rascunho são de apostila, que não é fonte oficial. " : ""}Use "Buscar fonte oficial" para propor trechos de fontes oficiais; sem isso ele não pode ser aprovado.
            </Banner>
          )}
          {editing ? (
            <DraftEditor
              draft={d}
              notice={notice}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                setNotice(null);
                refresh();
              }}
            />
          ) : (
            <>
              <Label>Enunciado</Label>
              <Pre>{d.stem}</Pre>
              {d.support_rows?.length > 0 && (
                <>
                  <Label>{d.support_title ?? "Dados de apoio"} (o aluno precisa disto para responder)</Label>
                  <table style={{ borderCollapse: "collapse", font: "var(--type-body-sm)", width: "100%" }}>
                    <tbody>
                      {d.support_rows.map((r, i) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "4px 8px", color: "var(--text-secondary)" }}>{r.label}</td>
                          <td style={{ padding: "4px 8px", fontWeight: 600 }}>{r.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              <Label>Alternativas (resposta do rascunho: {d.correct_answer})</Label>
              {Object.entries(d.alternatives ?? {}).map(([id, text]) => (
                <div key={id} style={{ margin: "6px 0", fontWeight: id === d.correct_answer ? 700 : 400 }}>
                  {id}) {text}
                  <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", fontWeight: 400 }}>{d.alternative_explanations?.[id]}</div>
                </div>
              ))}
              {d.explanation && (
                <>
                  <Label>Comentário do professor</Label>
                  <Pre>{d.explanation}</Pre>
                </>
              )}
              {d.clinical_decision && (
                <>
                  <Label>Decisão clínica central</Label>
                  <Pre>{d.clinical_decision}</Pre>
                </>
              )}
              {d.update_application && (
                <>
                  <Label>Atualização aplicada</Label>
                  <Pre>{d.update_application}</Pre>
                </>
              )}
            </>
          )}
          {d.source_citations?.length > 0 && (
            <>
              <Label>Fontes citadas</Label>
              <ul style={{ margin: 0, paddingLeft: 18, font: "var(--type-body-sm)" }}>
                {d.source_citations.map((c, i) =>
                  isFresh(c) ? (
                    <li key={i}>
                      <strong>{c.source}</strong> · {c.organ}
                      {c.version ? ` · versão ${c.version}` : ""}
                      {c.page != null ? ` · p. ${c.page}` : ""}
                      <blockquote style={{ margin: "2px 0 4px", paddingLeft: 10, borderLeft: "3px solid var(--border-default)", color: "var(--text-secondary)" }}>{c.quote}</blockquote>
                    </li>
                  ) : (
                    <li key={i} style={{ textDecoration: "line-through", color: "var(--text-tertiary)" }}>
                      <span style={{ textDecoration: "line-through" }}>
                        {c.source_file}: {c.supported_claim}
                      </span>{" "}
                      <Badge size="sm" tone="danger">não é fonte oficial</Badge>
                    </li>
                  )
                )}
              </ul>
            </>
          )}
          {detail?.similar_question && (
            <>
              <Label>Questão oficial mais parecida ({detail.similar_question.exam_label}, {detail.similar_question.code}) — lado a lado</Label>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
                <div>
                  <Badge size="sm" tone="brand">Este rascunho</Badge>
                  <Pre>{d.stem}</Pre>
                </div>
                <div>
                  <Badge size="sm" tone="neutral">Questão oficial</Badge>
                  <Pre>{detail.similar_question.statement}</Pre>
                </div>
              </div>
            </>
          )}
          <Label>Conferência independente</Label>
          {Object.keys(LAYER).map((layer) => {
            const c = item.checks?.[layer];
            return (
              <div key={layer} style={{ margin: "4px 0 8px" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <strong style={{ font: "var(--type-body-sm)" }}>{LAYER[layer]}</strong>
                  {!c && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>ainda não conferida</span>}
                  {c && <Badge size="sm" tone={VERDICT[c.verdict]?.[1]}>{VERDICT[c.verdict]?.[0]}</Badge>}
                  {c && !c.current && <Badge size="sm" tone="warning">texto mudou: conferir de novo</Badge>}
                  {c?.model && c.model !== "regras" && <Badge size="sm">{c.model}</Badge>}
                </div>
                {(c?.findings ?? []).map((f, i) => (
                  <div key={i} style={{ font: "var(--type-body-sm)", paddingLeft: 12, marginTop: 2 }}>
                    <Badge size="sm" tone={SEVERITY[f.severity]?.[1]}>{SEVERITY[f.severity]?.[0] ?? f.severity}</Badge> {f.where ? <em>{f.where}: </em> : null}
                    {f.detail}
                  </div>
                ))}
              </div>
            );
          })}
          <Label>Revisão automática (IA): apontamento, não aprovação</Label>
          {!ai && <p style={{ margin: 0, color: "var(--text-tertiary)", font: "var(--type-body-sm)" }}>Sem revisão automática neste rascunho.</p>}
          {ai && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, font: "var(--type-body-sm)" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ai.medical && <Badge size="sm" tone="ai">médica: {REVIEW_VERDICT[ai.medical?.verdict] ?? ai.medical?.verdict ?? "—"}</Badge>}
                {ai.pedagogical && <Badge size="sm" tone="ai">pedagógica: {REVIEW_VERDICT[ai.pedagogical?.verdict] ?? ai.pedagogical?.verdict ?? "—"}</Badge>}
                {pedagogy && <Badge size="sm" tone="ai">revisão pedagógica da IA: {PEDAGOGY_VERDICT[pedagogy.verdict] ?? pedagogy.verdict}</Badge>}
                {ai.model && <Badge size="sm">{ai.model}</Badge>}
              </div>
              {issues.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {issues.map((x, i) => (
                    <li key={i}>{typeof x === "string" ? x : JSON.stringify(x)}</li>
                  ))}
                </ul>
              )}
              {(pedagogy?.issues ?? []).length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {pedagogy.issues.map((x, i) => (
                    <li key={i}>
                      <em>{x.where}: </em>
                      {x.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {d.generation?.prompts && (
            <p style={{ margin: "8px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
              Geração: {d.generation.modelos?.criacao?.model ?? "—"} · {d.generation.reescrita?.feita ? "com uma reescrita" : "sem reescrita"} · custo US$ {Number(d.generation.custo_usd ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
            </p>
          )}
          {detail?.proposals?.length > 0 && (
            <>
              <Label>Propostas de fonte oficial</Label>
              {detail.proposals.map((p) => (
                <SourceProposal
                  key={p.id}
                  proposal={p}
                  canAct={item.can_edit}
                  onUsed={(r) => {
                    if (r.revisar_aplicacao) {
                      setNotice("Revise o campo 'aplicação da atualização': ele fala da apostila.");
                      setEditing(true);
                    }
                    refresh();
                  }}
                  onDiscarded={refresh}
                />
              ))}
            </>
          )}
          {detail?.events?.length > 0 && (
            <>
              <Label>Trilha</Label>
              <ul style={{ margin: 0, paddingLeft: 18, font: "var(--type-body-sm)" }}>
                {detail.events.map((e, i) => (
                  <li key={i}>
                    {when(e.at)} · {EVENT[e.kind] ?? e.kind}
                    {e.actor_email ? ` · ${e.actor_email}` : ""}
                    {e.note ? ` — ${e.note}` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
          {item.reviewed_at && (
            <p style={{ margin: "10px 0 0", font: "var(--type-body-sm)" }}>
              Decisão de {item.reviewer} em {when(item.reviewed_at)}
              {item.review_note ? `: ${item.review_note}` : "."}
            </p>
          )}

          {item.can_edit && !editing && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {canEdit && (
                <Button size="sm" variant="secondary" icon="pencil" onClick={() => setEditing(true)}>
                  Editar
                </Button>
              )}
              <Button size="sm" variant="secondary" icon="list-checks" loading={act.busy} onClick={() => estimate("conferir")}>
                Conferir
              </Button>
              <Button size="sm" variant="secondary" icon="search" loading={act.busy} onClick={() => estimate("fonte")}>
                Buscar fonte oficial
              </Button>
              {canEdit && (
                <Button size="sm" variant="secondary" icon="arrow-left-right" loading={act.busy} onClick={balance}>
                  Equilibrar gabarito
                </Button>
              )}
            </div>
          )}
          {pending && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              <CostBox estimate={pending.estimate} />
              <div style={{ display: "flex", gap: 8 }}>
                <Button size="sm" icon="check" loading={act.busy} onClick={confirmPending}>
                  {pending.kind === "conferir" ? "Confirmar conferência" : "Confirmar busca de fonte"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setPending(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {item.can_review ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {blockers.length > 0 && (
                <Banner tone="warning" title="Ainda não dá para aprovar">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </Banner>
              )}
              <Checkbox label="Conferi as fontes citadas" checked={sourcesChecked} onChange={(e) => setSourcesChecked(e.target.checked)} />
              <TextArea label="Observação (obrigatória para pedir ajustes ou recusar; peça também ao aprovar com revisão adversarial reprovada ou atualidade inconclusiva)" value={note} onChange={setNote} rows={2} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button size="sm" icon="stamp" loading={act.busy} disabled={blockers.length > 0 || !sourcesChecked} onClick={() => decide("approved", "Aprovação registrada.")}>
                  Aprovar
                </Button>
                <Button size="sm" variant="secondary" icon="pencil" loading={act.busy} disabled={!note.trim()} onClick={() => decide("needs_changes", "Ajustes pedidos.")}>
                  Pedir ajustes
                </Button>
                <Button size="sm" variant="secondary" icon="x" loading={act.busy} disabled={!note.trim()} onClick={() => decide("rejected", "Recusada.")}>
                  Recusar
                </Button>
              </div>
            </div>
          ) : (
            <p style={{ margin: "10px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>A decisão é de um revisor médico cadastrado em {AREA_LABEL[item.area] ?? item.area}.</p>
          )}
          {isAdmin && item.can_publish && <PublishBox item={item} onChanged={refresh} />}
          {act.feedback}
        </div>
      )}
    </div>
  );
}
