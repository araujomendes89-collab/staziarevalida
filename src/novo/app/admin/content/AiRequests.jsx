// Pedir a IA pela tela (sem linha de comando): "Gerar análises com IA" (aba Análise de questões) e "Conferir com IA" (aba Questões
// inéditas). Antes de confirmar, a tela mostra quantas entram e quanto deve custar em dólares; o limite por pedido e por dia
// está no banco. Nada é publicado nem aprovado por aqui: a IA só rascunha e triagem, quem decide é o revisor médico.
import React from "react";
import { Badge, Banner, Button, Checkbox, ProgressBar, SelectField, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { usd } from "../ai/aiApi.js";
import { LoadError, Loading, messageOf, useLoad } from "../common.jsx";
import { Section, useAction, when } from "./ui.jsx";

const caption = { font: "var(--type-caption)", color: "var(--text-tertiary)" };
const ACTIVE = new Set(["na_fila", "analisando", "pendente"]);
const REQUEST_STATUS = { na_fila: ["Na fila", "neutral"], analisando: ["Analisando", "info"], concluido: ["Concluído", "success"], falhou: ["Falhou", "danger"], pendente: ["Aguardando a IA", "warning"] };
const KIND_WORD = { question_analysis: ["questão", "questões", "analisada", "analisadas"], draft_check: ["rascunho", "rascunhos", "conferido", "conferidos"] };
const LAYER_LABEL = { software: "Regras (sem IA)", sources: "Fontes oficiais", currency: "Atualidade", redteam: "Revisão clínica independente (IA)" };

/** O site novo pode estar no ar antes do SQL novo: a função ainda não existe no banco. */
export const isMissingFunction = (error) => /could not find the function|schema cache|PGRST202|does not exist|42883/i.test(String(error?.message ?? ""));
const MISSING = "Este recurso ainda não está disponível: o sistema está aguardando uma atualização. Avise quem cuida do sistema e tente de novo depois; o resto da tela funciona normalmente.";

function MissingNotice() {
  return (
    <Banner tone="warning" icon="triangle-alert" title="Pedido de IA ainda indisponível">
      {MISSING}
    </Banner>
  );
}

const money = (v) => (v == null ? null : usd(v));

/** Estimativa de custo mostrada antes de confirmar. */
function EstimateLine({ estimate, count }) {
  if (!estimate || !count) return null;
  if (estimate.calls === 0) return <span style={caption}>Só regras de software: sem chamada de IA e sem custo.</span>;
  if (estimate.typical_usd == null) {
    return <span style={caption}>Custo em dólares: não foi possível estimar, e sem isso o pedido não é aceito. {estimate.note ?? ""}</span>;
  }
  return (
    <span data-testid="estimate" style={{ font: "var(--type-body-sm)" }}>
      Custo estimado: <strong>≈ {money(estimate.typical_usd)}</strong> (no máximo {money(estimate.max_usd)}) · {estimate.calls} chamada(s) de IA
      {estimate.model ? ` · ${estimate.model}` : ""}. Calculado pela tabela de preços da Central de IAs; o gasto real aparece no pedido e na Central de IAs.
      {estimate.note ? ` ${estimate.note}` : ""}
    </span>
  );
}

/** Pedidos recentes do tipo, com o andamento. Recarrega sozinho enquanto algum anda. */
export function RecentRequests({ kind, reloadKey = 0, onSettled }) {
  const { backend } = useSession();
  const act = useAction();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_ai_requests", { p_kind: kind, p_limit: 8 }), [backend, kind, reloadKey]);
  const items = Array.isArray(data) ? data : [];
  const running = items.some((r) => ACTIVE.has(r.status));
  const seen = React.useRef(new Map());
  React.useEffect(() => {
    // avisa quando um pedido que andava termina (as listas de baixo recarregam)
    for (const r of items) {
      const was = seen.current.get(r.id);
      if (was && ACTIVE.has(was) && !ACTIVE.has(r.status)) onSettled?.(r);
      seen.current.set(r.id, r.status);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  React.useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(reload, 10000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  if (error && isMissingFunction(error)) return null;
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  if (items.length === 0) return <span style={caption}>Nenhum pedido ainda.</span>;
  const [one, many] = KIND_WORD[kind];
  const cancel = (r) => act.run(() => backend.rpc("app_ch_ai_request_cancel", { p_id: r.id }), "Pedido cancelado.").then((x) => x && reload());
  return (
    <div data-testid="ai-requests" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((r) => {
        const [label, tone] = REQUEST_STATUS[r.status] ?? [r.status, "neutral"];
        return (
          <div key={r.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Badge size="sm" tone={tone}>{label}</Badge>
              <span style={{ font: "var(--type-body-sm)" }}>
                {r.item_count} {r.item_count === 1 ? one : many} · pedido em {when(r.created_at)}
                {r.requested_by_email ? ` por ${r.requested_by_email}` : ""}
              </span>
              {r.kind === "draft_check" && Array.isArray(r.params?.layers) && <span style={caption}>{r.params.layers.map((l) => LAYER_LABEL[l] ?? l).join(", ")}</span>}
            </div>
            {(r.status === "analisando" || r.status === "concluido" || r.done_count > 0) && (
              <ProgressBar value={r.done_count} max={Math.max(r.item_count, 1)} label={`${r.done_count} de ${r.item_count}`} />
            )}
            {(r.cost_usd > 0 || r.calls > 0) && (
              <span style={caption}>
                Gasto até agora: {usd(r.cost_usd)} em {r.calls} chamada(s)
                {r.estimate_usd != null ? ` (estimado ${usd(r.estimate_usd)})` : ""}.
              </span>
            )}
            {r.message && <span style={{ font: "var(--type-body-sm)", color: r.status === "falhou" ? "var(--text-danger, inherit)" : "var(--text-secondary)" }}>{r.message}</span>}
            {r.status === "concluido" && r.kind === "question_analysis" && r.done_count > 0 && (
              <span style={caption}>As análises estão em "Rascunhos" e "Para revisar" abaixo. Nada foi publicado: o aluno só vê depois que um revisor médico aprovar.</span>
            )}
            {r.status === "concluido" && r.kind === "draft_check" && (
              <span style={caption}>O selo de triagem de cada rascunho foi atualizado. A IA não aprova: quem decide é o revisor médico.</span>
            )}
            {r.can_cancel && (
              <div>
                <Button size="sm" variant="secondary" loading={act.busy} onClick={() => cancel(r)}>Cancelar pedido</Button>
              </div>
            )}
          </div>
        );
      })}
      {act.feedback}
    </div>
  );
}

/** Seção "Gerar análises com IA" (topo da aba Análise de questões). */
export function GenerateAnalyses({ exams = [], onSettled }) {
  const { backend } = useSession();
  const [exam, setExam] = React.useState("");
  const [count, setCount] = React.useState("3");
  const [onlyMissing, setOnlyMissing] = React.useState(true);
  const [tick, setTick] = React.useState(0);
  const [result, setResult] = React.useState(null);
  const act = useAction();
  const n = Number(count);
  const valid = Number.isInteger(n) && n >= 1 && n <= 50;
  const args = { p_exam: exam || null, p_count: valid ? n : 3, p_only_missing: onlyMissing, p_area: null };
  const preview = useLoad(() => backend.rpc("app_ch_question_analysis_preview", args), [backend, exam, valid ? n : 3, onlyMissing, tick]);
  const changeCount = (value) => {
    const digits = value.replace(/\D/g, "");
    setCount(digits === "" ? "" : String(Math.min(50, Math.max(1, Number(digits)))));
  };
  if (preview.error && isMissingFunction(preview.error)) return <MissingNotice />;
  const p = preview.data;
  const blockedToday = p && p.remaining_today < (p.will_analyze ?? 0);
  const priced = !p || p.estimate.calls === 0 || p.estimate.typical_usd != null;
  const canAsk = Boolean(p && valid && p.ai.ready && priced && p.will_analyze > 0 && !blockedToday);
  const submit = () =>
    act
      .run(async () => {
        setResult(null);
        const r = await backend.rpc("app_ch_question_analysis_request", args);
        setResult(r);
        return r;
      }, null)
      .then((r) => r && setTick((t) => t + 1));
  return (
    <Section title="Gerar análises com IA">
      <div data-testid="generate-analyses" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          A IA escreve a análise das quatro alternativas de questões antigas e as regras do sistema conferem. Tudo entra como rascunho: nada vai ao aluno até um revisor médico da área aprovar, e o gabarito oficial nunca é alterado.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ width: 260 }}>
            <SelectField label="Prova a analisar" value={exam} onChange={(e) => setExam(e.target.value)} options={[{ value: "", label: "Todas as provas" }, ...exams.map((x) => ({ value: x.id, label: x.title }))]} />
          </div>
          <div style={{ width: 200 }}>
            <TextField label="Quantas questões (1 a 50)" type="number" inputMode="numeric" min="1" max="50" value={count} onChange={(e) => changeCount(e.target.value)} />
          </div>
          <Checkbox label="Só questões ainda sem análise" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
        </div>
        {preview.error && <LoadError error={preview.error} retry={preview.reload} />}
        {!p && !preview.error && <Loading />}
        {p && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--type-body-sm)" }}>
              <strong>{p.will_analyze}</strong> {p.will_analyze === 1 ? "questão entra" : "questões entram"} neste pedido ({p.available} disponíveis com estes filtros). Limite: {p.limits.per_request} por pedido e {p.limits.per_day} por dia por pessoa; hoje ainda restam {p.remaining_today}.
            </span>
            <EstimateLine estimate={p.estimate} count={p.will_analyze} />
            {!p.ai.ready && <Banner tone="warning" icon="triangle-alert">{p.ai.reason}</Banner>}
            {blockedToday && <Banner tone="warning">Seu limite de hoje não comporta este pedido. Peça menos questões ou volte amanhã.</Banner>}
            {p.will_analyze === 0 && p.ai.ready && <span style={caption}>Nenhuma questão para analisar com estes filtros.</span>}
          </div>
        )}
        {act.feedback}
        {result?.duplicate && <Banner tone="info">Já existe um pedido igual andando. Acompanhe abaixo.</Banner>}
        {result && !result.duplicate && (
          <Banner tone="success">{`Pedido enviado: ${result.items} questão(ões)${result.estimate_usd != null ? `, custo estimado ≈ ${usd(result.estimate_usd)}` : ""}. A análise roda no servidor (alguns minutos); pode sair da tela.`}</Banner>
        )}
        <div>
          <Button icon="sparkles" disabled={!canAsk} loading={act.busy} onClick={submit}>
            Pedir análise
          </Button>
        </div>
        <div>
          <div style={{ ...caption, marginBottom: 6 }}>PEDIDOS RECENTES</div>
          <RecentRequests kind="question_analysis" reloadKey={tick} onSettled={onSettled} />
        </div>
      </div>
    </Section>
  );
}

/** Seção "Conferir com IA" (topo da aba Questões inéditas). */
export function CheckDrafts({ batches = [], batchName = (b) => b, areaOptions = [], onSettled }) {
  const { backend } = useSession();
  const [batch, setBatch] = React.useState("");
  const [area, setArea] = React.useState("");
  const [count, setCount] = React.useState("10");
  const [layers, setLayers] = React.useState({ sources: false, currency: false, redteam: false });
  const [recheck, setRecheck] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [result, setResult] = React.useState(null);
  const act = useAction();
  const n = Number(count);
  const valid = Number.isInteger(n) && n >= 1 && n <= 20;
  const picked = ["software", ...Object.keys(layers).filter((k) => layers[k])];
  const args = { p_batch: batch || null, p_area: area || null, p_count: valid ? n : 10, p_layers: picked, p_recheck: recheck };
  const preview = useLoad(() => backend.rpc("app_ch_draft_check_preview", args), [backend, batch, area, valid ? n : 10, picked.join(","), recheck, tick]);
  const changeCount = (value) => {
    const digits = value.replace(/\D/g, "");
    setCount(digits === "" ? "" : String(Math.min(20, Math.max(1, Number(digits)))));
  };
  if (preview.error && isMissingFunction(preview.error)) return <MissingNotice />;
  const p = preview.data;
  const blockedToday = p && p.remaining_today < (p.will_check ?? 0);
  const aiOk = p && (!p.ai.needed || p.ai.ready);
  const priced = !p || p.estimate.calls === 0 || p.estimate.typical_usd != null;
  const canAsk = Boolean(p && valid && aiOk && priced && p.will_check > 0 && !blockedToday);
  const submit = () =>
    act
      .run(async () => {
        setResult(null);
        const r = await backend.rpc("app_ch_draft_check_request", args);
        setResult(r);
        return r;
      }, null)
      .then((r) => r && setTick((t) => t + 1));
  const toggle = (k) => (e) => setLayers((l) => ({ ...l, [k]: e.target.checked }));
  return (
    <Section title="Conferir com IA">
      <div data-testid="check-drafts" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          Triagem para o revisor médico não ler tudo do zero. A conferência nunca aprova nem publica: ela só põe um selo em cada rascunho. A IA que confere é sempre de outra empresa que a criadora do rascunho. As regras de software rodam sempre, sem custo.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ width: 220 }}>
            <SelectField label="Lote" value={batch} onChange={(e) => setBatch(e.target.value)} options={[{ value: "", label: "Todos os lotes" }, ...batches.map((b) => ({ value: b.batch, label: batchName(b.batch) }))]} />
          </div>
          <div style={{ width: 220 }}>
            <SelectField label="Área" value={area} onChange={(e) => setArea(e.target.value)} options={[{ value: "", label: "Todas as áreas" }, ...areaOptions]} />
          </div>
          <div style={{ width: 200 }}>
            <TextField label="Quantos rascunhos (1 a 20)" type="number" inputMode="numeric" min="1" max="20" value={count} onChange={(e) => changeCount(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Checkbox label="Regras (sempre)" checked disabled />
          <Checkbox label="Fontes oficiais" checked={layers.sources} onChange={toggle("sources")} />
          <Checkbox label="Atualidade" checked={layers.currency} onChange={toggle("currency")} />
          <Checkbox label="Revisão clínica independente" checked={layers.redteam} onChange={toggle("redteam")} />
          <Checkbox label="Conferir de novo (mesmo os já conferidos)" checked={recheck} onChange={(e) => setRecheck(e.target.checked)} />
        </div>
        {preview.error && <LoadError error={preview.error} retry={preview.reload} />}
        {!p && !preview.error && <Loading />}
        {p && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ font: "var(--type-body-sm)" }}>
              <strong>{p.will_check}</strong> {p.will_check === 1 ? "rascunho entra" : "rascunhos entram"} neste pedido ({p.available} disponíveis com estes filtros). Limite: {p.limits.per_request} por pedido e {p.limits.per_day} por dia por pessoa; hoje ainda restam {p.remaining_today}.
            </span>
            <EstimateLine estimate={p.estimate} count={p.will_check} />
            {p.ai.needed && !p.ai.ready && <Banner tone="warning" icon="triangle-alert">{p.ai.reason}</Banner>}
            {blockedToday && <Banner tone="warning">Seu limite de hoje não comporta este pedido. Peça menos rascunhos ou volte amanhã.</Banner>}
            {p.will_check === 0 && aiOk && <span style={caption}>Nenhum rascunho para conferir com estes filtros. Marque "Conferir de novo" para repetir.</span>}
          </div>
        )}
        {act.feedback}
        {result?.duplicate && <Banner tone="info">Já existe um pedido igual andando. Acompanhe abaixo.</Banner>}
        {result && !result.duplicate && (
          <Banner tone="success">{`Pedido enviado: ${result.items} rascunho(s)${result.estimate_usd != null ? `, custo estimado ≈ ${usd(result.estimate_usd)}` : ""}. A conferência roda no servidor; pode sair da tela.`}</Banner>
        )}
        <div>
          <Button icon="sparkles" disabled={!canAsk} loading={act.busy} onClick={submit}>
            Pedir conferência
          </Button>
        </div>
        <div>
          <div style={{ ...caption, marginBottom: 6 }}>PEDIDOS RECENTES</div>
          <RecentRequests kind="draft_check" reloadKey={tick} onSettled={onSettled} />
        </div>
      </div>
    </Section>
  );
}

export { messageOf };
