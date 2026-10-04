// Configuração da Central: o que está pronto, o que é pendência real, credenciais a cadastrar,
// consumo e custo das chamadas de IA (piloto) e revisores médicos por área.
import React from "react";
import { Badge, Banner, Button, Checkbox, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, useDebounced, useLoad } from "../common.jsx";
import { AREA_LABEL, STEP_LABEL } from "./labels.js";
import { KeyValue, ModelBadge, Section, useAction } from "./ui.jsx";

const CREDENTIALS = [
  ["CONTENT_HUB_AI_PROVIDER", "anthropic ou gemini (o modo mock só existe fora de produção)"],
  ["CONTENT_HUB_AI_ALLOW_EXTERNAL=1", "autorização explícita para enviar trechos dos PDFs ao provedor de IA"],
  ["ANTHROPIC_API_KEY ou GEMINI_API_KEY", "chave do provedor escolhido (só no servidor)"],
  ["CONTENT_HUB_ANTHROPIC_MODEL / CONTENT_HUB_GEMINI_MODEL", "modelo (opcional; registrado em cada execução)"],
  ["CONTENT_HUB_PRICE_INPUT_PER_MTOK e _OUTPUT_PER_MTOK", "preço por milhão de tokens, para medir o custo do piloto"],
  ["SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY", "produção: banco e arquivos (bucket privado content-hub); nunca com prefixo VITE_"],
  ["CONTENT_HUB_PYTHON", "comando Python com PyMuPDF e Tesseract (padrão: pdfpython)"],
  ["CONTENT_HUB_FONT_DIR", "arquivos da fonte Plus Jakarta Sans para os PDFs"],
];

export function HubSettings({ isAdmin, status }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section title="Situação do servidor">
        {!status && <Loading />}
        {status && !status.error && (
          <KeyValue
            items={[
              ["Banco e arquivos", status.storage === "dev" ? "desenvolvimento (.data no servidor)" : "Supabase"],
              ["IA", status.ai?.ready ? <span key="ai">{status.ai.provider} <ModelBadge model={status.ai.model} /></span> : `pendente — ${status.ai?.pending}`],
              ["Renderizador de PDF", status.renderer ? "pronto (Chromium)" : "indisponível"],
              ["Processamento em segundo plano", status.worker ? "ligado" : "desligado"],
              ["Identidade visual", status.brand?.pending?.length ? status.brand.pending.join(" ") : `completa (${status.brand?.version})`],
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
