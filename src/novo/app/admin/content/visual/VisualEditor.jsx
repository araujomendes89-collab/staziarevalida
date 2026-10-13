// "Novo material visual" (e edição): modelo, especialidade, conteúdo, prévia ao vivo e geração.
// O conteúdo passa pela mesma validação do servidor e do comando do administrador (src/shared/visualMaterials).
// Nada é escrito pelo sistema: o texto é o que a equipe preenche ou cola.
import React from "react";
import { Badge, Banner, Button, Chip, SegmentedControl, SelectField, Switch, TextField } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { useMobile } from "../../../Shell.jsx";
import { TextArea } from "../../common.jsx";
import { hubBlobUrl, hubPost, hubPut, hubUploadFile } from "../api.js";
import { Section, useAction } from "../ui.jsx";
import {
  COUNT_LIMITS,
  FIELD_LABELS,
  ILLUSTRATION_ICONS,
  REQUIRED_FIELDS,
  TEXT_LIMITS,
  VISUAL_MODELS,
  VISUAL_TOKENS,
  parseVisualCommand,
  resolveSpecialty,
  validateVisualInput,
  visualCommandText,
} from "../../../../../shared/visualMaterials";
import { VisualPreview } from "./VisualPreview.jsx";
import { MODEL_ICON, SPECIALTY_OPTIONS, emptyForm, fromContent, isPair, mergeCommand, shows, toInput } from "./visualForm.js";

const MODEL_ORDER = ["feed", "a4", "story", "flashcard_digital", "flashcard_a6"];
const PALETTE_NAME = { ginecologia: "rosa", pediatria: "azul", clinica_medica: "verde", cirurgia: "vermelha", preventiva_mfc: "roxa", fallback: "turquesa/petróleo (padrão)" };
const ROW_KINDS = [
  { value: "normal", label: "Normal" },
  { value: "destaque", label: "Destaque" },
  { value: "alerta", label: "Alerta (vermelho)" },
];

