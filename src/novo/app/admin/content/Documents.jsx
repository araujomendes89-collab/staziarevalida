// Documentos: envio de PDF, andamento das etapas e abertura do detalhe.
import React from "react";
import { Badge, Banner, Button, EmptyState, SelectField, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { useMobile } from "../../Shell.jsx";
import { ListRow, LoadError, Loading, TextArea, useLoad } from "../common.jsx";
import { hubAvailable, hubUploadPdf } from "./api.js";
import { DocumentDetail } from "./DocumentDetail.jsx";
import { DOC_STATUS, JOB_STATUS, RIGHTS, STEP_LABEL, pick } from "./labels.js";
import { Section, StatusBadge, useAction, useUploadProgress, when } from "./ui.jsx";

const BUSY = new Set(["received", "extracting", "classifying", "verifying_sources", "drafting"]);

export function Documents(ctx) {
  const id = ctx.params.get("id");
  if (id) return <DocumentDetail id={id} {...ctx} />;
  return <DocumentList {...ctx} />;
}

function DocumentList({ go }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_documents"), [backend]);
  const processing = (data ?? []).some((d) => BUSY.has(d.status) && !d.failure);
  React.useEffect(() => {
    if (!processing) return undefined;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {hubAvailable(backend) && <UploadCard onUploaded={(r) => (reload(), go("documentos", { id: r.id }))} />}
      <Section title="Documentos importados">
        {error && <LoadError error={error} retry={reload} />}
        {!data && !error && <Loading />}
        {data?.length === 0 && <EmptyState icon="file-up" title="Nenhum documento ainda" description="Envie um PDF para começar. O arquivo original é preservado e nunca é alterado." />}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(data ?? []).map((d) => (
            <ListRow key={d.id} onClick={() => go("documentos", { id: d.id })} label={`Abrir ${d.name}`}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ overflowWrap: "anywhere" }}>{d.name}</strong>
                  <StatusBadge map={DOC_STATUS} value={d.status} />
                  {d.text_kind && <Badge size="sm">{{ text: "PDF com texto", scanned: "Digitalizado", mixed: "Misto" }[d.text_kind]}</Badge>}
                  {d.page_count && <Badge size="sm">{d.page_count} p.</Badge>}
                  <Badge size="sm" tone={d.rights_status === "unauthorized" ? "danger" : d.rights_status === "unknown" ? "warning" : "neutral"}>
                    {RIGHTS[d.rights_status]}
                  </Badge>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(d.jobs ?? []).map((j, i) => {
                    const [, tone] = pick(JOB_STATUS, j.status);
                    return (
                      <Badge key={i} size="sm" tone={tone}>
                        {STEP_LABEL[j.step] ?? j.step}: {pick(JOB_STATUS, j.status)[0]}
                      </Badge>
                    );
                  })}
                </div>
                {d.failure && <span style={{ font: "var(--type-body-sm)", color: d.failure.startsWith("Pendência") ? "var(--warning-text)" : "var(--danger-text)" }}>{d.failure}</span>}
                <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Enviado em {when(d.created_at)}</span>
              </div>
            </ListRow>
          ))}
        </div>
      </Section>
    </div>
  );
}

function UploadCard({ onUploaded }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [file, setFile] = React.useState(null);
  const [meta, setMeta] = React.useState({ author: "", publisher: "", edition_date: "", language: "pt-BR", rights_status: "unknown", rights_note: "", source_note: "" });
  const set = (patch) => setMeta((m) => ({ ...m, ...patch }));
  const act = useAction();
  const up = useUploadProgress();
  const needsNote = meta.rights_status === "own" || meta.rights_status === "licensed_adaptation";
  const submit = async () => {
    const r = await act.run(() => up.track((opts) => hubUploadPdf(backend, "/documents", file, meta, opts)), "Arquivo recebido. O processamento começou.");
    if (r) {
      // arquivo repetido (mesmo hash): abre o documento que já existe, sem duplicar
      setFile(null);
      onUploaded(r);
    }
  };
  const grid = { display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 12 };
  return (
    <Section title="Importar PDF">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="sm-field">
          <label className="sm-field__label" htmlFor="ch-file">
            Arquivo PDF
          </label>
          <input id="ch-file" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="sm-field__hint">A área é identificada pelo conteúdo, não pelo nome do arquivo. O original fica guardado com o hash (SHA-256).</span>
        </div>
        <div style={grid}>
          <TextField label="Autor" value={meta.author} onChange={(e) => set({ author: e.target.value })} />
          <TextField label="Editora / plataforma" value={meta.publisher} onChange={(e) => set({ publisher: e.target.value })} />
          <TextField label="Data ou edição" value={meta.edition_date} onChange={(e) => set({ edition_date: e.target.value })} placeholder="ex.: 3ª ed., 2025" />
          <SelectField label="Idioma" value={meta.language} onChange={(e) => set({ language: e.target.value })} options={[{ value: "pt-BR", label: "Português" }, { value: "es", label: "Espanhol" }, { value: "en", label: "Inglês" }]} />
          <SelectField label="Direitos de uso" value={meta.rights_status} onChange={(e) => set({ rights_status: e.target.value })} options={Object.entries(RIGHTS).map(([value, label]) => ({ value, label }))} />
          <TextField label="Procedência (onde foi obtido)" value={meta.source_note} onChange={(e) => set({ source_note: e.target.value })} />
        </div>
        {(needsNote || meta.rights_status !== "unknown") && (
          <TextArea label={needsNote ? "Licença ou autorização (obrigatório)" : "Observação sobre os direitos"} value={meta.rights_note} onChange={(v) => set({ rights_note: v })} rows={2} />
        )}
        <Banner tone="info" icon="scale">
          Compra, download ou acesso público não significam licença. Sem autorização, o material só serve de base para criação independente: o texto não é copiado e a marca de outra plataforma não é trocada.
        </Banner>
        {up.bar}
        {act.feedback}
        <div>
          <Button icon="upload" disabled={!file || (needsNote && !meta.rights_note.trim())} loading={act.busy} onClick={submit}>
            Enviar e processar
          </Button>
        </div>
      </div>
    </Section>
  );
}
