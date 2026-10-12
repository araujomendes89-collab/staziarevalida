// Configuração da Central: o que está pronto, o que é pendência real, credenciais a cadastrar,
// consumo e custo das chamadas de IA (piloto) e revisores médicos por área.
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Banner, Button, Checkbox, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { dateTimeBR, LoadError, Loading, useDebounced, useLoad } from "../common.jsx";
import { AREA_LABEL, STEP_LABEL } from "./labels.js";
import { KeyValue, ModelBadge, Section, useAction } from "./ui.jsx";
import { aiGet, PROVIDER_NAME, usd } from "../ai/aiApi.js";

const CREDENTIALS = [
  ["CONTENT_HUB_AI_PROVIDER", "a IA de cada função é escolhida em Administração › Central de IAs. Enquanto uma função não estiver salva lá, valem esta variável (anthropic, gemini ou openai; o modo mock só existe fora de produção) e as específicas CONTENT_HUB_AI_PROVIDER_CREATE (criação, engenharia reversa e assistentes) e CONTENT_HUB_VERIFIER_PROVIDER (verificação)"],
  ["CONTENT_HUB_AI_FALLBACK_PROVIDER", "provedor secundário: usado se o principal falhar depois de uma nova tentativa (conferentes só aceitam outra família que a do criador)"],
  ["OPENAI_API_KEY e CONTENT_HUB_OPENAI_MODEL", "provedor OpenAI: a chave e o modelo (o modelo é obrigatório, nunca é adivinhado)"],
  ["CONTENT_LAB_ENABLED=false / CONTENT_LAB_AI_ENABLED=false", "desliga o módulo ou só a IA direto no servidor (vale mais que o painel)"],
  ["CONTENT_HUB_AI_ALLOW_EXTERNAL=1", "autorização explícita para enviar trechos dos PDFs ao provedor de IA"],
  ["ANTHROPIC_API_KEY ou GEMINI_API_KEY", "chave do provedor escolhido (só no servidor)"],
  ["CONTENT_HUB_ANTHROPIC_MODEL / CONTENT_HUB_GEMINI_MODEL", "modelo (opcional; registrado em cada execução)"],
  ["CONTENT_HUB_PRICE_INPUT_PER_MTOK e _OUTPUT_PER_MTOK", "preço por milhão de tokens, para medir o custo do piloto"],
  ["SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY", "produção: banco e arquivos (bucket privado content-hub); nunca com prefixo VITE_"],
  ["CONTENT_HUB_PYTHON", "comando Python com PyMuPDF e Tesseract (padrão: pdfpython)"],
  ["CONTENT_HUB_FONT_DIR", "arquivos da fonte Plus Jakarta Sans para os PDFs"],
  ["CONTENT_HUB_EMBEDDINGS_ALLOW_EXTERNAL=1 e GEMINI_API_KEY", "busca por significado (Gemini Embedding 2): autoriza enviar os textos das fontes e as buscas ao Google; vale no servidor e no processamento"],
  ["CONTENT_HUB_EMBEDDINGS_MODEL", "modelo da busca por significado (padrão gemini-embedding-2; off desliga)"],
];

const FLAGS = [
  ["enabled", "Content Lab ligado", "Desligado: nenhuma função da equipe responde (o app do aluno não muda)."],
  ["ai_enabled", "IA ligada", "Desligado: o servidor não chama nenhum provedor de IA."],
  ["shadow_mode", "Modo sombra", "Ligado: a IA analisa e sugere, mas nada é publicado."],
  ["publish_enabled", "Publicação ligada", "Desligado: nenhuma unidade pode ser publicada, mesmo aprovada."],
  ["auto_analysis_enabled", "Análise automática", "Reservado: análise sem comando manual (ainda não usado)."],
  ["notebook_provider_enabled", "Provedor NotebookLM", "Reservado: integração futura, nunca é banco principal."],
];

