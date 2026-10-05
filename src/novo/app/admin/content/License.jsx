// Licença de adaptação e retirada das referências do licenciante.
// A licença é um registro (texto, prazo, o que autoriza). Só com ela autorizando a retirada o sistema tira as referências,
// com prévia, registro de cada remoção e desfazer. O texto extraído original nunca é alterado.
import React from "react";
import { Badge, Banner, Button, Checkbox, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, TextArea, useLoad } from "../common.jsx";
import { hubAvailable, hubPost } from "./api.js";
import { Label, Pre, Section, useAction, when } from "./ui.jsx";

const empty = {
  licensor: "", work_title: "", granted_on: "", expires_on: "", authorization_reference: "", terms_text: "", reference_terms: "",
  allows_visual_redesign: false, allows_attribution_removal: false, allows_commercial_use: false,
};

export function LicensePanel({ doc, isAdmin, onChanged }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_licenses", { p_document_id: doc.id }), [backend, doc.id, doc.rights_status]);
  const [form, setForm] = React.useState({ ...empty, work_title: doc.name ?? "" });
  const [reason, setReason] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const act = useAction();
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const active = data.find((l) => l.status === "active");
  const save = () =>
    act
      .run(
        () =>
          backend.rpc("app_ch_register_license", {
            p_document_id: doc.id,
            p_license: { ...form, expires_on: form.expires_on || null, allows_adaptation: true, reference_terms: form.reference_terms.split(/\n|;/).map((t) => t.trim()).filter(Boolean) },
          }),
        "Licença registrada. O documento passa a ser adaptação licenciada."
      )
      .then((r) => r && (setOpen(false), reload(), onChanged()));
  return (
    <Section title="Licença de adaptação">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {!active && <Banner tone="info">Sem licença registrada. Registre a licença (com o texto dela) para tratar este material como adaptação licenciada.</Banner>}
        {active && (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <strong>{active.licensor}</strong>
              <span style={{ color: "var(--text-secondary)" }}>{active.work_title}</span>
              <Badge size="sm" tone={active.expired ? "danger" : "success"}>{active.expired ? "vencida" : "ativa"}</Badge>
              <Badge size="sm">concedida em {new Date(active.granted_on + "T12:00:00").toLocaleDateString("pt-BR")}</Badge>
              {active.expires_on && <Badge size="sm">vale até {new Date(active.expires_on + "T12:00:00").toLocaleDateString("pt-BR")}</Badge>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Badge size="sm" tone="success">adaptar</Badge>
              <Badge size="sm" tone={active.allows_visual_redesign ? "success" : "neutral"}>{active.allows_visual_redesign ? "nova roupagem visual" : "sem nova roupagem"}</Badge>
              <Badge size="sm" tone={active.allows_attribution_removal ? "success" : "neutral"}>{active.allows_attribution_removal ? "retirar referências do licenciante" : "mantém referências do licenciante"}</Badge>
              <Badge size="sm" tone={active.allows_commercial_use ? "success" : "neutral"}>{active.allows_commercial_use ? "uso comercial" : "sem uso comercial"}</Badge>
            </div>
            <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Documento assinado: {active.authorization_reference}</div>
            <details>
              <summary style={{ cursor: "pointer", font: "var(--type-body-sm)" }}>Texto da licença registrado</summary>
              <Pre>{active.terms_text}</Pre>
            </details>
            {active.expired && <Banner tone="danger">Licença vencida: o material volta a ser tratado como criação independente e adaptações não podem ser publicadas.</Banner>}
          </div>
        )}
        {isAdmin && !open && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" variant="secondary" icon="file-text" onClick={() => setOpen(true)}>{active ? "Registrar nova licença" : "Registrar licença"}</Button>
            {active && (
              <>
                <TextField label="Motivo para revogar" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button size="sm" variant="ghost" icon="x" disabled={reason.trim().length < 10} loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_revoke_license", { p_license_id: active.id, p_reason: reason }), "Licença revogada.").then((r) => r && (setReason(""), reload(), onChanged()))}>
                  Revogar
                </Button>
              </>
            )}
          </div>
        )}
        {isAdmin && open && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <TextField label="Quem concedeu (licenciante)" value={form.licensor} onChange={(e) => set({ licensor: e.target.value })} />
            <TextField label="Obra licenciada" value={form.work_title} onChange={(e) => set({ work_title: e.target.value })} />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <TextField label="Concedida em" type="date" value={form.granted_on} onChange={(e) => set({ granted_on: e.target.value })} />
              <TextField label="Vale até (se houver)" type="date" value={form.expires_on} onChange={(e) => set({ expires_on: e.target.value })} />
            </div>
            <TextField label="Onde está o documento assinado" value={form.authorization_reference} onChange={(e) => set({ authorization_reference: e.target.value })} />
            <TextArea label="Texto da licença, como foi recebido (cole aqui)" value={form.terms_text} onChange={(v) => set({ terms_text: v })} rows={6} />
            <Checkbox label="A licença autoriza nova roupagem visual (identidade StaziaMed)" checked={form.allows_visual_redesign} onChange={(e) => set({ allows_visual_redesign: e.target.checked })} />
            <Checkbox label="A licença autoriza uso comercial" checked={form.allows_commercial_use} onChange={(e) => set({ allows_commercial_use: e.target.checked })} />
            <Checkbox label="A licença autoriza retirar as referências do licenciante (nome, marca, contatos)" checked={form.allows_attribution_removal} onChange={(e) => set({ allows_attribution_removal: e.target.checked })} />
            {form.allows_attribution_removal && (
              <TextArea label="O que identifica o licenciante no material (um por linha: nome, marca, @, site, autores)" value={form.reference_terms} onChange={(v) => set({ reference_terms: v })} rows={4} />
            )}
            <Banner tone="warning">Marque só o que o texto da licença realmente autoriza. O sistema não interpreta o contrato: ele confia no que você registrar, e tudo fica na auditoria.</Banner>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" icon="check" disabled={!form.licensor.trim() || !form.work_title.trim() || !form.granted_on || form.authorization_reference.trim().length < 5 || form.terms_text.trim().length < 40 || (form.allows_attribution_removal && !form.reference_terms.trim())} loading={act.busy} onClick={save}>
                Registrar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            </div>
          </div>
        )}
        {act.feedback}
        {active?.allows_attribution_removal && !active.expired && hubAvailable(backend) && isAdmin && <Cleanup doc={doc} license={active} onChanged={() => (reload(), onChanged())} />}
      </div>
    </Section>
  );
}

