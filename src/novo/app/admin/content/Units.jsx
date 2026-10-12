// Unidades por tema: texto da aula (base revisada), materiais, revisão médica e editorial, publicação.
// Toda decisão é registrada no banco com revisor, data, versão e hash; editar invalida a aprovação.
import React from "react";
import { Badge, Banner, Button, Checkbox, EmptyState, SegmentedControl, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { ListRow, LoadError, Loading, TextArea, useLoad } from "../common.jsx";
import { hubAvailable, hubBlobUrl } from "./api.js";
import { AREA_LABEL, isMockModel, MATERIAL_KIND, UNIT_STATUS } from "./labels.js";
import { ClaimCard, Label, ModelBadge, Pre, Section, shortHash, StatusBadge, useAction, when } from "./ui.jsx";

const ORDER = ["awaiting_review", "needs_update", "draft", "approved", "published", "retired"];

export function Units(ctx) {
  const id = ctx.params.get("versao");
  if (id) return <UnitVersion id={id} {...ctx} />;
  return <UnitList {...ctx} />;
}

function UnitList({ go, reviewerAreas, isStaff }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_units"), [backend]);
  const [filter, setFilter] = React.useState(isStaff ? "all" : "mine");
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const latest = (u) => u.versions[0];
  const rows = data
    .filter((u) => filter !== "mine" || reviewerAreas.includes(u.area_code))
    .filter((u) => filter !== "review" || latest(u).status === "awaiting_review")
    .sort((a, b) => ORDER.indexOf(latest(a).status) - ORDER.indexOf(latest(b).status));
  return (
    <Section
      title="Unidades por tema"
      action={
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={[
            ...(isStaff ? [{ value: "all", label: "Todas" }] : []),
            { value: "review", label: "Aguardando revisão" },
            ...(reviewerAreas.length ? [{ value: "mine", label: "Minhas áreas" }] : []),
          ]}
        />
      }
    >
      {rows.length === 0 && <EmptyState icon="stamp" title="Nenhuma unidade aqui" description="As unidades nascem do processamento dos documentos (rascunho) ou são criadas pela equipe." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((u) => {
          const v = latest(u);
          return (
            <ListRow key={u.unit_id} onClick={() => go("unidades", { versao: v.id })} label={`Abrir ${u.title}`}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{u.title}</strong>
                  <StatusBadge map={UNIT_STATUS} value={v.status} />
                  <Badge size="sm">versão {v.version}</Badge>
                  {u.area_code && <Badge size="sm" tone="brand">{AREA_LABEL[u.area_code] ?? u.area_code}</Badge>}
                  <ModelBadge model={v.generated_by_model} />
                </div>
                {v.candidate_reason && <span style={{ font: "var(--type-body-sm)", color: "var(--warning-text)" }}>Candidata: {v.candidate_reason}</span>}
              </div>
            </ListRow>
          );
        })}
      </div>
    </Section>
  );
}

function UnitVersion({ id, go, isAdmin, isStaff, reviewerAreas }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_unit_version", { p_version_id: id }), [backend, id]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const v = data.version;
  const editable = isStaff && !["published", "retired", "needs_update"].includes(v.status);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Button variant="ghost" size="sm" icon="undo-2" onClick={() => go("unidades")}>
          Unidades
        </Button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, font: "var(--type-h3)" }}>{data.title}</h2>
        <StatusBadge map={UNIT_STATUS} value={v.status} size="md" />
        <Badge>versão {v.version}</Badge>
        {data.area_code && <Badge tone="brand">{AREA_LABEL[data.area_code] ?? data.area_code}</Badge>}
        <ModelBadge model={v.generated_by_model} />
      </div>
      {isMockModel(v.generated_by_model) && <Banner tone="danger" title="Simulação de desenvolvimento">Esta versão foi produzida pela simulação (não é IA nem revisão). Serve para testar o fluxo e não pode ser publicada.</Banner>}
      {v.candidate_reason && <Banner tone="warning" title="Versão candidata">{v.candidate_reason}</Banner>}
      {v.scope_note && <Banner tone="info" title="Escopo">{v.scope_note}</Banner>}
      <Problems problems={data.problems} />
      <ReviewFlags flags={v.review_flags} />
      <Decisions data={data} isAdmin={isAdmin} isStaff={isStaff} reviewerAreas={reviewerAreas} onChanged={reload} />
      <Editor key={v.content_hash} version={v} claims={data.claims} editable={editable} onSaved={reload} />
      <Materials data={data} canRegenerate={editable} onChanged={reload} />
      <Section title={`Afirmações e evidências (${data.claims.length})`}>
        {data.claims.map((c) => (
          <ClaimCard key={c.id} claim={c} onChanged={reload} canConfirm={isStaff || reviewerAreas.includes(data.area_code)} />
        ))}
      </Section>
      <Section title="Aprovações e publicações">
        {data.approvals.length === 0 && <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Nenhuma aprovação registrada.</p>}
        {data.approvals.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--border-subtle)", font: "var(--type-body-sm)" }}>
            <Badge size="sm" tone={a.valid ? "success" : "neutral"}>
              {a.kind === "medical" ? "Médica" : "Editorial"} · {a.valid ? "válida" : "invalidada"}
            </Badge>
            <span>{a.reviewer}</span>
            {a.area_code && <span>· {AREA_LABEL[a.area_code] ?? a.area_code}</span>}
            <span>· {when(a.decided_at)}</span>
            <code>· {shortHash(a.content_hash)}</code>
            {a.note && <span style={{ flexBasis: "100%", color: "var(--text-secondary)" }}>{a.note}</span>}
          </div>
        ))}
        {data.publications.map((p, i) => (
          <div key={`p${i}`} style={{ font: "var(--type-body-sm)", padding: "6px 0", borderTop: "1px solid var(--border-subtle)" }}>
            Publicada em {when(p.published_at)} <code>{shortHash(p.content_hash)}</code>
            {p.retired_at ? ` · retirada em ${when(p.retired_at)}` : " · no ar"}
          </div>
        ))}
      </Section>
    </div>
  );
}

