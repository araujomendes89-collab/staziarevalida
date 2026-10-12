// Publicar, republicar e recolher (só o administrador). A prévia mostra a questão como o aluno vai ver, com o selo de que não é oficial.
import React from "react";
import { Badge, Banner, Button } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { TextArea } from "../../common.jsx";
import { Pre, useAction } from "../ui.jsx";

export function PublishBox({ item, onChanged }) {
  const { backend } = useSession();
  const act = useAction();
  const [preview, setPreview] = React.useState(null);
  const [reason, setReason] = React.useState("");
  const [retiring, setRetiring] = React.useState(false);
  const q = item.question;
  const live = Boolean(q) && !q.retired_at;
  const versionPublished = Boolean(q) && item.published_hash === item.content_hash;
  const canPublish = item.status === "approved" && !(live && versionPublished);
  const label = q ? "Republicar" : "Publicar";
  const open = () => act.run(async () => setPreview(await backend.rpc("app_staziamed_preview", { p_id: item.id })), "");
  const publish = () =>
    act.run(() => backend.rpc("app_staziamed_publish", { p_id: item.id, p_hash: item.content_hash }), "").then((r) => {
      if (r) {
        setPreview(null);
        onChanged();
      }
    });
  const retire = () =>
    act.run(() => backend.rpc("app_staziamed_retire", { p_id: item.id, p_reason: reason }), "").then((r) => {
      if (r) {
        setRetiring(false);
        setReason("");
        onChanged();
      }
    });
  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
      <strong style={{ font: "var(--type-body-sm)" }}>Publicação (administrador)</strong>
      {q && (
        <p style={{ margin: "4px 0", font: "var(--type-body-sm)" }}>
          {q.code} · nº {q.number} · {q.retired_at ? "recolhida" : "no ar para os alunos com acesso"}
        </p>
      )}
      {!canPublish && !live && item.status !== "approved" && <p style={{ margin: "4px 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Só a versão aprovada pelo revisor médico pode ser publicada.</p>}
      {live && versionPublished && <p style={{ margin: "4px 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Esta versão já está publicada.</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        {canPublish && !preview && (
          <Button size="sm" icon="upload" loading={act.busy} onClick={open}>
            {label}
          </Button>
        )}
        {live && !retiring && (
          <Button size="sm" variant="secondary" icon="archive" onClick={() => setRetiring(true)}>
            Recolher
          </Button>
        )}
      </div>
      {preview && (
        <div style={{ marginTop: 10, border: "1px dashed var(--border-default)", borderRadius: "var(--radius-md)", padding: 12 }} aria-label="Prévia como o aluno vê">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <Badge size="sm" tone="brand">Questão StaziaMed · nº {preview.number}</Badge>
            <Badge size="sm" tone="warning">não é questão oficial do Inep</Badge>
            <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{preview.code}</span>
          </div>
          <Pre>{preview.statement}</Pre>
          {preview.support?.rows?.length > 0 && (
            <table style={{ borderCollapse: "collapse", font: "var(--type-body-sm)", width: "100%", marginTop: 6 }} aria-label={preview.support.title ?? "Dados de apoio"}>
              <tbody>
                {preview.support.rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "4px 8px", color: "var(--text-secondary)" }}>{r.label}</td>
                    <td style={{ padding: "4px 8px", fontWeight: 600 }}>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview.options.map((o) => (
            <div key={o.id} style={{ margin: "6px 0" }}>
              {o.id}) {o.text}
            </div>
          ))}
          <p style={{ margin: "6px 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Gabarito StaziaMed: alternativa {preview.correct_option}.</p>
          {preview.blockers?.length > 0 && (
            <Banner tone="danger" title="Não dá para publicar ainda">
              {preview.blockers.join(" · ")}
            </Banner>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button size="sm" icon="check" loading={act.busy} disabled={preview.blockers?.length > 0} onClick={publish}>
              Confirmar {label.toLowerCase()}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPreview(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {retiring && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <TextArea label="Motivo para recolher (fica na trilha)" value={reason} onChange={setReason} rows={2} />
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" variant="secondary" icon="archive" loading={act.busy} disabled={!reason.trim()} onClick={retire}>
              Confirmar recolhimento
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRetiring(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {act.error && <Banner tone="danger">{act.error}</Banner>}
    </div>
  );
}
