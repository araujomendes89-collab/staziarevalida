// Taxonomia EDITORIAL StaziaMed (Área → Subárea → Tema → Subtema), versionada e editável.
// Não é classificação oficial do Inep. Temas sugeridos pela IA só valem depois da decisão editorial.
import React from "react";
import { Badge, Banner, Button, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, useLoad } from "../common.jsx";
import { Label, Section, useAction } from "./ui.jsx";

const LEVEL = { area: "Área", subarea: "Subárea", theme: "Tema", subtheme: "Subtema" };

/** Aliases: nomes alternativos que apontam para o MESMO tema (HAS = hipertensão arterial) e busca de equivalentes antes de criar um tema. */
function Aliases() {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_taxonomy_aliases"), [backend]);
  const [text, setText] = React.useState("");
  const [found, setFound] = React.useState(null);
  const [alias, setAlias] = React.useState("");
  const act = useAction();
  const search = () => act.run(() => backend.rpc("app_ch_taxonomy_find", { p_text: text, p_limit: 8 }), "").then((r) => r && setFound(r));
  return (
    <Section title="Aliases e busca de equivalentes">
      <p style={{ margin: "0 0 8px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Antes de criar um tema novo, procure por equivalentes. Siglas e nomes alternativos viram alias do tema que já existe.</p>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}><TextField label="Procurar tema" value={text} onChange={(e) => setText(e.target.value)} /></div>
        <Button size="sm" variant="secondary" icon="search" disabled={text.trim().length < 2} loading={act.busy} onClick={search}>Procurar</Button>
      </div>
      {found && found.length === 0 && <p style={{ margin: "8px 0 0", font: "var(--type-body-sm)" }}>Nenhum tema equivalente: pode criar um novo.</p>}
      {(found ?? []).map((f) => (
        <div key={f.node_id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-subtle)" }}>
          <Badge size="sm" tone={f.score >= 1 ? "danger" : "warning"}>{f.via === "name" ? "mesmo nome" : f.via === "alias" ? `alias “${f.alias}”` : f.via === "contains" ? "nome parecido" : "palavras em comum"}</Badge>
          <span style={{ font: "var(--type-body-sm)" }}>{f.path}</span>
          <input aria-label={`Alias para ${f.path}`} placeholder="novo alias (ex.: HAS)" value={alias} onChange={(e) => setAlias(e.target.value)} style={{ minWidth: 140 }} />
          <Button size="sm" variant="ghost" icon="plus" disabled={!alias.trim()} loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_taxonomy_add_alias", { p_node_id: f.node_id, p_alias: alias }), "Alias criado.").then((r) => r && (setAlias(""), reload()))}>Adicionar alias</Button>
        </div>
      ))}
      {act.feedback}
      <Label>Aliases cadastrados</Label>
      {error && <LoadError error={error} retry={reload} />}
      {data?.length === 0 && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>nenhum alias ainda</span>}
      {(data ?? []).map((a) => (
        <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
          <Badge size="sm">{a.alias}</Badge>
          <span style={{ font: "var(--type-body-sm)" }}>→ {a.path ?? "tema renomeado ou removido"}</span>
          {a.orphan && <Badge size="sm" tone="warning">órfão</Badge>}
          <Button size="sm" variant="ghost" icon="x" onClick={() => act.run(() => backend.rpc("app_ch_taxonomy_remove_alias", { p_alias_id: a.id }), "Alias removido.").then((r) => r && reload())}>Remover</Button>
        </div>
      ))}
    </Section>
  );
}
export function Taxonomy({ isAdmin }) {
  const { backend } = useSession();
  const [version, setVersion] = React.useState(null);
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_taxonomy", version ? { p_version: version } : {}), [backend, version]);
  const act = useAction();
  const [note, setNote] = React.useState("");
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const draft = data.status === "draft";
  const draftVersion = data.versions?.find((v) => v.status === "draft")?.version;
  const suggestions = data.nodes.filter((n) => n.status === "suggested");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner tone="info" icon="list-tree">
        Taxonomia editorial StaziaMed — organiza o estudo e não é classificação oficial do Inep. Um conteúdo pode pertencer a mais de uma área.
      </Banner>
      <Section
        title={`Versão ${data.version} · ${{ published: "publicada", draft: "rascunho", archived: "arquivada" }[data.status]}`}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(data.versions ?? []).map((v) => (
              <button key={v.version} type="button" className={`sm-chip${v.version === data.version ? " is-selected" : ""}`} onClick={() => setVersion(v.version)}>
                v{v.version} {v.status === "draft" ? "(rascunho)" : v.status === "published" ? "(publicada)" : ""}
              </button>
            ))}
            {!draftVersion && (
              <Button size="sm" variant="secondary" icon="pencil" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_taxonomy_draft"), "Rascunho aberto.").then((v) => v && setVersion(v))}>
                Abrir rascunho
              </Button>
            )}
          </div>
        }
      >
        {act.feedback}
        {draft && isAdmin && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <TextField label="Nota da nova versão" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button icon="globe" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_taxonomy_publish", { p_note: note }), "Nova versão publicada.").then((v) => v && (setVersion(null), reload()))}>
              Publicar versão
            </Button>
          </div>
        )}
        {suggestions.length > 0 && (
          <Banner tone="warning" title={`${suggestions.length} tema(s) sugerido(s) pela IA aguardando decisão editorial`}>
            Aprove ou recuse abaixo (marcados como "sugerido").
          </Banner>
        )}
        <Tree nodes={data.nodes} editable={draft} onChanged={reload} />
      </Section>
      <Aliases />
    </div>
  );
}

