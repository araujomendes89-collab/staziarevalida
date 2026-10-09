// Painel do assistente de IA, igual em todas as abas: três modos (Preencher, Conferir, Conversar), material opcional e cartões de
// resultado. O painel só conhece campos genéricos; quem o usa diz o que "Usar" faz. Nada é salvo aqui.
import React from "react";
import { Badge, Banner, Button, Checkbox, SegmentedControl, SelectField, TextField } from "../../../ds";
import { ASSIST_TEXTS, aiDefinedText, isEmptyValue, sameValue, valueText } from "../../../../shared/adminAssistant/types";
import { itemDiff, wordDiff } from "../../../../shared/textDiff";
import { TextArea, messageOf } from "../common.jsx";
import { readPdfMaterial } from "./assistantApi.js";

const MODES = [{ value: "preencher", label: "Preencher" }, { value: "conferir", label: "Conferir" }, { value: "conversar", label: "Conversar" }];
const MATERIALS = [{ value: "text", label: "Colar texto" }, { value: "pdf", label: "PDF" }, { value: "link", label: "Link" }];
const KIND_LABEL = { erro: "Erro", contradicao: "Contradição", pouco_claro: "Pouco claro", desatualizado: "Possivelmente desatualizado" };
const WHOLE = "__item__";
const usd = (n) => `US$ ${Number(n ?? 0).toFixed(4).replace(".", ",")}`;
const sourcesText = (sources) => (sources ?? []).map((s) => s.label).join("; ");
const isList = (v) => Array.isArray(v);
const itemLines = (v) => valueText(v).split("\n").filter((l) => l !== "");
/** Texto do campo para comparar com o enviado no pedido: nulo e ausente valem "". */
const fieldText = (v) => (v === null || v === undefined ? "" : valueText(v));

const cardStyle = { display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: 12, border: "1px solid var(--border-subtle)", background: "var(--surface-default, #fff)" };
const smallStyle = { font: "var(--type-caption)", color: "var(--text-tertiary)", margin: 0 };
const bodyStyle = { font: "var(--type-body-sm)", color: "var(--text-primary)", whiteSpace: "pre-wrap", margin: 0 };

function Diff({ parts, lines }) {
  if (lines) {
    return (
      <div style={bodyStyle}>
        {parts.map((p, i) => <div key={i}>{p.op === "del" ? <del>{p.text}</del> : p.op === "add" ? <ins>{p.text}</ins> : <span>{p.text}</span>}</div>)}
      </div>
    );
  }
  return (
    <p style={bodyStyle}>
      {parts.map((p, i) => (p.op === "del" ? <del key={i}>{p.text}</del> : p.op === "add" ? <ins key={i}>{p.text}</ins> : <span key={i}>{p.text}</span>))}
    </p>
  );
}

function SuggestionCard({ item, field, label, mode, values, useLabel, used, stale, onUse, onDiscard }) {
  const list = isList(item.value);
  let shown;
  if (mode === "conversar" && item.before !== null && item.before !== undefined) {
    shown = list ? <Diff lines parts={itemDiff(itemLines(item.before), itemLines(item.append ? [...(isList(item.before) ? item.before : []), ...item.value] : item.value))} /> : <Diff parts={wordDiff(valueText(item.before), valueText(item.value))} />;
  } else shown = <p style={bodyStyle}>{valueText(item.value)}</p>;
  const showBefore = mode === "preencher" && !list && typeof item.before === "string" && item.before !== "";
  return (
    <section aria-label={`Sugestão: ${label}`} style={cardStyle}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <span style={{ font: "var(--type-label)" }}>{label}</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {item.redacao && <Badge tone="warning" size="sm">{ASSIST_TEXTS.redacao}</Badge>}
          <Button size="sm" variant={used ? "ghost" : "secondary"} disabled={used} onClick={onUse}>{used ? "Usado" : useLabel}</Button>
          {!used && <Button size="sm" variant="ghost" onClick={onDiscard}>Descartar</Button>}
        </span>
      </div>
      {shown}
      {showBefore && <p style={smallStyle}>{`Antes: ${item.before}`}</p>}
      {item.reason && <p style={smallStyle}>{`Motivo: ${item.reason}`}</p>}
      {item.sources?.length > 0 && <p style={smallStyle}>{`Fonte: ${sourcesText(item.sources)}`}</p>}
      {item.warnings?.map((w, i) => <p key={i} style={{ ...smallStyle, color: "var(--warning-text)" }}>{w}</p>)}
      {stale && <p role="alert" style={{ ...smallStyle, color: "var(--danger-text)" }}>{ASSIST_TEXTS.stale}</p>}
    </section>
  );
}

