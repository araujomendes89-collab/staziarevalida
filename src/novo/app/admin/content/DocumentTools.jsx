// Ferramentas do administrador na tela de um documento: estimativa de custo da IA (CC05) e "Tirar marcas de terceiros" (CC09).
import React from "react";
import { Badge, Banner, Button } from "../../../ds";
import { useSession } from "../../session.jsx";
import { TextArea } from "../common.jsx";
import { usd } from "../ai/aiApi.js";
import { hubGet, hubPost } from "./api.js";
import { Label, Pre, Section, useAction } from "./ui.jsx";

const cell = { padding: "6px 8px", borderBottom: "1px solid var(--border-subtle)", textAlign: "left", verticalAlign: "top" };

/** Quanto a IA pode custar para processar este documento, no pior caso (a conta é a mesma dos tetos de gasto). Não chama IA. */
export function CostEstimate({ id }) {
  const { backend } = useSession();
  const [data, setData] = React.useState(null);
  const act = useAction();
  const calculate = async () => {
    const r = await act.run(() => hubGet(backend, `/documents/${id}/cost-estimate`), "Estimativa calculada.");
    if (r) setData(r);
  };
  return (
    <Section
      title="Estimativa de custo da IA"
      action={
        <Button size="sm" variant="secondary" icon="calculator" loading={act.busy} onClick={calculate}>
          {data ? "Calcular de novo" : "Calcular estimativa"}
        </Button>
      }
    >
      <p style={{ margin: "0 0 8px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        Mostra quanto a IA pode custar neste documento antes de você deixar o processamento terminar. Não gasta nada para calcular.
      </p>
      {act.error && <Banner tone="danger">{act.error}</Banner>}
      {data && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", font: "var(--type-body-sm)" }}>
              <thead>
                <tr style={{ color: "var(--text-tertiary)" }}>
                  {["Etapa", "Chamadas", "Custo (pior caso)", "Uma chamada"].map((h) => (
                    <th key={h} style={cell}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => (
                  <tr key={l.step}>
                    <td style={cell}>{l.label}</td>
                    <td style={cell}>{l.calls ?? "depende das afirmações"}</td>
                    <td style={cell}>{l.usd != null ? usd(l.usd) : l.calls == null ? "—" : "sem preço cadastrado"}</td>
                    <td style={cell}>{l.per_call_usd != null ? `até ${usd(l.per_call_usd)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
            <strong>{data.total_usd != null ? `Total conhecido: ${usd(data.total_usd)}` : "Total: ainda sem valor calculado"}</strong>
            {data.partial && <Badge size="sm" tone="warning">parcial</Badge>}
            {data.spent_usd != null && <Badge size="sm">já gasto neste documento: {usd(data.spent_usd)}</Badge>}
            {data.cap && <Badge size="sm" tone={data.cap.enabled ? "warning" : "neutral"}>{data.cap.enabled ? `teto por documento: ${usd(data.cap.usd)}` : "teto por documento: desligado"}</Badge>}
          </div>
          {data.notes.map((n, i) => (
            <p key={i} style={{ margin: "8px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
              {n}
            </p>
          ))}
        </>
      )}
    </Section>
  );
}

const TERMS_HINT = "Um por linha: o nome do curso, a marca, o @ ou o endereço do site de outro curso. Contatos com @ e avisos de direitos reservados também são encontrados sem você digitar.";

/** Tirar do texto lido o nome, a marca e os endereços de outro curso (com prévia e desfazer). O original extraído nunca é alterado. */
export function CleanReferences({ id, onChanged }) {
  const { backend } = useSession();
  const [text, setText] = React.useState("");
  const [preview, setPreview] = React.useState(null);
  const act = useAction();
  const terms = text.split("\n").map((t) => t.trim()).filter(Boolean);
  const call = (action) => hubPost(backend, `/documents/${id}/clean-references`, { action, terms });
  const showPreview = async () => {
    setPreview(null);
    const r = await act.run(() => call("preview"), "Prévia pronta: nada foi alterado ainda.");
    if (r) setPreview(r);
  };
  const apply = async () => {
    const r = await act.run(() => call("apply"), "Marcas retiradas do texto revisado. O texto original continua guardado.");
    if (r) {
      setPreview(null);
      onChanged?.();
    }
  };
  const undo = async () => {
    const r = await act.run(() => call("undo"), "Retirada desfeita onde ninguém revisou o texto depois.");
    if (r) {
      setPreview(null);
      onChanged?.();
    }
  };
  return (
    <Section title="Tirar marcas de terceiros">
      <p style={{ margin: "0 0 8px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        Tira do texto lido o nome e a marca de outro curso. Você vê a prévia antes; o texto original do PDF nunca é alterado e dá para desfazer.
      </p>
      <TextArea label="Nomes, marcas e endereços a tirar" value={text} onChange={setText} rows={4} hint={TERMS_HINT} placeholder={"Nome do curso\nwww.exemplo.com.br"} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <Button size="sm" variant="secondary" icon="eye" loading={act.busy} onClick={showPreview}>
          Ver prévia
        </Button>
        {preview && preview.total > 0 && (
          <Button size="sm" icon="check" loading={act.busy} onClick={apply}>
            Aplicar em {preview.total} bloco(s)
          </Button>
        )}
        <Button size="sm" variant="ghost" icon="undo-2" loading={act.busy} onClick={undo}>
          Desfazer o que foi tirado
        </Button>
      </div>
      {act.feedback}
      {preview && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge size="sm" tone="brand">{preview.edited} para editar</Badge>
            <Badge size="sm" tone="warning">{preview.excluded} para excluir (só tinham a marca)</Badge>
          </div>
          {preview.total === 0 && <p style={{ margin: "8px 0 0", color: "var(--text-tertiary)" }}>Nada encontrado com esses nomes.</p>}
          {preview.total > preview.shown && <p style={{ margin: "8px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Mostrando os primeiros {preview.shown} de {preview.total}; a retirada vale para todos.</p>}
          {preview.changes.map((c) => (
            <div key={c.block_id} style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 8, paddingTop: 4 }}>
              <Label>Página {c.page}</Label>
              <Pre>{c.before}</Pre>
              {c.exclude ? <p style={{ margin: "4px 0 0", font: "var(--type-caption)" }}>Este bloco só tinha a marca e será excluído.</p> : <Pre tone="brand">{c.after}</Pre>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
