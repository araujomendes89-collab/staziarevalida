// Conflitos entre fontes oficiais: os dois lados lado a lado e a decisão do administrador, sempre com motivo.
// Nada é escolhido em silêncio e nenhuma evidência é apagada.
import React from "react";
import { Badge, Banner, Button, EmptyState, SegmentedControl } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, TextArea, useLoad } from "../common.jsx";
import { Label, Pre, Section, useAction, when } from "./ui.jsx";

const STATUS = { open: "Abertos", resolved: "Decididos", deferred: "Adiados" };

export function Conflicts({ isAdmin }) {
  const { backend } = useSession();
  const [status, setStatus] = React.useState("open");
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_conflicts", { p_status: status }), [backend, status]);
  const act = useAction();
  return (
    <Section
      title="Conflitos entre fontes"
      action={
        <Button size="sm" variant="secondary" icon="search" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_conflicts_detect"), "Busca concluída.").then((n) => n !== undefined && reload())}>
          Procurar conflitos
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Banner tone="info" icon="scale">
          Quando duas fontes oficiais vigentes discordam sobre a mesma afirmação, o sistema não escolhe. Um administrador decide, com motivo, e a decisão fica registrada. A evidência das duas fontes continua guardada.
        </Banner>
        <SegmentedControl label="Situação" value={status} onChange={setStatus} options={Object.entries(STATUS).map(([value, label]) => ({ value, label }))} />
        {act.feedback}
        {error && <LoadError error={error} retry={reload} />}
        {!data && !error && <Loading />}
        {data?.length === 0 && <EmptyState icon="scale" title="Nenhum conflito aqui" description="Cadastre fontes oficiais, vincule evidências e use “Procurar conflitos”." />}
        {(data ?? []).map((k) => (
          <ConflictItem key={k.id} item={k} isAdmin={isAdmin} onChanged={reload} />
        ))}
      </div>
    </Section>
  );
}

function Side({ side, label, chosen }) {
  return (
    <div style={{ flex: "1 1 280px", border: `1px solid ${chosen ? "var(--success-border)" : "var(--border-subtle)"}`, borderRadius: 14, padding: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge size="sm" tone="info">{label}</Badge>
        {side.authority && <Badge size="sm">nível {side.authority}</Badge>}
        {chosen && <Badge size="sm" tone="success">escolhida</Badge>}
      </div>
      <div style={{ font: "var(--type-body-sm)", marginTop: 6 }}><strong>{side.title}</strong> · {side.organ}{side.version ? ` · versão ${side.version}` : ""}</div>
      {side.published_on && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>publicada em {new Date(side.published_on + "T12:00:00").toLocaleDateString("pt-BR")}</div>}
      {side.quote && <Pre>{side.quote}</Pre>}
    </div>
  );
}

function ConflictItem({ item: k, isAdmin, onChanged }) {
  const { backend } = useSession();
  const [note, setNote] = React.useState("");
  const act = useAction();
  const decide = (status, chosen, done) => act.run(() => backend.rpc("app_ch_conflict_decide", { p_conflict_id: k.id, p_status: status, p_chosen_source: chosen, p_note: note }), done).then((r) => r && onChanged());
  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge size="sm" tone="danger">{k.nature}</Badge>
        {k.questions > 0 && <Badge size="sm" tone="warning">{k.questions} questão(ões) dependem desta afirmação</Badge>}
        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>detectado em {when(k.detected_at)}</span>
      </div>
      <Label>Afirmação</Label>
      <div style={{ font: "var(--type-body-sm)" }}>{k.statement}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
        <Side side={k.a} label="Fonte que sustenta" chosen={k.chosen_source === k.a.source_id} />
        <Side side={k.b} label="Fonte que discorda" chosen={k.chosen_source === k.b.source_id} />
      </div>
      {k.resolution && (
        <>
          <Label>Decisão registrada {k.decided_at ? `em ${when(k.decided_at)}` : ""}</Label>
          <Pre>{k.resolution}</Pre>
        </>
      )}
      {k.status !== "resolved" && isAdmin && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <TextArea label="Motivo da decisão (obrigatório)" value={note} onChange={setNote} rows={2} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" disabled={note.trim().length < 10} loading={act.busy} onClick={() => decide("resolved", k.a.source_id, "Decisão registrada: vale a fonte que sustenta.")}>Vale a fonte que sustenta</Button>
            <Button size="sm" variant="secondary" disabled={note.trim().length < 10} loading={act.busy} onClick={() => decide("resolved", k.b.source_id, "Decisão registrada: vale a fonte que discorda.")}>Vale a fonte que discorda</Button>
            <Button size="sm" variant="ghost" disabled={note.trim().length < 10} loading={act.busy} onClick={() => decide("deferred", null, "Conflito adiado.")}>Adiar</Button>
          </div>
        </div>
      )}
      {act.feedback}
    </div>
  );
}