function FindingCard({ finding, label, canPropose, onPropose }) {
  return (
    <section aria-label={`Achado: ${label}`} style={cardStyle}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <span style={{ font: "var(--type-label)" }}>{`${label} · ${KIND_LABEL[finding.kind] ?? finding.kind}`}</span>
        {canPropose && <Button size="sm" variant="secondary" onClick={onPropose}>Propor correção</Button>}
      </div>
      <p style={bodyStyle}>{finding.detail}</p>
      {finding.sources?.length > 0 && <p style={smallStyle}>{`Fonte: ${sourcesText(finding.sources)}`}</p>}
      {finding.suspeita && <p style={{ ...smallStyle, color: "var(--warning-text)" }}>{ASSIST_TEXTS.suspeita}</p>}
      {finding.owner && <p style={smallStyle}>{finding.owner}</p>}
    </section>
  );
}

export function AssistantPanel({ title = "Assistente", notice, status, fields = [], values = {}, material = "material", materialLink, run, onUse, onDiscard, useLabel = "Usar", onClose }) {
  const [mode, setModeState] = React.useState("preencher");
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [used, setUsed] = React.useState({});
  const [gone, setGone] = React.useState({});
  const [stale, setStale] = React.useState({});
  const [picked, setPicked] = React.useState({});
  const [fillMessage, setFillMessage] = React.useState("");
  const [chatMessage, setChatMessage] = React.useState("");
  const [target, setTarget] = React.useState(WHOLE);
  const [kind, setKind] = React.useState("text");
  const [text, setText] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [pdf, setPdf] = React.useState(null);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  const seq = React.useRef(0);
  // valores dos campos como foram no pedido: "Usar" não troca campo de texto que a pessoa mudou depois (decisão D2c)
  const sent = React.useRef({});

  const editable = fields.filter((f) => f.ai === "editar");
  const checkable = fields.filter((f) => f.ai === "editar" || f.ai === "conferir");
  const labelOf = (name) => fields.find((f) => f.name === name)?.label ?? name;
  const isChecked = (f) => (f.name in picked ? picked[f.name] : isEmptyValue(values[f.name]));
  const line = status?.[mode] ?? null;
  const disabled = busy || status?.[mode]?.ready === false;

  const reset = () => {
    seq.current += 1;
    setBusy(false);
    setResult(null);
    setError(null);
    setUsed({});
    setGone({});
    setStale({});
  };
  const setMode = (m) => {
    setModeState(m);
    reset();
  };

  const materialPayload = () => {
    if (material === "notas") return notes.trim() ? { text: notes } : undefined;
    if (material !== "material") return undefined;
    if (kind === "text") return text.trim() ? { text } : undefined;
    if (kind === "pdf") return pdf?.pages?.length ? { pages: pdf.pages } : undefined;
    return url.trim() ? { url: url.trim() } : undefined;
  };

  const send = async () => {
    const request = {};
    if (mode === "preencher") {
      request.fields = editable.filter(isChecked).map((f) => f.name);
      if (fillMessage.trim()) request.message = fillMessage;
    } else if (mode === "conferir") {
      if (target !== WHOLE) request.field = target;
    } else request.message = chatMessage;
    const mat = materialPayload();
    if (mat) request.material = mat;
    reset();
    sent.current = values;
    setBusy(true);
    const mine = seq.current;
    try {
      const res = await run(mode, request);
      if (seq.current === mine) setResult(res);
    } catch (e) {
      if (seq.current !== mine) return;
      setError(e?.status ? e.message : messageOf(e, "O assistente falhou. Tente de novo."));
    } finally {
      if (seq.current === mine) setBusy(false);
    }
  };

  const pickPdf = async (file) => {
    if (!file) return;
    setPdfBusy(true);
    setError(null);
    try {
      setPdf(await readPdfMaterial(file));
    } catch (e) {
      setPdf(null);
      setError(e?.message ?? "Não foi possível ler o PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  const applyOne = (item) => {
    if (used[item.id]) return;
    const current = values[item.field];
    const textChanged = !item.append && !isList(item.value) && fieldText(current) !== fieldText(sent.current?.[item.field]);
    const beforeChanged = mode === "conversar" && item.before !== null && item.before !== undefined && !sameValue(current, item.before);
    if (textChanged || beforeChanged) {
      setStale((s) => ({ ...s, [item.id]: true }));
      return;
    }
    const value = item.append && isList(item.value) ? [...(isList(current) ? current : []), ...item.value] : item.value;
    onUse?.(item.field, value, item);
    setUsed((u) => ({ ...u, [item.id]: true }));
    setStale((s) => ({ ...s, [item.id]: false }));
  };
  const discardOne = (item) => {
    setGone((g) => ({ ...g, [item.id]: true }));
    onDiscard?.(item);
  };
  const propose = (finding) => {
    setModeState("conversar");
    reset();
    setChatMessage(`${finding.field ? labelOf(finding.field) : "Item inteiro"}: ${finding.detail}`);
  };

  const suggestions = (result?.suggestions ?? []).filter((s) => !gone[s.id]);
  const pending = suggestions.filter((s) => !used[s.id]);
  const cost = result?.usage ? (result.usage.provider === "mock" ? ASSIST_TEXTS.mockLabel : `${usd(result.usage.cost_usd)} · ${result.usage.label} ${result.usage.model}`) : null;

  return (
    <aside aria-label="Assistente" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ font: "var(--type-h4, var(--type-label))", margin: 0 }}>{title}</h3>
        {onClose && <Button size="sm" variant="ghost" icon="x" aria-label="Fechar assistente" onClick={onClose} />}
      </div>
      {line && <p style={smallStyle}>{line.ready ? aiDefinedText(line.label ?? "", line.model) : line.pending}</p>}
      {notice && <Banner tone="warning">{notice}</Banner>}
      <SegmentedControl label="Modo" options={MODES} value={mode} onChange={setMode} fullWidth />

      {material === "material" && (
        <>
          <SegmentedControl label="Material" options={MATERIALS} value={kind} onChange={setKind} fullWidth />
          {kind === "text" && <TextArea label="Texto" value={text} onChange={setText} rows={4} />}
          {kind === "pdf" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => pickPdf(e.target.files?.[0])} />
              <Button size="sm" variant="secondary" loading={pdfBusy} onClick={() => fileRef.current?.click()}>Escolher PDF</Button>
              {pdf?.note && <p style={smallStyle}>{pdf.note}</p>}
            </div>
          )}
          {kind === "link" && <TextField label="Endereço (https)" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />}
          {materialLink && (
            <Button size="sm" variant="ghost" onClick={() => { setKind("link"); setUrl(materialLink); }}>Ler o documento oficial deste item</Button>
          )}
        </>
      )}
      {material === "notas" && <TextArea label="Suas notas" value={notes} onChange={setNotes} rows={4} />}

      {mode === "preencher" && (
        <>
          {editable.map((f) => (
            <Checkbox key={f.name} label={f.label} checked={isChecked(f)} onChange={(e) => setPicked((p) => ({ ...p, [f.name]: e.target.checked }))} />
          ))}
          <TextArea label="Pedido (opcional)" value={fillMessage} onChange={setFillMessage} rows={2} maxLength={1000} />
          <Button loading={busy} disabled={disabled} onClick={send}>Preencher campos</Button>
        </>
      )}
      {mode === "conferir" && (
        <>
          <SelectField label="O que conferir" value={target} onChange={(e) => setTarget(e.target.value)} options={[{ value: WHOLE, label: "Item inteiro" }, ...checkable.map((f) => ({ value: f.name, label: f.label }))]} />
          <Button loading={busy} disabled={disabled} onClick={send}>Conferir agora</Button>
        </>
      )}
      {mode === "conversar" && (
        <>
          <TextArea label="Pedido" value={chatMessage} onChange={setChatMessage} rows={3} maxLength={1000} />
          <Button loading={busy} disabled={disabled} onClick={send}>Enviar</Button>
        </>
      )}

      {error && <Banner tone="danger">{error}</Banner>}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {result.reply && <p style={bodyStyle}>{result.reply}</p>}
          {mode === "preencher" && pending.length > 1 && <Button size="sm" variant="secondary" onClick={() => pending.forEach(applyOne)}>Usar tudo</Button>}
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} item={s} mode={mode} values={values} label={labelOf(s.field)} useLabel={useLabel} used={Boolean(used[s.id])} stale={Boolean(stale[s.id])} onUse={() => applyOne(s)} onDiscard={() => discardOne(s)} />
          ))}
          {result.findings?.map((f) => {
            const field = f.field ? fields.find((x) => x.name === f.field) : null;
            return <FindingCard key={f.id} finding={f} label={f.field ? labelOf(f.field) : "Item inteiro"} canPropose={!f.field || field?.ai === "editar"} onPropose={() => propose(f)} />;
          })}
          {result.no_source?.map((name) => <p key={name} style={smallStyle}>{`${labelOf(name)}: ${ASSIST_TEXTS.noSource}`}</p>)}
          {result.missing?.length > 0 && (
            <Banner tone="info" title="A fonte não esclarece">
              {result.missing.map((m) => `${labelOf(m.field)}: ${m.reason}`).join(" ")}
            </Banner>
          )}
          {result.warnings?.length > 0 && (
            <Banner tone="warning" title="Confira antes de usar">
              {result.warnings.join(" ")}
            </Banner>
          )}
          {cost && <p style={smallStyle}>{cost}</p>}
        </div>
      )}
    </aside>
  );
}
