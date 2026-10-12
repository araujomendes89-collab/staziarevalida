// Fontes oficiais com IA, parte 3: a lista de sites oficiais onde a IA pode procurar.
// A equipe lê; só o administrador acrescenta, edita e desativa (o banco confere). Endereço sem https:// e só em ASCII.
import React from "react";
import { Badge, Button, SelectField, Switch, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { useMobile } from "../../Shell.jsx";
import { LoadError, Loading, useLoad } from "../common.jsx";
import { DOMAIN_KIND } from "./labels.js";
import { Section, useAction } from "./ui.jsx";

const KINDS = Object.entries(DOMAIN_KIND).map(([value, label]) => ({ value, label }));
const KIND_TONE = { governo: "success", internacional: "info", sociedade: "neutral" };

export function OfficialDomains() {
  const { backend } = useSession();
  const mobile = useMobile();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_official_domains"), [backend]);
  const rows = Array.isArray(data) ? data : data?.items ?? [];
  const empty = { address: "", institution: "", kind: "governo" };
  const [form, setForm] = React.useState(empty);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const act = useAction();
  const add = () =>
    act
      .run(() => backend.rpc("app_ch_save_official_domain", { p_domain: { address: form.address.trim(), institution: form.institution.trim(), kind: form.kind, active: true } }), "Site acrescentado à lista.")
      .then((r) => {
        if (!r) return;
        setForm(empty);
        reload();
      });
  return (
    <Section title="Sites oficiais">
      <div data-testid="official-domains" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          A IA só procura (e o servidor só baixa) em endereços desta lista. Um site desativado deixa de valer para novas buscas e para aprovar achados antigos dele.
        </p>
        {error && <LoadError error={error} retry={reload} />}
        {!data && !error && <Loading />}
        <div>
          {rows.map((d) => (
            <DomainRow key={d.id} domain={d} onChanged={reload} />
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
            <TextField label="Endereço do site" value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="ex.: gov.br/saude" hint="Sem https://, só letras sem acento, números, ponto, hífen e barra." />
            <TextField label="Instituição" value={form.institution} onChange={(e) => set({ institution: e.target.value })} />
            <SelectField label="Tipo do site" value={form.kind} onChange={(e) => set({ kind: e.target.value })} options={KINDS} />
          </div>
          {act.feedback}
          <div>
            <Button icon="plus" disabled={!form.address.trim() || !form.institution.trim()} loading={act.busy} onClick={add}>
              Acrescentar site
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

function DomainRow({ domain: d, onChanged }) {
  const { backend } = useSession();
  const mobile = useMobile();
  const [editing, setEditing] = React.useState(false);
  const [f, setF] = React.useState({ address: d.address, institution: d.institution, kind: d.kind });
  const act = useAction();
  const save = (patch, done) =>
    act
      .run(() => backend.rpc("app_ch_save_official_domain", { p_domain: { id: d.id, address: d.address, institution: d.institution, kind: d.kind, active: d.active, ...patch } }), done)
      .then((r) => {
        if (!r) return;
        setEditing(false);
        onChanged();
      });
  return (
    <div data-testid={`domain-${d.id}`} style={{ borderTop: "1px solid var(--border-subtle)", padding: "10px 0", display: "flex", flexDirection: "column", gap: 8, opacity: d.active ? 1 : 0.7 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ overflowWrap: "anywhere" }}>{d.address}</strong>
          <span style={{ color: "var(--text-secondary)" }}>{d.institution}</span>
          <Badge size="sm" tone={KIND_TONE[d.kind] ?? "neutral"}>
            {DOMAIN_KIND[d.kind] ?? d.kind}
          </Badge>
          {!d.active && (
            <Badge size="sm" tone="warning">
              desativado
            </Badge>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Switch label="Ativo" aria-label={`Ativo — ${d.address}`} checked={Boolean(d.active)} disabled={act.busy} onChange={(e) => save({ active: e.target.checked }, e.target.checked ? "Site reativado." : "Site desativado.")} />
          <Button size="sm" variant="secondary" icon="pencil" onClick={() => setEditing((v) => !v)}>
            {editing ? "Fechar" : "Editar"}
          </Button>
        </div>
      </div>
      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
            <TextField label={`Endereço — ${d.address}`} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            <TextField label={`Instituição — ${d.address}`} value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} />
            <SelectField label={`Tipo — ${d.address}`} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={KINDS} />
          </div>
          <div>
            <Button size="sm" icon="save" disabled={!f.address.trim() || !f.institution.trim()} loading={act.busy} onClick={() => save({ address: f.address.trim(), institution: f.institution.trim(), kind: f.kind }, "Site atualizado.")}>
              Salvar site
            </Button>
          </div>
        </div>
      )}
      {act.feedback}
    </div>
  );
}
