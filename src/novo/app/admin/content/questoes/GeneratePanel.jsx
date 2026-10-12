// "Gerar": a equipe pede questões novas sobre um tema (ou os temas mais cobrados). O custo aparece antes; o servidor monta cada
// questão só com trechos de fontes oficiais e entrega como rascunho aguardando revisão médica.
import React from "react";
import { Badge, Button, SegmentedControl, SelectField, TextField } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { LoadError, Loading, useLoad } from "../../common.jsx";
import { hubPost } from "../api.js";
import { AREA_LABEL } from "../labels.js";
import { Section, useAction, when } from "../ui.jsx";
import { CostBox } from "./CostBox.jsx";
import { AREAS, TAREFA, VAGA, usd } from "./labels.js";

export function GeneratePanel({ acervo, onCreated }) {
  const { backend } = useSession();
  const [mode, setMode] = React.useState("tema");
  const [area, setArea] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [count, setCount] = React.useState("3");
  const [estimate, setEstimate] = React.useState(null);
  const act = useAction();
  const noSource = acervo === 0;
  const quantidade = Number(count);
  const valid = Number.isInteger(quantidade) && quantidade >= 1 && quantidade <= 20 && (mode === "mais_cobrados" || (area && topic));
  const topics = useLoad(() => (mode === "tema" && area ? backend.rpc("app_staziamed_topics", { p_area: area }) : Promise.resolve([])), [backend, mode, area]);
  const requests = useLoad(() => backend.rpc("app_staziamed_requests", { p_limit: 8 }), [backend]);
  const body = { modo: mode, area: area || null, tema: mode === "tema" ? topic : null, quantidade };
  const changed = (fn) => (v) => (setEstimate(null), fn(v));

  const calc = () => act.run(async () => setEstimate(await hubPost(backend, "/questoes-staziamed/estimativa", { acao: "gerar", quantidade })), "Custo calculado.");
  const create = () =>
    act
      .run(async () => {
        await hubPost(backend, "/questoes-staziamed/pedidos", body);
        setEstimate(null);
      }, "Pedido na fila. As questões aparecem na lista abaixo como rascunhos, aguardando revisão médica.")
      .then(() => (requests.reload(), onCreated?.()));

  return (
    <Section title="Gerar questões novas">
      <p style={{ margin: "0 0 12px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        A IA escreve cada questão só com trechos de fontes oficiais cadastradas (nível A a D, em vigor) e confere o resultado. Nada vai para o aluno sem a aprovação de um revisor médico e a publicação do administrador.
      </p>
      {noSource && <p style={{ margin: "0 0 12px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Sem fonte oficial com trechos no acervo, "Gerar" fica desligado e não gasta nada.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SegmentedControl label="O que gerar" value={mode} onChange={changed(setMode)} options={[{ value: "tema", label: "Tema" }, { value: "mais_cobrados", label: "Temas mais cobrados" }]} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ width: 240 }}>
            <SelectField
              label={mode === "tema" ? "Área" : "Área (opcional)"}
              value={area}
              onChange={(e) => (setTopic(""), changed(setArea)(e.target.value))}
              options={[{ value: "", label: mode === "tema" ? "Escolha a área" : "Todas as áreas" }, ...AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] ?? a }))]}
            />
          </div>
          {mode === "tema" && (
            <div style={{ width: 360 }}>
              <SelectField
                label="Tema"
                value={topic}
                disabled={!area}
                onChange={(e) => changed(setTopic)(e.target.value)}
                options={[{ value: "", label: area ? "Escolha o tema" : "Escolha a área primeiro" }, ...(topics.data ?? []).map((t) => ({ value: t.topic, label: `${t.topic} (${t.total} em provas)` }))]}
              />
            </div>
          )}
          <div style={{ width: 130 }}>
            <TextField label="Quantidade (1 a 20)" type="number" min={1} max={20} value={count} onChange={(e) => changed(setCount)(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button size="sm" variant="secondary" icon="calculator" disabled={noSource || !valid} loading={act.busy} onClick={calc}>
            Calcular custo
          </Button>
          <Button size="sm" icon="sparkles" disabled={noSource || !valid || !estimate} loading={act.busy} onClick={create}>
            Confirmar e gerar
          </Button>
        </div>
        <CostBox estimate={estimate} />
        {act.feedback}
      </div>
      <h4 style={{ margin: "20px 0 8px", font: "var(--type-h5)" }}>Pedidos recentes</h4>
      {requests.error && <LoadError error={requests.error} retry={requests.reload} />}
      {!requests.data && !requests.error && <Loading />}
      {requests.data?.length === 0 && <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Nenhum pedido ainda.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(requests.data ?? []).map((r) => (
          <div key={r.id} style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", font: "var(--type-body-sm)" }}>
              <Badge size="sm" tone={r.state === "concluido" ? "success" : "info"}>{r.state === "concluido" ? "concluído" : r.state === "gerando" ? "gerando" : "na fila"}</Badge>
              <strong>{r.mode === "tema" ? `${r.topic} (${AREA_LABEL[r.area] ?? r.area})` : `Temas mais cobrados${r.area ? ` · ${AREA_LABEL[r.area] ?? r.area}` : ""}`}</strong>
              <span style={{ color: "var(--text-tertiary)" }}>
                {r.count} {r.count === 1 ? "questão" : "questões"} · {when(r.created_at)} · {r.created_by_email}
                {r.cost_usd > 0 ? ` · ${usd(r.cost_usd)}` : ""}
              </span>
              <Badge size="sm" tone="success">{r.summary.geradas} geradas</Badge>
              <Badge size="sm" tone="warning">{r.summary.puladas} puladas</Badge>
              <Badge size="sm" tone="danger">{r.summary.descartadas} descartadas</Badge>
            </div>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, font: "var(--type-body-sm)" }}>
              {r.slots.map((s) => (
                <li key={s.slot}>
                  Vaga {s.slot} ({AREA_LABEL[s.area] ?? s.area}, {s.topic}; resposta {s.target}): <Badge size="sm" tone={VAGA[s.state]?.[1] ?? "neutral"}>{VAGA[s.state]?.[0] ?? s.state}</Badge>
                  {s.reason ? <span> {s.state === "pulada" ? "— " : "— "}{s.reason}</span> : null}
                  {s.job_status && !["gerada", "pulada", "descartada"].includes(s.state) ? <span style={{ color: "var(--text-tertiary)" }}> · tarefa {TAREFA[s.job_status] ?? s.job_status}{s.job_error ? `: ${s.job_error}` : ""}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
