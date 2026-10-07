// Central de Conteúdo › Materiais visuais: lista, "Novo material visual", página do material (versões,
// arquivos para baixar, duplicar, gerar de novo, editar). Só a equipe (administrador ou editor).
import React from "react";
import { Badge, Banner, Button, EmptyState, SelectField, TextField } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { useMobile } from "../../../Shell.jsx";
import { dateTimeBR, ListRow, LoadError, Loading, useDebounced, useLoad } from "../../common.jsx";
import { hubAvailable, hubBlobUrl, hubPost } from "../api.js";
import { KeyValue, Section, StatusBadge, useAction } from "../ui.jsx";
import { VISUAL_MODELS, paletteOf, visualCommandText, visualFileName } from "../../../../../shared/visualMaterials";
import { VisualEditor } from "./VisualEditor.jsx";
import { VisualPreview } from "./VisualPreview.jsx";
import { MODEL_ICON, SIDE_LABEL, SPECIALTY_OPTIONS, STATUS } from "./visualForm.js";

const MODEL_OPTIONS = [{ value: "", label: "Todos os modelos" }, ...Object.values(VISUAL_MODELS).map((m) => ({ value: m.id, label: m.label }))];
const SPECIALTY_FILTER = [{ value: "", label: "Todas as especialidades" }, ...SPECIALTY_OPTIONS.slice(1).map((o) => ({ value: o.value === "outra" ? "fallback" : o.value, label: o.label }))];
const STATUS_OPTIONS = [{ value: "", label: "Todas as situações" }, ...Object.entries(STATUS).map(([value, [label]]) => ({ value, label }))];

export function VisualMaterials(ctx) {
  const id = ctx.params.get("id");
  const { backend } = useSession();
  if (!hubAvailable(backend))
    return (
      <Banner tone="warning" title="Servidor necessário">
        Os materiais visuais são gravados e gerados pelo servidor. Entre com o servidor ligado para usar esta área.
      </Banner>
    );
  if (id === "novo") return <NewMaterial {...ctx} />;
  if (id) return <MaterialPage id={id} {...ctx} />;
  return <MaterialList {...ctx} />;
}

function SpecialtyBadge({ k, label }) {
  const p = paletteOf(k);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "var(--type-caption)", fontWeight: 600, padding: "2px 10px", borderRadius: 999, background: p.soft, color: p.dark, border: `1px solid ${p.primary}` }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: p.primary }} />
      {label}
    </span>
  );
}

function MaterialList({ go }) {
  const { backend } = useSession();
  const [filters, setFilters] = React.useState({ model: "", specialty_key: "", status: "", q: "" });
  const q = useDebounced(filters.q, 300);
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_visual_list", { p_filters: { ...filters, q } }), [backend, filters.model, filters.specialty_key, filters.status, q]);
  const busy = (data ?? []).some((m) => m.status === "queued" || m.status === "rendering");
  React.useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(reload, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  return (
    <Section
      title="Materiais visuais"
      action={
        <Button icon="plus" onClick={() => go("visuais", { id: "novo" })}>
          Novo material visual
        </Button>
      }
    >
      <p style={{ margin: "0 0 12px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        Cards para feed, página A4, story e flashcards frente e verso (digital e A6 para impressão) com os modelos StaziaMed. O conteúdo é o que a equipe preenche: o sistema não escreve texto clínico.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
        <SelectField label="Modelo" value={filters.model} onChange={(e) => set({ model: e.target.value })} options={MODEL_OPTIONS} />
        <SelectField label="Especialidade" value={filters.specialty_key} onChange={(e) => set({ specialty_key: e.target.value })} options={SPECIALTY_FILTER} />
        <SelectField label="Situação" value={filters.status} onChange={(e) => set({ status: e.target.value })} options={STATUS_OPTIONS} />
        <TextField label="Buscar" value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="título, ID do card…" icon="search" />
      </div>
      {error && <LoadError error={error} retry={reload} />}
      {!data && !error && <Loading />}
      {data?.length === 0 && <EmptyState icon="palette" title="Nenhum material visual ainda" description='Clique em "Novo material visual" para criar o primeiro.' />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(data ?? []).map((m) => (
          <ListRow key={m.id} onClick={() => go("visuais", { id: m.id })} label={`Abrir ${m.title}`}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ overflowWrap: "anywhere" }}>{m.title}</strong>
                <StatusBadge map={STATUS} value={m.status} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <Badge size="sm" icon={MODEL_ICON[m.model]}>
                  {VISUAL_MODELS[m.model]?.short ?? m.model}
                </Badge>
                <SpecialtyBadge k={m.specialty_key} label={m.specialty_label} />
                {m.card_id && <Badge size="sm">{m.card_id}</Badge>}
                {m.batch_label && (
                  <Badge size="sm">
                    {m.batch_label} · {m.batch_order}
                  </Badge>
                )}
                <Badge size="sm">versão {m.current_version}</Badge>
              </div>
              <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                Atualizado em {dateTimeBR(m.updated_at)} por {m.updated_by_name ?? "—"}
              </span>
            </div>
          </ListRow>
        ))}
      </div>
    </Section>
  );
}

function NewMaterial({ go, status }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <Button variant="ghost" icon="arrow-left" onClick={() => go("visuais")}>
          Materiais visuais
        </Button>
      </div>
      <h2 style={{ margin: 0, font: "var(--type-h3)" }}>Novo material visual</h2>
      <VisualEditor status={status} onSaved={(r) => go("visuais", { id: r.material_id })} onCancel={() => go("visuais")} />
    </div>
  );
}

