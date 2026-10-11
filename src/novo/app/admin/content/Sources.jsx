// Acervo de validação: fontes oficiais (documento completo), separado do material importado.
// Cada fonte tem órgão, versão, publicação, vigência, acesso, hash e situação; mudança gera
// versões candidatas, nunca substitui o que está publicado.
import React from "react";
import { Badge, Banner, Button, Checkbox, EmptyState, SelectField, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { useMobile } from "../../Shell.jsx";
import { LoadError, Loading, useLoad } from "../common.jsx";
import { hubAvailable, hubPost, hubUploadPdf } from "./api.js";
import { ComplementarMentions } from "./ComplementarMentions.jsx";
import { AUDIENCE, AUDIENCE_NOTE, AUTHORITY, DIFF_KIND, DOC_STATUS, FRESHNESS, SOURCE_KIND, SOURCE_STATUS, SOURCE_TYPE } from "./labels.js";
import { OfficialDomains } from "./OfficialDomains.jsx";
import { SourceCandidates } from "./SourceCandidates.jsx";
import { RecentSearches, SourceSearchPanel } from "./SourceSearch.jsx";
import { KeyValue, Label, Section, shortHash, StatusBadge, useAction, useUploadProgress, when } from "./ui.jsx";

// situação da última conferência do endereço vigiado (o banco guarda em inglês)
const WATCH_STATUS = { ok: "igual", changed: "mudou", unreachable: "não abriu" };

export function Sources({ isAdmin, go }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_sources"), [backend]);
  // classe de cada fonte (oficial ou complementar); se a lista falhar, ninguém é marcado como complementar na tela
  const classes = useLoad(() => backend.rpc("app_ch_source_audiences").catch(() => ({})), [backend]);
  const reloadAll = () => {
    reload();
    classes.reload();
  };
  const act = useAction();
  const [searchKey, setSearchKey] = React.useState(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner tone="info" icon="library">
        Prioridade para fontes oficiais (Ministério da Saúde, Conitec/PCDT/DDT, INCA, PNI, Anvisa) e para o edital/matriz da edição selecionada — não há lista fixa de manuais. Diretrizes de sociedades médicas só valem com aprovação editorial. Consulta pública e relatório preliminar não sustentam conduta.
      </Banner>
      {isAdmin && <SourceSearchPanel onRequested={() => setSearchKey((k) => k + 1)} />}
      {isAdmin && <RecentSearches reloadKey={searchKey} />}
      {isAdmin && <SourceCandidates onDecided={reload} />}
      {isAdmin && <OfficialDomains />}
      {isAdmin && <NewSource onSaved={reload} />}
      <Section
        title="Fontes cadastradas"
        action={
          isAdmin && hubAvailable(backend) ? (
            <Button size="sm" variant="secondary" icon="refresh-cw" loading={act.busy} onClick={() => act.run(async () => {
              const r = await hubPost(backend, "/sources/check");
              reload();
              return r;
            }, "Conferência das fontes monitoradas concluída.")}>
              Conferir fontes monitoradas
            </Button>
          ) : null
        }
      >
        {act.feedback}
        {error && <LoadError error={error} retry={reload} />}
        {!data && !error && <Loading />}
        {data?.length === 0 && <EmptyState icon="library" title="Nenhuma fonte cadastrada" description="Sem fontes, as afirmações ficam como 'insuficientemente sustentadas' e nada pode ser publicado." />}
        {(data ?? []).map((s) => (
          <SourceRow key={s.id} source={s} audience={classes.data?.[s.id] ?? "oficial"} isAdmin={isAdmin} onChanged={reloadAll} go={go} />
        ))}
      </Section>
      {isAdmin && <ComplementarMentions isAdmin />}
    </div>
  );
}

function NewSource({ onSaved }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const empty = { title: "", organ: "", kind: "final", authority_level: "", url: "", version: "", published_on: "", valid_until: "", accessed_on: new Date().toLocaleDateString("en-CA"), editorial_approved: false };
  const [form, setForm] = React.useState(empty);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const act = useAction();
  const [notice, setNotice] = React.useState(null);
  const save = () =>
    act.run(async () => {
      const r = await backend.rpc("app_ch_register_source", { p_source: form });
      if (form.authority_level) await backend.rpc("app_ch_set_source_authority", { p_source_id: r.id, p_level: form.authority_level });
      return r;
    }, "Fonte cadastrada. Envie o PDF completo para que ela possa ser citada.").then((r) => {
      if (!r) return;
      setNotice(r.superseded ? `Esta fonte substitui a versão anterior: ${r.candidate_versions} versão(ões) candidata(s) criada(s) para revisão. O que está publicado continua no ar, marcado "requer atualização".` : null);
      setForm(empty);
      onSaved();
    });
  const grid = { display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 12 };
  return (
    <Section title="Cadastrar fonte">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={grid}>
          <TextField label="Título do documento" value={form.title} onChange={(e) => set({ title: e.target.value })} />
          <TextField label="Órgão" value={form.organ} onChange={(e) => set({ organ: e.target.value })} placeholder="ex.: Ministério da Saúde" />
          <SelectField label="Nível de autoridade" hint="A–D valem como evidência para o aluno; E (apostila, curso) é fonte complementar: vale para a equipe e para a IA, e o aluno não a vê." value={form.authority_level} onChange={(e) => set({ authority_level: e.target.value })} options={[{ value: "", label: "Escolher…" }, ...Object.entries(AUTHORITY).map(([value, label]) => ({ value, label }))]} />
          <SelectField label="Tipo" value={form.kind} onChange={(e) => set({ kind: e.target.value })} options={Object.entries(SOURCE_KIND).map(([value, label]) => ({ value, label }))} />
          <TextField label="Versão" value={form.version} onChange={(e) => set({ version: e.target.value })} />
          <TextField label="Endereço oficial (https)" value={form.url} onChange={(e) => set({ url: e.target.value })} />
          <TextField label="Publicação" type="date" value={form.published_on} onChange={(e) => set({ published_on: e.target.value })} />
          <TextField label="Vigência até (se houver)" type="date" value={form.valid_until} onChange={(e) => set({ valid_until: e.target.value })} />
          <TextField label="Data de acesso" type="date" value={form.accessed_on} onChange={(e) => set({ accessed_on: e.target.value })} />
        </div>
        {form.kind === "society_guideline" && <Checkbox label="Aprovação editorial para uso como evidência" checked={form.editorial_approved} onChange={(e) => set({ editorial_approved: e.target.checked })} />}
        {act.feedback}
        {notice && <Banner tone="warning">{notice}</Banner>}
        <div>
          <Button icon="plus" disabled={!form.title.trim() || !form.organ.trim()} loading={act.busy} onClick={save}>
            Cadastrar
          </Button>
        </div>
      </div>
    </Section>
  );
}

function SourceRow({ source: s, audience = "oficial", isAdmin, onChanged }) {
  const { backend } = useSession();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState(null);
  const up = useUploadProgress();
  const [watchUrl, setWatchUrl] = React.useState(s.watch?.url ?? s.url ?? "");
  const [days, setDays] = React.useState(String(s.watch?.interval_days ?? 7));
  const [diffKey, setDiffKey] = React.useState(0);
  const act = useAction();
  return (
    <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "10px 0" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ all: "unset", cursor: "pointer", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
        <strong>{s.title}</strong>
        <span style={{ color: "var(--text-secondary)" }}>{s.organ}</span>
        {s.version && <Badge size="sm">versão {s.version}</Badge>}
        <Badge size="sm" tone={s.kind === "final" ? "neutral" : "warning"}>
          {SOURCE_KIND[s.kind]}
        </Badge>
        <StatusBadge map={SOURCE_STATUS} value={s.status} />
        {audience === "complementar" && <Badge size="sm" tone="warning" icon="eye-off">{AUDIENCE_NOTE}</Badge>}
        {s.found_by_search && <Badge size="sm" tone="ai">encontrada pela busca</Badge>}
        {s.found_by_search && s.document_status && (
          <>
            <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>leitura:</span>
            <StatusBadge map={DOC_STATUS} value={s.document_status} />
          </>
        )}
        {s.authority_level ? <Badge size="sm" tone={s.authority_level === "E" ? "warning" : "info"}>nível {s.authority_level}</Badge> : <Badge size="sm" tone="danger">sem nível: não vale como evidência</Badge>}
        <Badge size="sm" tone={s.passages ? "success" : "warning"}>
          {s.passages ? `${s.passages} trechos` : "sem documento completo"}
        </Badge>
        {s.status === "current" && <StatusBadge map={FRESHNESS} value={s.freshness} />}
        {s.update_in_progress && <Badge size="sm" tone="warning">em atualização pelo órgão</Badge>}
        {s.changes > 0 && <Badge size="sm" tone="danger">{s.changes} mudança(s) a analisar</Badge>}
        {s.diffs > 0 && <Badge size="sm" tone="info">{s.diffs} comparação(ões) de conteúdo</Badge>}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          <KeyValue
            items={[
              ["Endereço", s.url ? <a key="u" href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a> : null],
              ["Publicação", s.published_on],
              ["Vigência até", s.valid_until],
              ["Acesso", s.accessed_on],
              ["SHA-256", s.sha256 ? <code key="h">{shortHash(s.sha256)}</code> : null],
              ["Aprovação editorial", s.kind === "society_guideline" ? (s.editorial_approved ? "sim" : "não") : undefined],
              ["País", s.country],
              ["Vale para o SUS", s.applies_to_sus ? "sim" : "não"],
              ["Especialidade", s.specialty],
              ["Tema", s.theme],
              ["Natureza", s.source_type ? SOURCE_TYPE[s.source_type] : undefined],
              ["Autores", s.authors],
              ["Fonte primária", s.is_primary_source ? "sim" : undefined],
              ["Vigência a partir de", s.effective_date],
              ["Última revisão", s.revision_date],
              ["Monitoramento", s.watch ? `${s.watch.url} · a cada ${s.watch.interval_days} dia(s) · última conferência ${when(s.watch.last_checked_at)} (${WATCH_STATUS[s.watch.last_status] ?? s.watch.last_status ?? "—"}) · próxima ${when(s.watch.next_check_at)}` : "não"],
            ]}
          />
          {isAdmin && (
            <SelectField
              label="Classe da fonte"
              hint="Fonte complementar (apostilas) vale como fonte para a IA e para a equipe, mas o aluno não vê título, órgão, link, arquivo, página nem quantas são. Só a fonte oficial dá os selos do aluno."
              value={audience}
              onChange={(e) => e.target.value !== audience && act.run(() => backend.rpc("app_ch_set_source_audience", { p_source_id: s.id, p_audience: e.target.value }), e.target.value === "complementar" ? "Fonte marcada como complementar: o aluno não a vê." : "Fonte marcada como oficial.").then((r) => r && onChanged())}
              options={Object.entries(AUDIENCE).map(([value, label]) => ({ value, label }))}
            />
          )}
          {isAdmin && (
            <SelectField
              label="Nível de autoridade"
              value={s.authority_level ?? ""}
              onChange={(e) => e.target.value && act.run(() => backend.rpc("app_ch_set_source_authority", { p_source_id: s.id, p_level: e.target.value }), "Nível atualizado.").then((r) => r && onChanged())}
              options={[{ value: "", label: "Escolher…" }, ...Object.entries(AUTHORITY).map(([value, label]) => ({ value, label }))]}
            />
          )}
          {isAdmin && hubAvailable(backend) && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="PDF completo da fonte" />
              <Button size="sm" icon="upload" disabled={!file} loading={act.busy} onClick={() => act.run(() => up.track((opts) => hubUploadPdf(backend, `/sources/${s.id}/document`, file, {}, opts)), "PDF recebido: o documento completo será dividido em trechos citáveis com página.").then((r) => r && onChanged())}>
                Enviar PDF completo
              </Button>
              {up.bar}
            </div>
          )}
          {isAdmin && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <TextField label="Monitorar este endereço (https)" value={watchUrl} onChange={(e) => setWatchUrl(e.target.value)} />
              </div>
              <div style={{ width: 120 }}>
                <TextField label="A cada (dias)" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
              </div>
              <Button size="sm" variant="secondary" icon="eye" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_watch_source", { p_source_id: s.id, p_url: watchUrl, p_interval_days: Number(days) || 7 }), "Monitoramento salvo.").then((r) => r && onChanged())}>
                Monitorar
              </Button>
            </div>
          )}
          {isAdmin && s.changes > 0 && <ResolveChange source={s} onChanged={onChanged} />}
          {isAdmin && <Registry source={s} onChanged={onChanged} />}
          {isAdmin && s.status === "superseded" && s.superseded_by && hubAvailable(backend) && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Button
                size="sm"
                variant="secondary"
                icon="git-compare"
                disabled={!s.passages || !s.successor_passages}
                loading={act.busy}
                onClick={() => act.run(() => hubPost(backend, `/sources/${s.id}/compare/${s.superseded_by}`), "Comparação concluída: as questões afetadas foram triadas para o revisor médico.").then((r) => r && (setDiffKey((k) => k + 1), onChanged()))}
              >
                Comparar conteúdo com a versão nova
              </Button>
              {(!s.passages || !s.successor_passages) && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Para comparar, as duas versões precisam do PDF completo enviado.</span>}
            </div>
          )}
          {act.feedback}
          {s.diffs > 0 && <SourceDiffs sourceId={s.id} reloadKey={diffKey} />}
        </div>
      )}
    </div>
  );
}