/** Imagem enviada → data URI para a prévia (a moldura isolada não lê endereços da página). */
const imageCache = new Map();
const toDataUri = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export function VisualEditor({ material, version, onSaved, onCancel, status }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const editing = Boolean(material);
  const [form, setForm] = React.useState(() => (version?.content ? fromContent(version.content) : emptyForm()));
  const [side, setSide] = React.useState("front");
  const [guides, setGuides] = React.useState(true);
  const [report, setReport] = React.useState(null);
  const [images, setImages] = React.useState({});
  const [command, setCommand] = React.useState("");
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [commandMsg, setCommandMsg] = React.useState(null);
  const act = useAction();
  const upload = useAction();

  const input = React.useMemo(() => toInput(form), [form]);
  const validation = React.useMemo(() => validateVisualInput(input), [input]);
  const model = form.modelo;
  const info = VISUAL_MODELS[model];
  const sp = resolveSpecialty(input.especialidade, input.especialidade_nome);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setIn = (key, patch) => setForm((f) => ({ ...f, [key]: { ...f[key], ...patch } }));
  const problemsOf = (field) => validation.problems.filter((p) => p.field === field || (field === "especialidade" && p.field === "especialidade_nome"));
  const errorOf = (field) => problemsOf(field)[0]?.message;
  const layout = (report?.problems ?? []).filter(Boolean);

  // imagem já salva (edição): busca para a prévia
  const image = form.ilustracao.tipo === "imagem" ? form.ilustracao.imagem : "";
  React.useEffect(() => {
    if (!image || images[image]) return;
    if (imageCache.has(image)) return setImages((m) => ({ ...m, [image]: imageCache.get(image) }));
    let alive = true;
    hubBlobUrl(backend, `/visual/assets/${image}`)
      .then((url) => fetch(url).then((r) => r.blob()).finally(() => URL.revokeObjectURL(url)))
      .then(toDataUri)
      .then((uri) => {
        imageCache.set(image, uri);
        if (alive) setImages((m) => ({ ...m, [image]: uri }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [backend, image, images]);

  const onImage = async (file) => {
    if (!file) return;
    const r = await upload.run(() => hubUploadFile(backend, "/visual/assets", file), "Imagem enviada.");
    if (r?.name) {
      const uri = await toDataUri(file);
      imageCache.set(r.name, uri);
      setImages((m) => ({ ...m, [r.name]: uri }));
      setIn("ilustracao", { tipo: "imagem", imagem: r.name, alt: form.ilustracao.alt || form.ilustracao.legenda });
    }
  };

  const save = async (generate) => {
    const body = { input, generate };
    const r = await act.run(
      () => (editing ? hubPut(backend, `/visual/materials/${material.id}`, body) : hubPost(backend, "/visual/materials", body)),
      generate ? (isPair(model) ? "Par frente e verso enviado para a geração." : "Material enviado para a geração.") : "Rascunho salvo."
    );
    if (r) onSaved?.(r);
  };

  const applyCommand = () => {
    const p = parseVisualCommand(command);
    if (p.problems.length) return setCommandMsg({ tone: "danger", text: p.problems.map((x) => x.message).join(" ") });
    if (editing && p.input.modelo && validateVisualInput({ ...input, modelo: p.input.modelo }).content.model !== model) {
      return setCommandMsg({ tone: "danger", text: "O modelo de um material salvo não muda. Para outro modelo, crie um material novo." });
    }
    setForm((f) => mergeCommand(f, p.input));
    setCommandMsg({ tone: "success", text: "Comando aplicado ao formulário. Confira a prévia." });
  };
  const copyCommand = async () => {
    const text = visualCommandText(validation.content);
    setCommand(text);
    setCommandOpen(true);
    try {
      await navigator.clipboard.writeText(text);
      setCommandMsg({ tone: "success", text: "Comando copiado. Ele também serve no comando do terminal (--arquivo)." });
    } catch {
      setCommandMsg({ tone: "info", text: "Comando pronto na caixa abaixo para copiar." });
    }
  };

  // campo de texto com contador e erro
  const field = (key, opts = {}) => {
    if (!shows(model, key) && !opts.always) return null;
    const limit = opts.limit ?? TEXT_LIMITS[key];
    const value = form[key] ?? "";
    const label = `${opts.label ?? FIELD_LABELS[key]}${REQUIRED_FIELDS[model]?.includes(key) ? " *" : ""}`;
    const hint = [opts.hint, limit ? `${String(value).length}/${limit}` : null].filter(Boolean).join(" · ");
    const error = errorOf(key);
    if (opts.multiline)
      return (
        <div key={key}>
          <TextArea label={label} value={value} onChange={(v) => set({ [key]: v })} rows={opts.rows ?? 3} hint={hint} placeholder={opts.placeholder} />
          {error && <span style={{ font: "var(--type-caption)", color: "var(--danger-text)" }}>{error}</span>}
        </div>
      );
    return <TextField key={key} label={label} value={value} onChange={(e) => set({ [key]: e.target.value })} hint={hint} error={error} placeholder={opts.placeholder} disabled={opts.disabled} />;
  };
  const grid = { display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 12 };
  const pair = isPair(model);
  const canGenerate = validation.ok && report && layout.length === 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0, 1fr) minmax(320px, 480px)", gap: 16, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <Section title="1. Modelo">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="radiogroup" aria-label="Modelo">
            {MODEL_ORDER.map((m) => (
              <Chip key={m} icon={MODEL_ICON[m]} selected={model === m} role="radio" aria-checked={model === m} onClick={() => !editing && set({ modelo: m })} disabled={editing && model !== m}>
                {VISUAL_MODELS[m].label}
              </Chip>
            ))}
          </div>
          <p style={{ margin: "10px 0 0", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            {info.size}
            {pair ? " · frente e verso gerados juntos, com o mesmo ID do card" : ""}
            {model === "story" ? " · zona segura de 190 px no topo e 150 px na base" : ""}
            {model === "flashcard_a6" ? " · PDF para impressão: margem segura de 5 mm, sangria de 3 mm, virar no eixo longo" : ""}
            {editing ? " · o modelo de um material salvo não muda" : ""}
          </p>
        </Section>

        <Section title="2. Especialidade">
          <div style={grid}>
            <SelectField label="Especialidade *" value={form.especialidade} onChange={(e) => set({ especialidade: e.target.value })} options={SPECIALTY_OPTIONS} />
            {form.especialidade === "outra" && (
              <TextField label="Nome por extenso *" value={form.especialidade_nome} onChange={(e) => set({ especialidade_nome: e.target.value })} hint="Aparece escrito na peça" error={errorOf("especialidade_nome")} />
            )}
          </div>
          {errorOf("especialidade") && form.especialidade !== "outra" && <p style={{ margin: "6px 0 0", font: "var(--type-caption)", color: "var(--danger-text)" }}>{errorOf("especialidade")}</p>}
          {(form.especialidade || form.especialidade_nome) && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12, font: "var(--type-body-sm)" }}>
              {["primary", "soft", "dark"].map((k) => (
                <span key={k} title={`specialty.${k} ${sp.palette[k]}`} style={{ width: 22, height: 22, borderRadius: 6, background: sp.palette[k], border: "1px solid var(--border-subtle)" }} />
              ))}
              <span>
                <strong>{sp.label || "—"}</strong> · paleta {PALETTE_NAME[sp.key]}
              </span>
              <Badge size="sm" tone="danger" icon="triangle-alert">
                Pegadinha e alerta: sempre {VISUAL_TOKENS.brand.alert.primary}
              </Badge>
            </div>
          )}
        </Section>

        <Section title="3. Conteúdo">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pair ? (
              <>
                <div style={grid}>
                  {field("card_id", { always: true, label: "ID do card", hint: editing ? "Fixo: igual na frente, no verso e em todas as versões" : "Vazio: o sistema cria (ex.: CIR-0012)", disabled: editing })}
                  <TextField label="Ordem no lote" type="number" min={1} max={9999} value={form.ordem} onChange={(e) => set({ ordem: e.target.value === "" ? "" : Number(e.target.value) })} error={errorOf("ordem")} />
                  {field("lote", { hint: "Opcional (ex.: Lote junho)" })}
                  {field("nivel", { hint: "1 ou 2 palavras" })}
                </div>
                {field("tema")}
                <h4 style={{ margin: "8px 0 0", font: "var(--type-label)" }}>Frente</h4>
                {field("pergunta", { multiline: true, rows: 3, hint: "Até 5 linhas na peça; a resposta nunca vai na frente" })}
                <h4 style={{ margin: "8px 0 0", font: "var(--type-label)" }}>Verso</h4>
                {field("resposta", { hint: "Resposta curta: até 2 linhas" })}
                {field("explicacao", { multiline: true, rows: 4, label: "Explicação / justificativa", hint: "Até 8 linhas (5 com pegadinha)" })}
                {field("como_lembrar", { multiline: true, rows: 3, hint: "Até 6 linhas" })}
                {field("pegadinha", { multiline: true, rows: 2, hint: "Opcional · até 2 linhas · sempre no vermelho de alerta" })}
                {field("referencia", { multiline: true, rows: 2, hint: "1 a 2 linhas" })}
                <div style={grid}>
                  {field("fonte", { hint: "Rodapé do verso" })}
                  {field("atualizacao", { placeholder: "ex.: 2026" })}
                </div>
                {field("tema_cor", { hint: "Opcional: GR-001 a GR-100 (cor do tema) ou #RRGGBB. Vazio = cor da especialidade", placeholder: "ex.: GR-043" })}
              </>
            ) : (
              <>
                {field("titulo", { hint: "Até 2 linhas" })}
                {field("tema_cor", { hint: "Opcional: GR-001 a GR-100 (cor do tema) ou #RRGGBB. Vazio = cor da especialidade", placeholder: "ex.: GR-043" })}
                {field("subtitulo", { hint: "1 linha" })}
                <div style={grid}>
                  {field("selo_prova", { placeholder: "ex.: Revalida 2025/1" })}
                  {field("atualizacao", { placeholder: "ex.: 2026", hint: 'Sai como "Atualizado 2026"' })}
                </div>
                {field("resumo", { hint: "Faixa colorida, 1 linha" })}
                {field("dado_chave", { hint: model === "a4" ? "Destaque manuscrito no topo" : "Opcional: aparece na área da ilustração" })}
                {field("resumo_paragrafo", { multiline: true, rows: 3, hint: "2 a 4 linhas" })}
                {field("pontos_chave", {
                  multiline: true,
                  rows: 4,
                  limit: 0,
                  label: `Pontos-chave (um por linha, até ${COUNT_LIMITS[model].pontos})`,
                  hint: model === "a4" ? 'Use "Destaque — detalhe" para o destaque sair em negrito' : undefined,
                })}
                {errorOf("pontos_chave") && <span style={{ font: "var(--type-caption)", color: "var(--danger-text)" }}>{errorOf("pontos_chave")}</span>}
                <TableEditor form={form} setIn={setIn} model={model} error={errorOf("tabela")} mobile={mobile} />
                <IllustrationEditor form={form} setIn={setIn} onImage={onImage} upload={upload} image={images[image]} error={errorOf("ilustracao")} />
                {field("pegadinha", { multiline: true, rows: 2, hint: "2 a 3 linhas · sempre no vermelho de alerta" })}
                {field("tome_nota", { multiline: true, rows: 2, hint: "2 a 3 linhas · nota amarela" })}
                {shows(model, "bloco") && (
                  <div style={grid}>
                    <TextField label="Bloco de lista: título" value={form.bloco.titulo} onChange={(e) => setIn("bloco", { titulo: e.target.value })} error={errorOf("bloco")} />
                    <TextArea label="Itens do bloco (um por linha, até 3)" value={form.bloco.itens} onChange={(v) => setIn("bloco", { itens: v })} rows={3} />
                  </div>
                )}
                {shows(model, "mnemonico") && <MnemonicEditor form={form} setIn={setIn} error={errorOf("mnemonico")} mobile={mobile} />}
                <div style={grid}>
                  {field("fonte", { hint: "Rodapé" })}
                  {field("paginacao", { placeholder: "ex.: 1/3" })}
                </div>
              </>
            )}
          </div>
        </Section>

        <Section
          title="Colar ou copiar comando"
          action={
            <Button variant="ghost" size="sm" icon={commandOpen ? "chevron-up" : "chevron-down"} onClick={() => setCommandOpen((v) => !v)}>
              {commandOpen ? "Fechar" : "Abrir"}
            </Button>
          }
        >
          <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            Cole o conteúdo no formato <code>campo: valor</code> (ou JSON) para preencher o formulário. O mesmo texto funciona no comando do terminal.
          </p>
          {commandOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              <TextArea label="Comando" value={command} onChange={setCommand} rows={8} placeholder={"modelo: flashcard_a6\nespecialidade: cirurgia\ntema: …\npergunta: …\nresposta: …"} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="secondary" icon="clipboard-paste" onClick={applyCommand} disabled={!command.trim()}>
                  Aplicar ao formulário
                </Button>
                <Button variant="ghost" icon="copy" onClick={copyCommand}>
                  Copiar comando deste conteúdo
                </Button>
              </div>
            </div>
          )}
          {commandMsg && (
            <div style={{ marginTop: 10 }}>
              <Banner tone={commandMsg.tone}>{commandMsg.text}</Banner>
            </div>
          )}
        </Section>
      </div>

      <div style={{ position: mobile ? "static" : "sticky", top: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <Section title="Prévia" padding={16}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            {pair && (
              <SegmentedControl
                label="Lado"
                value={side}
                onChange={setSide}
                options={[
                  { value: "front", label: "Frente" },
                  { value: "back", label: "Verso" },
                ]}
              />
            )}
            <Switch label="Mostrar guias" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
          </div>
          <VisualPreview content={validation.content} side={side} guides={guides} images={images} onReport={setReport} />
          <p style={{ margin: "8px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
            As guias só aparecem aqui; os arquivos finais saem sem elas.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {!validation.ok && (
              <Banner tone="danger" title="Falta corrigir">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {validation.problems.map((p, i) => (
                    <li key={i}>{p.message}</li>
                  ))}
                </ul>
              </Banner>
            )}
            {validation.ok && layout.length > 0 && (
              <Banner tone="warning" title="A prévia encontrou">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {layout.map((p, i) => (
                    <li key={i}>{p.message}</li>
                  ))}
                </ul>
              </Banner>
            )}
            {validation.ok && report && layout.length === 0 && (
              <Banner tone="success" icon="badge-check">
                Sem texto cortado, sem sobreposição e dentro das zonas seguras.
                {report.fitted?.length > 0 && ` Ajuste automático do tamanho do texto em ${[...new Set(report.fitted.map((f) => FIELD_LABELS[f.field] ?? f.field))].join(", ")}.`}
              </Banner>
            )}
            {validation.warnings.length > 0 && (
              <Banner tone="info" title="Avisos">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {validation.warnings.map((p, i) => (
                    <li key={i}>{p.message}</li>
                  ))}
                </ul>
              </Banner>
            )}
          </div>
        </Section>
        {act.feedback}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button icon="wand-sparkles" loading={act.busy} disabled={!canGenerate} onClick={() => save(true)}>
            {pair ? "Gerar par frente e verso" : "Gerar material"}
          </Button>
          <Button variant="secondary" icon="save" loading={act.busy} disabled={!validation.ok} onClick={() => save(false)}>
            Salvar rascunho
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          )}
        </div>
        <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
          {status?.worker
            ? "A geração roda neste servidor e leva alguns segundos."
            : "A geração roda no processamento da Central (Google Cloud Run), que passa a cada 10 minutos. A página do material mostra quando os arquivos ficarem prontos."}
          {editing ? " Salvar cria uma versão nova; a anterior continua guardada." : ""}
        </p>
      </div>
    </div>
  );
}

function TableEditor({ form, setIn, model, error, mobile }) {
  const t = form.tabela;
  const max = COUNT_LIMITS[model].linhas;
  const n = t.ncols;
  const setCol = (i, v) => setIn("tabela", { colunas: t.colunas.map((c, j) => (j === i ? v : c)) });
  const setCell = (r, i, v) => setIn("tabela", { linhas: t.linhas.map((row, k) => (k === r ? { ...row, celulas: row.celulas.map((c, j) => (j === i ? v : c)) } : row)) });
  const setKind = (r, v) => setIn("tabela", { linhas: t.linhas.map((row, k) => (k === r ? { ...row, tipo: v } : row)) });
  return (
    <fieldset style={{ border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 12, margin: 0 }}>
      <legend style={{ font: "var(--type-label)", padding: "0 6px" }}>Tabela (opcional{model === "story" ? ", aparece na área flexível" : ""})</legend>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 160px", gap: 10, marginBottom: 10 }}>
        {model === "a4" ? <TextField label="Título da seção" value={t.titulo} onChange={(e) => setIn("tabela", { titulo: e.target.value })} /> : <div />}
        <SelectField label="Colunas" value={String(n)} onChange={(e) => setIn("tabela", { ncols: Number(e.target.value) })} options={[{ value: "2", label: "2 colunas" }, { value: "3", label: "3 colunas" }]} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0, 1fr)) 150px`, gap: 6, alignItems: "end" }}>
        {t.colunas.slice(0, n).map((c, i) => (
          <TextField key={`h${i}`} label={`Coluna ${"ABC"[i]}`} value={c} onChange={(e) => setCol(i, e.target.value)} size="sm" />
        ))}
        <div />
        {t.linhas.map((row, r) => (
          <React.Fragment key={r}>
            {row.celulas.slice(0, n).map((c, i) => (
              <TextField key={`c${r}${i}`} aria-label={`Linha ${r + 1}, coluna ${"ABC"[i]}`} value={c} onChange={(e) => setCell(r, i, e.target.value)} size="sm" />
            ))}
            <SelectField aria-label={`Tipo da linha ${r + 1}`} value={row.tipo} onChange={(e) => setKind(r, e.target.value)} options={ROW_KINDS} />
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="ghost" size="sm" icon="plus" disabled={t.linhas.length >= max} onClick={() => setIn("tabela", { linhas: [...t.linhas, { celulas: ["", "", ""], tipo: "normal" }] })}>
          Linha
        </Button>
        <Button variant="ghost" size="sm" icon="minus" disabled={t.linhas.length <= 1} onClick={() => setIn("tabela", { linhas: t.linhas.slice(0, -1) })}>
          Linha
        </Button>
        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Até {max} linhas neste modelo. Linha de alerta usa o vermelho de alerta.</span>
      </div>
      {error && <p style={{ margin: "6px 0 0", font: "var(--type-caption)", color: "var(--danger-text)" }}>{error}</p>}
    </fieldset>
  );
}

function IllustrationEditor({ form, setIn, onImage, upload, image, error }) {
  const il = form.ilustracao;
  return (
    <fieldset style={{ border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 12, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <legend style={{ font: "var(--type-label)", padding: "0 6px" }}>Ilustração</legend>
      <SegmentedControl
        label="Tipo de ilustração"
        value={il.tipo}
        onChange={(v) => setIn("ilustracao", { tipo: v })}
        options={[
          { value: "icone", label: "Ícone" },
          { value: "imagem", label: "Imagem" },
          { value: "nenhuma", label: "Nenhuma" },
        ]}
      />
      {il.tipo === "icone" && (
        <SelectField label="Ícone" value={il.icone} onChange={(e) => setIn("ilustracao", { icone: e.target.value })} options={Object.entries(ILLUSTRATION_ICONS).map(([value, label]) => ({ value, label }))} />
      )}
      {il.tipo === "imagem" && (
        <div className="sm-field">
          <label className="sm-field__label" htmlFor="vm-image">
            Imagem (PNG, JPEG ou WebP, até 4 MB)
          </label>
          <input id="vm-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onImage(e.target.files?.[0])} />
          {image && <img src={image} alt="" style={{ marginTop: 8, maxWidth: 160, maxHeight: 120, objectFit: "contain", borderRadius: 8, border: "1px solid var(--border-subtle)" }} />}
          {upload.feedback}
        </div>
      )}
      {il.tipo !== "nenhuma" && (
        <TextField label="Legenda" value={il.legenda} onChange={(e) => setIn("ilustracao", { legenda: e.target.value })} hint={`${il.legenda.length}/${TEXT_LIMITS.legenda}`} />
      )}
      {il.tipo === "imagem" && <TextField label="Descrição da imagem (acessibilidade)" value={il.alt} onChange={(e) => setIn("ilustracao", { alt: e.target.value })} />}
      {error && <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--danger-text)" }}>{error}</p>}
    </fieldset>
  );
}

function MnemonicEditor({ form, setIn, error, mobile }) {
  const m = form.mnemonico;
  const setItem = (i, patch) => setIn("mnemonico", { itens: m.itens.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  return (
    <fieldset style={{ border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 12, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <legend style={{ font: "var(--type-label)", padding: "0 6px" }}>Mnemônico ou resumo final (opcional)</legend>
      <TextField label="Título" value={m.titulo} onChange={(e) => setIn("mnemonico", { titulo: e.target.value })} />
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 2fr" : "repeat(4, 64px minmax(0, 1fr))", gap: 6 }}>
        {m.itens.map((it, i) => (
          <React.Fragment key={i}>
            <TextField aria-label={`Letra ${i + 1}`} value={it.letra} onChange={(e) => setItem(i, { letra: e.target.value })} size="sm" placeholder={"ABCD"[i]} />
            <TextField aria-label={`Texto ${i + 1}`} value={it.texto} onChange={(e) => setItem(i, { texto: e.target.value })} size="sm" />
          </React.Fragment>
        ))}
      </div>
      {error && <p style={{ margin: 0, font: "var(--type-caption)", color: "var(--danger-text)" }}>{error}</p>}
    </fieldset>
  );
}