/** Sinalizadores do Content Lab: a trava está no banco; só administrador muda, com motivo. */
function Flags({ isAdmin }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_flags"), [backend]);
  const [reason, setReason] = React.useState("");
  const act = useAction();
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const toggle = (key, value) => act.run(() => backend.rpc("app_ch_set_flag", { p_key: key, p_value: value, p_reason: reason }), "Sinalizador atualizado e registrado na auditoria.").then((r) => r && (setReason(""), reload()));
  return (
    <Section title="Sinalizadores do Content Lab">
      {data.shadow_mode && <Banner tone="info" icon="eye">Modo sombra ligado: a IA analisa e sugere, mas nada é publicado.</Banner>}
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {FLAGS.map(([key, label, hint]) => (
          <div key={key} style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid var(--border-subtle)" }}>
            <div>
              <strong>{label}</strong> <Badge size="sm" tone={data[key] ? "success" : "neutral"}>{data[key] ? "ligado" : "desligado"}</Badge>
              <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{hint}</div>
            </div>
            {isAdmin && (
              <Button size="sm" variant="secondary" disabled={reason.trim().length < 10} loading={act.busy} onClick={() => toggle(key, !data[key])}>
                {data[key] ? "Desligar" : "Ligar"}
              </Button>
            )}
          </div>
        ))}
      </div>
      {isAdmin && <TextField label="Motivo da mudança (obrigatório, fica na auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} />}
      {act.feedback}
    </Section>
  );
}

/** Versões de prompt que já rodaram (texto guardado no banco para reproduzir resultados). */
function Prompts() {
  const { backend } = useSession();
  const { data } = useLoad(() => backend.rpc("app_ch_prompt_versions"), [backend]);
  if (!data) return null;
  return (
    <Section title="Prompts em uso">
      {data.length === 0 ? (
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Nenhum prompt registrado ainda: o registro acontece na primeira execução de IA.</p>
      ) : (
        <KeyValue items={data.map((p) => [`${p.prompt_id} v${p.version}`, <code key={p.content_hash}>{p.content_hash.slice(0, 10)}…</code>])} />
      )}
    </Section>
  );
}

/** Busca por significado: ligada aqui e quantos trechos das fontes já têm vetor (o processamento gera aos poucos). */
function embeddingsLabel(status) {
  const e = status.embeddings;
  if (!e?.ready) return "desligada: a busca de evidências usa só palavras (veja as pendências)";
  const count = e.passages == null ? "" : e.passages === 0 ? " · nenhum trecho de fonte cadastrado ainda" : ` · ${e.embedded} de ${e.passages} trechos com vetor`;
  return `ligada (${e.model})${count}${e.vector_index === false ? " · sem índice pgvector" : ""}`;
}

/** Onde o processamento roda e quando deu sinal (o servidor do site na Vercel não processa). */
function processingLabel(status) {
  if (status.worker) return "ligado neste servidor";
  const p = status.processing;
  if (!p?.where) return "ainda não implantado (tarefa no Google Cloud Run)";
  const where = p.where === "cloud_run" ? "Google Cloud Run" : p.where;
  return `${where} · último relato ${dateTimeBR(p.reported_at)}${p.stale ? " (parado)" : ""}`;
}


/** Resumo da Central de IAs (a equipe vê o resumo; só o administrador abre a Central). */
function AiSummary({ isAdmin }) {
  const { backend } = useSession();
  const [, setParams] = useSearchParams();
  const { data, error } = useLoad(() => aiGet(backend, "/summary"), [backend]);
  if (error) return <span>{error.message}</span>;
  if (!data) return <span>Carregando…</span>;
  const configured = (data.functions ?? []).filter((f) => f.configured).length;
  // o total vem da lista que o banco devolve (hoje 7 funções, com a Busca de fontes oficiais), não de um número fixo
  const total = (data.functions ?? []).length;
  const names = (data.providers_enabled ?? []).map((id) => PROVIDER_NAME[id] ?? id).join(", ") || "nenhuma";
  return (
    <span style={{ display: "inline-flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span>{`Funções configuradas: ${configured} de ${total} · IAs ligadas: ${names} · Gasto do mês: ${usd(data.month_spend)}`}</span>
      {isAdmin && (
        <Button size="sm" variant="secondary" icon="bot" onClick={() => setParams({ aba: "ias" })}>
          Abrir a Central de IAs
        </Button>
      )}
    </span>
  );
}

export function HubSettings({ isAdmin, status }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Flags isAdmin={isAdmin} />
      <Prompts />
      <Section title="Situação do servidor">
        {!status && <Loading />}
        {status && !status.error && (
          <KeyValue
            items={[
              ["Banco e arquivos", status.storage === "dev" ? "desenvolvimento (.data no servidor)" : "Supabase"],
              ["IA", <AiSummary key="ai" isAdmin={isAdmin} />],
              ["Processamento (leitura de PDF, OCR e arquivos finais)", processingLabel(status)],
              ["Renderizador de PDF", status.renderer ? "pronto (Chromium)" : status.worker || status.processing?.where ? "indisponível" : "sem relato do processamento"],
              ["Identidade visual", status.brand?.pending?.length ? status.brand.pending.join(" ") : status.brand?.version ? `completa (${status.brand.version})` : "sem relato do processamento"],
              ["Busca por significado", embeddingsLabel(status)],
            ]}
          />
        )}
      </Section>
      <Section title="Credenciais e configurações a cadastrar no servidor">
        <p style={{ margin: "0 0 8px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Ficam no arquivo .env do servidor (ou no painel do provedor de hospedagem). Nenhuma delas vai para o navegador.</p>
        <KeyValue items={CREDENTIALS} />
      </Section>
      {isAdmin && <Usage />}
      {isAdmin && <Reviewers />}
    </div>
  );
}

function Usage() {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_ai_usage"), [backend]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const cell = { padding: "6px 8px", borderBottom: "1px solid var(--border-subtle)" };
  return (
    <Section title="Consumo e custo da IA">
      {data.by_step.length === 0 && <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Nenhuma chamada registrada.</p>}
      {data.by_step.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", font: "var(--type-body-sm)" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
                {["Etapa", "Modelo", "Chamadas", "Ok", "Com recusas", "Fora do formato", "Falhas", "Tokens (entrada/saída)", "Custo", "Tempo médio"].map((h) => (
                  <th key={h} style={cell}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.by_step.map((r, i) => (
                <tr key={i}>
                  <td style={cell}>{STEP_LABEL[r.step] ?? r.step}</td>
                  <td style={cell}>
                    <ModelBadge model={r.model} />
                  </td>
                  <td style={cell}>{r.calls}</td>
                  <td style={cell}>{r.ok}</td>
                  <td style={cell}>{r.rejected_by_check}</td>
                  <td style={cell}>{r.invalid_output}</td>
                  <td style={cell}>{r.failed}</td>
                  <td style={cell}>
                    {r.input_tokens ?? "—"} / {r.output_tokens ?? "—"}
                  </td>
                  <td style={cell}>{r.cost_known ? `US$ ${Number(r.cost_usd).toFixed(4)}${r.cost_known < r.calls ? " (parcial)" : ""}` : "sem preço configurado"}</td>
                  <td style={cell}>{r.avg_latency_ms != null ? `${(r.avg_latency_ms / 1000).toFixed(1)} s` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {Object.entries(data.jobs).map(([k, n]) => (
          <Badge key={k} size="sm">
            etapas {k}: {n}
          </Badge>
        ))}
      </div>
    </Section>
  );
}

function Reviewers() {
  const { backend } = useSession();
  const list = useLoad(() => backend.rpc("app_ch_reviewers"), [backend]);
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search);
  const found = useLoad(() => (q.trim().length >= 3 ? backend.rpc("app_admin_users", { p_search: q.trim(), p_limit: 8 }) : Promise.resolve(null)), [backend, q]);
  const [user, setUser] = React.useState(null);
  const [areas, setAreas] = React.useState(new Set());
  const act = useAction();
  const choose = (u) => {
    setUser(u);
    setAreas(new Set(list.data?.find((r) => r.user_id === u.id)?.areas ?? []));
  };
  const users = found.data?.items ?? [];
  return (
    <Section title="Revisores médicos por área">
      <p style={{ margin: "0 0 8px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>A aprovação médica de uma unidade só é aceita de um revisor cadastrado na área dela. Nenhum revisor é criado automaticamente.</p>
      {list.error && <LoadError error={list.error} retry={list.reload} />}
      {(list.data ?? []).length === 0 && list.data && <Banner tone="warning">Nenhum revisor médico cadastrado: nada pode receber aprovação médica ainda.</Banner>}
      {(list.data ?? []).map((r) => (
        <div key={r.user_id} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--border-subtle)" }}>
          <button type="button" className="sm-btn sm-btn--ghost sm-btn--sm" onClick={() => choose({ id: r.user_id, email: r.email })}>
            {r.email}
          </button>
          {r.areas.map((a) => (
            <Badge key={a} size="sm" tone="brand">
              {AREA_LABEL[a] ?? a}
            </Badge>
          ))}
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        <TextField label="Buscar pessoa pelo e-mail ou nome" icon="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {users.map((u) => (
        <button key={u.id ?? u.user_id} type="button" className="sm-btn sm-btn--ghost sm-btn--sm" onClick={() => choose({ id: u.id ?? u.user_id, email: u.email })}>
          {u.email} {u.name ? `· ${u.name}` : ""}
        </button>
      ))}
      {user && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, padding: 12, border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}>
          <strong>{user.email}</strong>
          {Object.entries(AREA_LABEL).map(([code, label]) => (
            <Checkbox
              key={code}
              label={label}
              checked={areas.has(code)}
              onChange={(e) => setAreas((s) => {
                const next = new Set(s);
                e.target.checked ? next.add(code) : next.delete(code);
                return next;
              })}
            />
          ))}
          <div>
            <Button size="sm" icon="check" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_set_reviewer_areas", { p_user_id: user.id, p_area_codes: [...areas] }), "Áreas de revisão salvas.").then((r) => r !== undefined && (setUser(null), list.reload()))}>
              Salvar áreas
            </Button>
          </div>
        </div>
      )}
      {act.feedback}
    </Section>
  );
}