/** Campos do registro da fonte: país, SUS, especialidade, tema, vigência, revisão e "em atualização". */
function Registry({ source: s, onChanged }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [f, setF] = React.useState({
    country: s.country ?? "BR",
    applies_to_sus: Boolean(s.applies_to_sus),
    specialty: s.specialty ?? "",
    theme: s.theme ?? "",
    effective_date: s.effective_date ?? "",
    revision_date: s.revision_date ?? "",
    update_in_progress: Boolean(s.update_in_progress),
    source_type: s.source_type ?? "",
    authors: s.authors ?? "",
    language: s.language ?? "pt",
    is_primary_source: Boolean(s.is_primary_source),
  });
  const set = (patch) => setF((v) => ({ ...v, ...patch }));
  const act = useAction();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Label>Registro da fonte</Label>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
        <TextField label="País (sigla)" value={f.country} onChange={(e) => set({ country: e.target.value.toUpperCase().slice(0, 2) })} />
        <TextField label="Especialidade" value={f.specialty} onChange={(e) => set({ specialty: e.target.value })} />
        <TextField label="Tema" value={f.theme} onChange={(e) => set({ theme: e.target.value })} />
        <SelectField label="Natureza da fonte" value={f.source_type} onChange={(e) => set({ source_type: e.target.value })} options={[{ value: "", label: "Não informada" }, ...Object.entries(SOURCE_TYPE).map(([value, label]) => ({ value, label }))]} />
        <TextField label="Autores" value={f.authors} onChange={(e) => set({ authors: e.target.value })} />
        <TextField label="Idioma" value={f.language} onChange={(e) => set({ language: e.target.value })} />
        <TextField label="Vigência a partir de" type="date" value={f.effective_date} onChange={(e) => set({ effective_date: e.target.value })} />
        <TextField label="Última revisão" type="date" value={f.revision_date} onChange={(e) => set({ revision_date: e.target.value })} />
      </div>
      <Checkbox label="Fonte primária (a origem da recomendação, não um resumo dela)" checked={f.is_primary_source} onChange={(e) => set({ is_primary_source: e.target.checked })} />
      <Checkbox label="Vale para o SUS" checked={f.applies_to_sus} onChange={(e) => set({ applies_to_sus: e.target.checked })} />
      <Checkbox label="Em atualização pelo órgão (a versão publicada continua valendo até sair a nova)" checked={f.update_in_progress} onChange={(e) => set({ update_in_progress: e.target.checked })} />
      {act.feedback}
      <div>
        <Button size="sm" variant="secondary" icon="save" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_set_source_registry", { p_source_id: s.id, p_fields: f }), "Registro atualizado.").then((r) => r && onChanged())}>
          Salvar registro
        </Button>
      </div>
    </div>
  );
}

