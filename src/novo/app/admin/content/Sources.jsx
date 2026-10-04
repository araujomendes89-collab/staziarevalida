// Acervo de validação: fontes oficiais (documento completo), separado do material importado.
// Cada fonte tem órgão, versão, publicação, vigência, acesso, hash e situação; mudança gera
// versões candidatas, nunca substitui o que está publicado.
import React from "react";
import { Badge, Banner, Button, Checkbox, EmptyState, SelectField, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { useMobile } from "../../Shell.jsx";
import { LoadError, Loading, useLoad } from "../common.jsx";
import { hubAvailable, hubPost, hubUploadPdf } from "./api.js";
import { SOURCE_KIND, SOURCE_STATUS } from "./labels.js";
import { KeyValue, Section, shortHash, StatusBadge, useAction, when } from "./ui.jsx";

export function Sources({ isAdmin, go }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_sources"), [backend]);
  const act = useAction();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner tone="info" icon="library">
        Prioridade para fontes oficiais (Ministério da Saúde, Conitec/PCDT/DDT, INCA, PNI, Anvisa) e para o edital/matriz da edição selecionada — não há lista fixa de manuais. Diretrizes de sociedades médicas só valem com aprovação editorial. Consulta pública e relatório preliminar não sustentam conduta.
      </Banner>
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
          <SourceRow key={s.id} source={s} isAdmin={isAdmin} onChanged={reload} go={go} />
        ))}
      </Section>
    </div>
  );
}

function NewSource({ onSaved }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const empty = { title: "", organ: "", kind: "final", url: "", version: "", published_on: "", valid_until: "", accessed_on: new Date().toLocaleDateString("en-CA"), editorial_approved: false };
  const [form, setForm] = React.useState(empty);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const act = useAction();
  const [notice, setNotice] = React.useState(null);
  const save = () =>
    act.run(() => backend.rpc("app_ch_register_source", { p_source: form }), "Fonte cadastrada. Envie o PDF completo para que ela possa ser citada.").then((r) => {
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

function SourceRow({ source: s, isAdmin, onChanged }) {
  const { backend } = useSession();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState(null);
  const [watchUrl, setWatchUrl] = React.useState(s.watch?.url ?? s.url ?? "");
  const [days, setDays] = React.useState(String(s.watch?.interval_days ?? 7));
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
        <Badge size="sm" tone={s.passages ? "success" : "warning"}>
          {s.passages ? `${s.passages} trechos` : "sem documento completo"}
        </Badge>
        {s.watch && <Badge size="sm" tone="info">monitorada</Badge>}
        {s.changes > 0 && <Badge size="sm" tone="danger">{s.changes} mudança(s) a analisar</Badge>}
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
              ["Monitoramento", s.watch ? `${s.watch.url} · a cada ${s.watch.interval_days} dia(s) · última conferência ${when(s.watch.last_checked_at)} (${s.watch.last_status ?? "—"}) · próxima ${when(s.watch.next_check_at)}` : "não"],
            ]}
          />
          {isAdmin && hubAvailable(backend) && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="PDF completo da fonte" />
              <Button size="sm" icon="upload" disabled={!file} loading={act.busy} onClick={() => act.run(() => hubUploadPdf(backend, `/sources/${s.id}/document`, file), "PDF recebido: o documento completo será dividido em trechos citáveis com página.").then((r) => r && onChanged())}>
                Enviar PDF completo
              </Button>
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
          {act.feedback}
        </div>
      )}
    </div>
  );
}