function Tree({ nodes, editable, onChanged }) {
  const children = React.useMemo(() => {
    const m = new Map();
    for (const n of nodes) m.set(n.parent_id ?? "root", [...(m.get(n.parent_id ?? "root") ?? []), n]);
    return m;
  }, [nodes]);
  return (
    <div>
      {(children.get("root") ?? []).map((n) => (
        <Node key={n.id} node={n} childrenOf={children} editable={editable} onChanged={onChanged} depth={0} />
      ))}
    </div>
  );
}

function Node({ node, childrenOf, editable, onChanged, depth }) {
  const { backend } = useSession();
  const [open, setOpen] = React.useState(depth === 0 ? false : depth < 1);
  const [adding, setAdding] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const act = useAction();
  const kids = (childrenOf.get(node.id) ?? []).filter((k) => k.status !== "rejected");
  const save = (payload, done) => act.run(() => backend.rpc("app_ch_taxonomy_save_node", { p_node: payload }), done).then((r) => r && (setAdding(false), setRenaming(false), setName(""), onChanged()));
  return (
    <div style={{ marginLeft: depth ? 16 : 0, borderLeft: depth ? "1px solid var(--border-subtle)" : "none", paddingLeft: depth ? 10 : 0 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "4px 0" }}>
        <button type="button" onClick={() => setOpen((v) => !v)} style={{ all: "unset", cursor: kids.length ? "pointer" : "default", minWidth: 16 }} aria-label={open ? "Recolher" : "Expandir"}>
          {kids.length ? (open ? "▾" : "▸") : "·"}
        </button>
        <span style={{ fontWeight: depth === 0 ? 700 : 500 }}>{node.name}</span>
        <Badge size="sm">{LEVEL[node.level]}</Badge>
        {node.code && <code style={{ font: "var(--type-caption)" }}>{node.code}</code>}
        {node.status === "suggested" && (
          <>
            <Badge size="sm" tone="ai">
              sugerido pela IA
            </Badge>
            <Button size="sm" variant="ghost" icon="check" onClick={() => act.run(() => backend.rpc("app_ch_taxonomy_decide", { p_node_id: node.id, p_approve: true }), "Tema aprovado.").then((r) => r && onChanged())}>
              Aprovar
            </Button>
            <Button size="sm" variant="ghost" icon="x" onClick={() => act.run(() => backend.rpc("app_ch_taxonomy_decide", { p_node_id: node.id, p_approve: false }), "Sugestão recusada.").then((r) => r && onChanged())}>
              Recusar
            </Button>
          </>
        )}
        {editable && node.level !== "subtheme" && (
          <Button size="sm" variant="ghost" icon="plus" onClick={() => setAdding((v) => !v)}>
            {LEVEL[{ area: "subarea", subarea: "theme", theme: "subtheme" }[node.level]]}
          </Button>
        )}
        {editable && (
          <Button size="sm" variant="ghost" icon="pencil" onClick={() => (setRenaming((v) => !v), setName(node.name))}>
            Renomear
          </Button>
        )}
      </div>
      {(adding || renaming) && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", margin: "4px 0 8px 22px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <TextField label={renaming ? "Novo nome" : "Nome"} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button size="sm" icon="check" disabled={!name.trim()} loading={act.busy} onClick={() => save(renaming ? { id: node.id, name } : { parent_id: node.id, name }, "Salvo no rascunho.")}>
            Salvar
          </Button>
        </div>
      )}
      {act.feedback}
      {open && kids.map((k) => <Node key={k.id} node={k} childrenOf={childrenOf} editable={editable} onChanged={onChanged} depth={depth + 1} />)}
    </div>
  );
}