/** A publicação mudou: a pessoa registra o que analisou. Isso não devolve validade a nenhuma evidência. */
function ResolveChange({ source: s, onChanged }) {
  const { backend } = useSession();
  const [note, setNote] = React.useState("");
  const act = useAction();
  return (
    <Banner tone="warning">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span>A publicação monitorada mudou. As evidências desta fonte ficaram desatualizadas e as questões ligadas a elas entraram na fila de revisão. Depois de analisar, registre o que foi feito.</span>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <TextField label="O que foi analisado" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button size="sm" variant="secondary" icon="check" disabled={note.trim().length < 10} loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_resolve_source_change", { p_source_id: s.id, p_note: note }), "Mudança registrada como analisada.").then((r) => r && onChanged())}>
            Marcar como analisada
          </Button>
        </div>
        {act.feedback}
      </div>
    </Banner>
  );
}

/** O que mudou no conteúdo entre duas versões (ou duas leituras) da fonte. Triagem automática, sem IA. */
function SourceDiffs({ sourceId, reloadKey }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_source_diffs", { p_source_id: sourceId }), [backend, sourceId, reloadKey]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Label>Comparações de conteúdo</Label>
      <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Comparação automática de texto (sem IA). Serve para ordenar a revisão médica; não decide qual é a conduta atual.</span>
      {data.map((d) => (
        <div key={d.id} style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <strong style={{ font: "var(--type-body-sm)" }}>{when(d.created_at)}</strong>
            <Badge size="sm">{d.origin === "version" ? "entre duas versões" : "entre duas leituras da página"}</Badge>
            {d.summary?.critical > 0 && <Badge size="sm" tone="danger">{d.summary.critical} trecho(s) crítico(s)</Badge>}
            {Object.entries(DIFF_KIND)
              .filter(([k]) => d.summary?.[k] > 0)
              .map(([k, [label, tone]]) => (
                <Badge key={k} size="sm" tone={tone}>
                  {d.summary[k]} · {label}
                </Badge>
              ))}
          </div>
          {d.items.length === 0 && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginTop: 4 }}>Nenhum trecho mudou.</div>}
          {d.items.map((it, i) => (
            <div key={i} style={{ marginTop: 8, paddingLeft: 12, borderLeft: `3px solid var(${it.critical ? "--danger-solid" : "--border-subtle"})` }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <StatusBadge map={DIFF_KIND} value={it.kind} />
                {it.critical && <Badge size="sm" tone="danger">crítico</Badge>}
                {it.section && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{it.section}</span>}
              </div>
              {it.old_text && (
                <div style={{ font: "var(--type-body-sm)", marginTop: 4 }}>
                  <span style={{ color: "var(--text-tertiary)" }}>Antes: </span>
                  {it.old_text}
                </div>
              )}
              {it.new_text && (
                <div style={{ font: "var(--type-body-sm)", marginTop: 4 }}>
                  <span style={{ color: "var(--text-tertiary)" }}>Agora: </span>
                  {it.new_text}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