function Problems({ problems }) {
  if (!problems?.length)
    return (
      <Banner tone="success" icon="badge-check">
        Nenhum bloqueio de publicação encontrado pelo banco para esta versão exata.
      </Banner>
    );
  return (
    <Banner tone="warning" icon="triangle-alert" title={`O que falta para publicar (${problems.length})`}>
      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {problems.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </Banner>
  );
}

function ReviewFlags({ flags }) {
  if (!flags?.length) return null;
  return (
    <Section title={`Apontamentos das conferências automáticas (${flags.length})`}>
      <p style={{ margin: "0 0 8px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>A revisão automática só aponta problemas; ela não aprova nada. Trechos removidos pela conferência aparecem aqui para decisão humana.</p>
      {flags.map((f, i) => (
        <div key={i} style={{ borderTop: "1px solid var(--border-subtle)", padding: "8px 0" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge size="sm" tone={f.severity === "critical" ? "danger" : f.severity === "major" ? "warning" : "neutral"}>
              {{ critical: "crítico", major: "importante", minor: "menor" }[f.severity] ?? f.severity}
            </Badge>
            <Badge size="sm" tone={f.by === "ai_review" ? "ai" : "neutral"}>{f.by === "ai_review" ? "revisão por IA" : "regra de software"}</Badge>
            <span style={{ font: "var(--type-caption)" }}>{f.where}</span>
          </div>
          <div style={{ font: "var(--type-body-sm)", marginTop: 4 }}>{f.detail}</div>
          {f.removed_text && (
            <>
              <Label>Trecho removido</Label>
              <Pre>{f.removed_text}</Pre>
            </>
          )}
        </div>
      ))}
    </Section>
  );
}

function Decisions({ data, isAdmin, isStaff, reviewerAreas, onChanged }) {
  const { backend } = useSession();
  const v = data.version;
  const [note, setNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  const act = useAction();
  const medicalReviewer = reviewerAreas.includes(data.area_code);
  const call = (fn, args, done) => act.run(() => backend.rpc(fn, args), done).then((r) => r !== undefined && onChanged());
  return (
    <Section title="Decisões">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(v.status === "awaiting_review" || v.status === "approved") && <TextArea label="Observação da aprovação (o que foi conferido)" value={note} onChange={setNote} rows={2} />}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isStaff && v.status === "draft" && (
            <Button icon="send" loading={act.busy} onClick={() => call("app_ch_submit_for_review", { p_version_id: v.id }, "Enviada para revisão.")}>
              Enviar para revisão
            </Button>
          )}
          {(v.status === "awaiting_review" || v.status === "approved") && (
            <>
              <Button icon="stamp" disabled={!medicalReviewer} loading={act.busy} onClick={() => call("app_ch_approve", { p_version_id: v.id, p_kind: "medical", p_note: note }, "Aprovação médica registrada.")}>
                Aprovar (revisão médica)
              </Button>
              <Button variant="secondary" icon="badge-check" disabled={!isStaff} loading={act.busy} onClick={() => call("app_ch_approve", { p_version_id: v.id, p_kind: "editorial", p_note: note }, "Aprovação editorial registrada.")}>
                Aprovar (editorial)
              </Button>
            </>
          )}
          {isAdmin && v.status === "approved" && (
            <Button icon="globe" disabled={data.problems.length > 0} loading={act.busy} onClick={() => call("app_ch_publish", { p_version_id: v.id }, "Publicada.")}>
              Publicar
            </Button>
          )}
        </div>
        {(v.status === "awaiting_review" || v.status === "approved") && !medicalReviewer && (
          <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>A aprovação médica é de um revisor cadastrado na área {AREA_LABEL[data.area_code] ?? data.area_code ?? "?"}.</span>
        )}
        {isAdmin && (v.status === "published" || v.status === "needs_update") && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <TextField label="Motivo da retirada" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button variant="secondary" icon="archive" disabled={!reason.trim()} loading={act.busy} onClick={() => call("app_ch_retire", { p_version_id: v.id, p_reason: reason }, "Retirada do ar.")}>
              Retirar
            </Button>
          </div>
        )}
        {act.feedback}
      </div>
    </Section>
  );
}

/** Editor da base revisada: seções e parágrafos; parágrafo clínico precisa citar afirmações. */
function Editor({ version, claims, editable, onSaved }) {
  const { backend } = useSession();
  const [sections, setSections] = React.useState(() => structuredClone(version.content.sections ?? []));
  const [dirty, setDirty] = React.useState(false);
  const act = useAction();
  const claimLabel = new Map(claims.map((c, i) => [c.id, `A${i + 1}`]));
  const update = (fn) => {
    setSections((s) => {
      const next = structuredClone(s);
      fn(next);
      return next;
    });
    setDirty(true);
  };
  return (
    <Section
      title="Texto da unidade (base revisada)"
      action={
        editable && dirty ? (
          <Button size="sm" icon="check" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_save_unit_version", { p_version_id: version.id, p_content: { ...version.content, sections } }), "Texto salvo. As aprovações desta versão deixaram de valer.").then((r) => r && (setDirty(false), onSaved()))}>
            Salvar texto
          </Button>
        ) : null
      }
    >
      {editable && <p style={{ margin: "0 0 10px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Salvar invalida as aprovações e exige gerar os materiais de novo. Informação clínica nova precisa de afirmação com evidência.</p>}
      {act.feedback}
      {sections.map((s, si) => (
        <div key={si} style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10, marginTop: 10 }}>
          {editable ? <TextField label="Seção" value={s.heading ?? ""} onChange={(e) => update((x) => (x[si].heading = e.target.value))} /> : <h4 style={{ margin: "0 0 6px", font: "var(--type-h4)", color: "var(--text-brand)" }}>{s.heading}</h4>}
          {(s.paragraphs ?? []).map((p, pi) => (
            <div key={pi} style={{ margin: "8px 0", paddingLeft: 10, borderLeft: `3px solid ${p.clinical ? "var(--border-brand)" : "var(--border-default)"}` }}>
              {editable ? <TextArea value={p.text} onChange={(t) => update((x) => (x[si].paragraphs[pi].text = t))} rows={3} /> : <p style={{ margin: 0 }}>{p.text}</p>}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                {editable ? (
                  <Checkbox label="Conteúdo clínico" checked={Boolean(p.clinical)} onChange={(e) => update((x) => (x[si].paragraphs[pi].clinical = e.target.checked))} />
                ) : (
                  p.clinical && <Badge size="sm" tone="brand">clínico</Badge>
                )}
                {claims.map((c) => {
                  const on = (p.claim_ids ?? []).includes(c.id);
                  if (!editable && !on) return null;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      title={c.statement}
                      disabled={!editable}
                      className={`sm-badge sm-badge--sm`}
                      style={{ cursor: editable ? "pointer" : "default", background: on ? "var(--selected-bg)" : "var(--surface-sunken)", color: on ? "var(--selected-text)" : "var(--text-tertiary)", borderColor: on ? "var(--selected-border)" : "transparent" }}
                      onClick={() =>
                        update((x) => {
                          const ids = new Set(x[si].paragraphs[pi].claim_ids ?? []);
                          on ? ids.delete(c.id) : ids.add(c.id);
                          x[si].paragraphs[pi].claim_ids = [...ids];
                        })
                      }
                    >
                      {claimLabel.get(c.id)}
                    </button>
                  );
                })}
                {editable && (
                  <Button size="sm" variant="ghost" icon="x" onClick={() => update((x) => x[si].paragraphs.splice(pi, 1))}>
                    Remover
                  </Button>
                )}
              </div>
            </div>
          ))}
          {editable && (
            <Button size="sm" variant="ghost" icon="plus" onClick={() => update((x) => (x[si].paragraphs = [...(x[si].paragraphs ?? []), { text: "", clinical: false, claim_ids: [] }]))}>
              Parágrafo
            </Button>
          )}
        </div>
      ))}
      {editable && (
        <div style={{ marginTop: 10 }}>
          <Button size="sm" variant="secondary" icon="plus" onClick={() => update((x) => x.push({ heading: "Nova seção", paragraphs: [] }))}>
            Seção
          </Button>
        </div>
      )}
      {claims.length > 0 && (
        <div style={{ marginTop: 12, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
          {claims.map((c, i) => (
            <div key={c.id}>
              A{i + 1}: {c.statement.slice(0, 140)}
              {c.statement.length > 140 ? "…" : ""}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Materials({ data, canRegenerate, onChanged }) {
  const { backend } = useSession();
  const [kind, setKind] = React.useState(data.materials[0]?.kind ?? null);
  const act = useAction();
  const m = data.materials.find((x) => x.kind === kind);
  const open = (r) => act.run(async () => window.open(await hubBlobUrl(backend, `/renders/${r.id}`), "_blank", "noopener"), null);
  return (
    <Section
      title="Materiais"
      action={
        canRegenerate && (
          <Button size="sm" variant="secondary" icon="refresh-cw" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_regenerate", { p_version_id: data.version.id }), "Materiais e arquivos finais entraram na fila.").then((r) => r && onChanged())}>
            Gerar materiais de novo
          </Button>
        )
      }
    >
      {act.feedback}
      {data.materials.length === 0 && <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Nenhum material gerado.</p>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {data.materials.map((x) => (
          <button key={x.kind} type="button" className={`sm-chip${x.kind === kind ? " is-selected" : ""}`} aria-pressed={x.kind === kind} onClick={() => setKind(x.kind)}>
            {MATERIAL_KIND[x.kind] ?? x.kind}
          </button>
        ))}
      </div>
      {m && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <ModelBadge model={m.generated_by_model} />
            {!m.generated_by_model && <Badge size="sm">montado por software</Badge>}
            {(m.renders ?? []).map((r) => (
              <Button key={r.id} size="sm" variant="secondary" icon="external-link" disabled={!hubAvailable(backend)} onClick={() => open(r)}>
                {r.format.toUpperCase()} {r.current ? "" : "(versão anterior)"} {r.check?.ok ? "✓ conferido" : "✗ reprovado"}
              </Button>
            ))}
          </div>
          {(m.renders ?? [])
            .filter((r) => r.current && r.check && !r.check.ok)
            .map((r) => (
              <Banner key={r.id} tone="danger" title={`Arquivo ${r.format.toUpperCase()} reprovado na conferência`}>
                {[r.check.reason, r.check.missing_texts?.length && `Texto ausente: ${r.check.missing_texts.join(" | ")}`, r.check.missing_references?.length && `Referência ausente: ${r.check.missing_references.join(" | ")}`, r.check.cut_cards?.length && `Cards com texto cortado: ${r.check.cut_cards.join(", ")}`, r.check.empty_pages?.length && `Páginas vazias: ${r.check.empty_pages.join(", ")}`, r.check.no_references && "Aula sem referências."]
                  .filter(Boolean)
                  .join(" · ")}
              </Banner>
            ))}
          <MaterialPreview kind={m.kind} content={m.content} />
        </div>
      )}
    </Section>
  );
}

function MaterialPreview({ kind, content }) {
  if (kind === "lesson")
    return (
      <div>
        {(content.sections ?? []).map((s, i) => (
          <div key={i}>
            <h4 style={{ margin: "10px 0 4px", font: "var(--type-h4)", color: "var(--text-brand)" }}>{s.heading}</h4>
            {(s.paragraphs ?? []).map((p, j) => (
              <p key={j} style={{ margin: "0 0 6px" }}>
                {p.text}
              </p>
            ))}
          </div>
        ))}
        <Label>Referências</Label>
        <ol style={{ margin: 0, paddingLeft: 18, font: "var(--type-body-sm)" }}>
          {(content.references ?? []).map((r, i) => (
            <li key={i}>
              {r.source} · {r.organ}
              {r.version ? ` · versão ${r.version}` : ""}
              {r.page != null ? ` · p. ${r.page}` : ""}
              {r.simulated ? " (simulação)" : ""}
            </li>
          ))}
        </ol>
      </div>
    );
  if (kind === "summary" || kind === "visual_cards")
    return (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {(content.items ?? content.cards ?? []).map((it, i) => (
          <li key={i}>{it.text}</li>
        ))}
      </ul>
    );
  if (kind === "flashcards")
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(content.cards ?? []).map((c, i) => (
          <div key={i} style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", padding: 8 }}>
            <strong>{c.front}</strong>
            <div style={{ color: "var(--text-secondary)" }}>{c.back}</div>
          </div>
        ))}
      </div>
    );
  if (kind === "questions")
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(content.items ?? []).map((q, i) => (
          <div key={i}>
            <Badge size="sm" tone="brand">
              {q.label ?? "Questão StaziaMed"}
            </Badge>
            <p style={{ margin: "6px 0" }}>{q.stem}</p>
            {q.options.map((o) => (
              <div key={o.id} style={{ font: "var(--type-body-sm)", fontWeight: o.id === q.correct ? 700 : 400 }}>
                {o.id}) {o.text}
                <div style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>{q.comments.find((c) => c.id === o.id)?.text}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  return <Pre>{JSON.stringify(content, null, 2)}</Pre>;
}