async function download(backend, file, material, version) {
  const url = await hubBlobUrl(backend, `/visual/files/${file.id}`);
  const a = document.createElement("a");
  a.href = url;
  a.download = visualFileName({ model: material.model, card_id: material.card_id, title: material.title }, version, file.side, file.format);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const fileLabel = (f) => `${f.format.toUpperCase()}${SIDE_LABEL[f.side] ? ` (${SIDE_LABEL[f.side]})` : ""}`;

function processingNote(status) {
  if (status?.worker) return "A geração roda neste servidor: leva alguns segundos.";
  const p = status?.processing;
  if (p?.where && !p.stale) return `O processamento da Central (Google Cloud Run) passa a cada 10 minutos; a última rodada foi há ${p.minutes_ago} min. Esta página se atualiza sozinha.`;
  return "O processamento da Central não está rodando agora: o material fica na fila até ele voltar (Configuração e custos mostra a situação).";
}

function MaterialPage({ id, go, params, status }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const { data: m, error, reload } = useLoad(() => backend.rpc("app_ch_visual_material", { p_id: id }), [backend, id]);
  const [side, setSide] = React.useState("front");
  const act = useAction();
  const editVersion = params.get("editar");
  const current = m?.versions?.find((v) => v.version === m.current_version);
  const waiting = current && (current.render_status === "queued" || current.render_status === "rendering");
  React.useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(reload, status?.worker ? 3000 : 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, status?.worker]);

  if (error) return <LoadError error={error} retry={reload} />;
  if (!m) return <Loading />;
  const info = VISUAL_MODELS[m.model];

  if (editVersion) {
    const v = m.versions.find((x) => String(x.version) === editVersion) ?? current;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <Button variant="ghost" icon="arrow-left" onClick={() => go("visuais", { id })}>
            Voltar ao material
          </Button>
        </div>
        <h2 style={{ margin: 0, font: "var(--type-h3)" }}>
          Editar {m.title} <span style={{ font: "var(--type-body)", color: "var(--text-tertiary)" }}>a partir da versão {v.version}</span>
        </h2>
        <VisualEditor material={m} version={v} status={status} onSaved={() => (go("visuais", { id }), reload())} onCancel={() => go("visuais", { id })} />
      </div>
    );
  }

  const duplicate = async () => {
    const r = await act.run(() => hubPost(backend, `/visual/materials/${id}/duplicate`), "Cópia criada como rascunho.");
    if (r) go("visuais", { id: r.material_id });
  };
  const regenerate = async (version) => {
    const r = await act.run(() => hubPost(backend, `/visual/materials/${id}/regenerate`, { version }), "Enviado de novo para a geração.");
    if (r) reload();
  };
  const copy = async () => {
    await act.run(() => navigator.clipboard.writeText(visualCommandText(current.content)), "Comando copiado (serve no formulário e no terminal).");
  };
  const check = current?.check_result ?? {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Button variant="ghost" icon="arrow-left" onClick={() => go("visuais")}>
          Materiais visuais
        </Button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, font: "var(--type-h3)", overflowWrap: "anywhere" }}>{m.title}</h2>
        <StatusBadge map={STATUS} value={current?.render_status} size="md" />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge size="sm" icon={MODEL_ICON[m.model]}>
          {info.label}
        </Badge>
        <SpecialtyBadge k={m.specialty_key} label={m.specialty_label} />
        {m.card_id && <Badge size="sm">ID {m.card_id}</Badge>}
        <Badge size="sm">versão {m.current_version}</Badge>
      </div>

      {waiting && (
        <Banner tone="info" icon="loader">
          {current.render_status === "rendering" ? "Gerando os arquivos…" : "Na fila para gerar."} {processingNote(status)}
          {current.render_error ? ` ${current.render_error}` : ""}
        </Banner>
      )}
      {current?.render_status === "failed" && (
        <Banner tone="danger" title="A geração falhou (o conteúdo continua salvo)">
          {current.render_error ?? "Sem detalhe."} Use "Gerar de novo" depois de conferir.
        </Banner>
      )}
      {current?.render_status === "check_failed" && (
        <Banner tone="warning" title="Reprovado na conferência: ajuste o texto e gere de novo">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {(check.problems ?? []).map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
        </Banner>
      )}
      {current?.render_status === "draft" && <Banner tone="brand">Rascunho: ainda não gerado. Use "Gerar" para criar os arquivos.</Banner>}
      {act.feedback}

      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(280px, 460px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <Section title="Prévia da versão atual" padding={16}>
          {info.pair && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <Button variant={side === "front" ? "secondary" : "ghost"} size="sm" onClick={() => setSide("front")}>
                Frente
              </Button>
              <Button variant={side === "back" ? "secondary" : "ghost"} size="sm" onClick={() => setSide("back")}>
                Verso
              </Button>
            </div>
          )}
          {current && <VisualPreview content={current.content} side={side} />}
        </Section>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Section title="Arquivos">
            {current?.files?.length ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {current.files.map((f) => (
                  <Button key={f.id} variant="secondary" icon="download" disabled={current.render_status !== "ready"} onClick={() => act.run(() => download(backend, f, m, current.version), "Download iniciado.")}>
                    {fileLabel(f)}
                  </Button>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Ainda sem arquivos nesta versão.</p>
            )}
            {current?.render_status === "check_failed" && <p style={{ margin: "8px 0 0", font: "var(--type-caption)", color: "var(--warning-text)" }}>Arquivos reprovados na conferência não são liberados para baixar.</p>}
            {info.id === "flashcard_a6" && <p style={{ margin: "8px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Impressão: PDF com frente e verso em sequência (105 × 148 mm + sangria de 3 mm). Imprima em duplex, virando no eixo longo, e confira uma folha de teste antes da tiragem.</p>}
            {info.id === "flashcard_digital" && <p style={{ margin: "8px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Digital: duas imagens (frente e verso) e um PDF com as duas páginas em sequência.</p>}
          </Section>

          <Section title="Ações">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button icon="pencil" onClick={() => go("visuais", { id, editar: String(m.current_version) })}>
                Editar
              </Button>
              <Button variant="secondary" icon="wand-sparkles" loading={act.busy} disabled={waiting} onClick={() => regenerate(null)}>
                {current?.render_status === "draft" ? "Gerar" : "Gerar de novo"}
              </Button>
              <Button variant="secondary" icon="copy" loading={act.busy} onClick={duplicate}>
                Duplicar
              </Button>
              <Button variant="ghost" icon="clipboard-copy" onClick={copy}>
                Copiar comando
              </Button>
            </div>
            <p style={{ margin: "8px 0 0", font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
              Editar cria uma versão nova (a anterior continua guardada). Duplicar cria outro material com o mesmo conteúdo{m.card_id ? " e um ID de card novo" : ""}.
            </p>
          </Section>

          <Section title="Dados">
            <KeyValue
              items={[
                ["Modelo", `${info.label} · ${info.size}`],
                ["Especialidade", `${m.specialty_label} (${m.specialty_key})`],
                ["ID do card", m.card_id ?? undefined],
                ["Lote e ordem", m.batch_label ? `${m.batch_label} · ${m.batch_order}` : m.card_id ? String(m.batch_order) : undefined],
                ["Criado", `${dateTimeBR(m.created_at)} por ${m.created_by_name ?? "—"}`],
                ["Atualizado", `${dateTimeBR(m.updated_at)} por ${m.updated_by_name ?? "—"}`],
                ["Atualização do conteúdo", current?.content?.atualizacao || undefined],
                ["Gerado em", current?.rendered_at ? dateTimeBR(current.rendered_at) : undefined],
                ["Modelo visual", current?.template_version ?? undefined],
                ["Cópia de", m.duplicated_from ?? undefined],
              ]}
            />
          </Section>

          <Section title="Versões">
            <div style={{ display: "flex", flexDirection: "column" }}>
              {m.versions.map((v) => (
                <div key={v.id} style={{ borderTop: "1px solid var(--border-subtle)", padding: "10px 0", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>Versão {v.version}</strong>
                    <StatusBadge map={STATUS} value={v.render_status} />
                    <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                      {dateTimeBR(v.created_at)} · {v.created_by_name ?? "—"}
                      {v.note ? ` · ${v.note}` : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {v.files.map((f) => (
                      <Button key={f.id} variant="ghost" size="sm" icon="download" disabled={v.render_status !== "ready"} onClick={() => act.run(() => download(backend, f, m, v.version), "Download iniciado.")}>
                        {fileLabel(f)}
                      </Button>
                    ))}
                    <Button variant="ghost" size="sm" icon="pencil" onClick={() => go("visuais", { id, editar: String(v.version) })}>
                      Abrir no editor
                    </Button>
                    {v.version !== m.current_version && (
                      <Button variant="ghost" size="sm" icon="refresh-cw" onClick={() => regenerate(v.version)}>
                        Gerar esta versão
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