/** Prévia → aplicar → desfazer. A prévia nunca grava. */
function Cleanup({ doc, license, onChanged }) {
  const { backend } = useSession();
  const [preview, setPreview] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const act = useAction();
  const run = (action, done) => act.run(() => hubPost(backend, `/documents/${doc.id}/clean-references`, { action }), done);
  return (
    <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <Label>Retirar as referências de {license.licensor}</Label>
      <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Procura: {license.reference_terms.join(", ")}. Só isso: links oficiais e fontes clínicas ficam. O texto extraído original não muda; o resultado vai para o texto revisado.</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button size="sm" variant="secondary" icon="eye" loading={act.busy} onClick={() => run("preview", "").then((r) => r && (setPreview(r), setResult(null)))}>Ver prévia</Button>
        {preview && preview.total > 0 && (
          <Button size="sm" icon="eraser" loading={act.busy} onClick={() => run("apply", "Referências retiradas.").then((r) => r && (setResult(r), setPreview(null), onChanged()))}>
            Aplicar ({preview.edited} editado(s), {preview.excluded} excluído(s))
          </Button>
        )}
        <Button size="sm" variant="ghost" icon="undo-2" loading={act.busy} onClick={() => run("undo", "Retirada desfeita onde ninguém revisou depois.").then((r) => r && (setResult(r), setPreview(null), onChanged()))}>Desfazer</Button>
      </div>
      {act.feedback}
      {result && <Banner tone="success">{"edited" in result ? `${result.edited} editado(s), ${result.excluded} excluído(s), ${result.skipped} ignorado(s) por terem mudado.` : `${result.undone} restaurado(s); ${result.skipped} preservado(s) por terem sido revisados depois.`}</Banner>}
      {preview && preview.total === 0 && <Banner tone="info">Nenhuma referência encontrada.</Banner>}
      {preview?.changes.map((c) => (
        <div key={c.block_id} style={{ borderLeft: "3px solid var(--border-subtle)", paddingLeft: 10 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Badge size="sm" tone={c.exclude ? "warning" : "info"}>{c.exclude ? "bloco excluído" : "editado"}</Badge>
            <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>p. {c.page} · tira: {c.removed.join(" · ")}</span>
          </div>
          <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Antes: {c.before}</div>
          {!c.exclude && <div style={{ font: "var(--type-body-sm)" }}>Depois: {c.after}</div>}
        </div>
      ))}
      {preview && preview.total > preview.shown && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Mostrando {preview.shown} de {preview.total}.</span>}
    </div>
  );
}
