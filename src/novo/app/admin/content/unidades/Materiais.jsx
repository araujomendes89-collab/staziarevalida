// "Materiais da unidade": lista (tipo, quem vê, estado), INSERIR, RETIRAR e PRÉ-VISUALIZAR. Retirar não apaga: fica no histórico.
import React from "react";
import { Badge, Banner, Button, Checkbox, SelectField, TextField } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { LoadError, Loading, TextArea, useLoad } from "../../common.jsx";
import { hubAvailable, hubBlobUrl } from "../api.js";
import { Label, useAction } from "../ui.jsx";
import { Janela } from "./Janela.jsx";
import { PreviaAluno } from "./PreviaAluno.jsx";
import { DESCRICAO_MATERIAL, nomePosicao, POSICAO, SO_EQUIPE, TIPO_MATERIAL, dataHora } from "./rotulos.js";

function ArquivoDaEquipe({ item, onClose }) {
  const { backend } = useSession();
  const [idx, setIdx] = React.useState(0);
  const [url, setUrl] = React.useState(null);
  const [erro, setErro] = React.useState(null);
  const arq = item.files?.[idx];
  React.useEffect(() => {
    if (!arq || !hubAvailable(backend)) return undefined;
    let vivo = true;
    let blob = null;
    setUrl(null);
    setErro(null);
    hubBlobUrl(backend, `/unit-materials/${item.id}/file/${idx}`).then(
      (u) => {
        blob = u;
        vivo ? setUrl(u) : URL.revokeObjectURL(u);
      },
      () => vivo && setErro("O arquivo ainda não foi enviado ao depósito protegido (etapa de envio dos arquivos da aula).")
    );
    return () => {
      vivo = false;
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [backend, item.id, idx, arq]);
  return (
    <Janela titulo={`${item.title} (só da equipe)`} onClose={onClose}>
      <Banner tone="info" title="Material só da equipe">
        O aluno não vê nem baixa esta peça. Ela fica guardada em depósito protegido e só abre aqui, para a equipe.
      </Banner>
      {item.files.length > 1 && <SelectField label="Arquivo" value={String(idx)} onChange={(e) => setIdx(Number(e.target.value))} options={item.files.map((f) => ({ value: String(f.idx), label: f.rotulo }))} />}
      {!arq ? (
        <p style={{ margin: 0 }}>Este material não tem arquivo.</p>
      ) : erro ? (
        <Banner tone="warning">{erro}</Banner>
      ) : !hubAvailable(backend) ? (
        <Banner tone="warning">O arquivo abre quando o servidor está ligado.</Banner>
      ) : !url ? (
        <Loading />
      ) : arq.tipo === "application/pdf" ? (
        <iframe title={arq.rotulo} src={url} style={{ width: "100%", height: "70vh", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }} />
      ) : (
        <img src={url} alt={arq.texto_alternativo || arq.rotulo} style={{ maxWidth: "100%", height: "auto", borderRadius: "var(--radius-md)" }} />
      )}
    </Janela>
  );
}

function FormularioInserir({ versionId, secoes, claims, onClose, onDone }) {
  const { backend } = useSession();
  const act = useAction();
  const [tipo, setTipo] = React.useState("video");
  const [titulo, setTitulo] = React.useState("");
  const [quem, setQuem] = React.useState("aluno");
  const [pos, setPos] = React.useState("99");
  const [url, setUrl] = React.useState("");
  const [dur, setDur] = React.useState("");
  const [legenda, setLegenda] = React.useState("");
  const [transcricao, setTranscricao] = React.useState("");
  const [cab, setCab] = React.useState("");
  const [linhas, setLinhas] = React.useState("");
  const [ids, setIds] = React.useState([]);
  const midia = tipo === "audio" || tipo === "video";
  // duração "m:ss" ou segundos
  const segundos = (t) => {
    const m = String(t).trim().match(/^(\d+):([0-5]?\d)$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : /^\d+$/.test(String(t).trim()) ? Number(t) : null;
  };
  const enviar = async () => {
    const item = { kind: tipo, title: titulo, visibility: quem, position: Number(pos) };
    if (midia) Object.assign(item, { url, duration_seconds: segundos(dur), caption: legenda, transcript: transcricao });
    else Object.assign(item, { headers: cab.split(";").map((x) => x.trim()).filter(Boolean), rows: linhas.split("\n").map((l) => l.split(";").map((x) => x.trim())).filter((r) => r.some(Boolean)), claim_ids: ids });
    const r = await act.run(() => backend.rpc("app_ch_unit_material_insert", { p_version_id: versionId, p_item: item }), null);
    if (r) onDone(r);
  };
  return (
    <Janela titulo="Inserir material na unidade" onClose={onClose} largura={640}>
      <SelectField label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} options={[{ value: "video", label: "Vídeo" }, { value: "audio", label: "Áudio" }, { value: "tabela", label: "Tabela" }]} />
      <TextField label="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <SelectField label="Quem vê" value={quem} onChange={(e) => setQuem(e.target.value)} options={[{ value: "aluno", label: "Aluno vê" }, { value: "equipe", label: "Só equipe" }]} />
      <SelectField label="Posição na aula" value={pos} onChange={(e) => setPos(e.target.value)} options={POSICAO(secoes)} />
      {midia ? (
        <>
          <fieldset style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 10, margin: 0 }}>
            <legend style={{ font: "var(--type-label)", padding: "0 6px" }}>Origem</legend>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="radio" checked readOnly /> Link (YouTube ou Vimeo, player dentro do sistema)
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-tertiary)" }}>
              <input type="radio" disabled /> Arquivo enviado (etapa futura)
            </label>
            <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
              O envio de arquivo de áudio ou vídeo ainda não existe: ele exige armazenamento protegido com leitura em pedaços (streaming) só dentro do sistema, sem link direto para o arquivo. Por enquanto vale o link de player embutido; link direto de arquivo (.mp3, .mp4) não é aceito.
            </span>
          </fieldset>
          <TextField label="Link do vídeo ou áudio" placeholder="https://youtu.be/… ou https://vimeo.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <TextField label="Duração (m:ss ou segundos)" placeholder="2:05" value={dur} onChange={(e) => setDur(e.target.value)} />
          <TextArea label="Legenda (opcional)" value={legenda} onChange={setLegenda} rows={2} />
          <TextArea label="Transcrição (opcional)" value={transcricao} onChange={setTranscricao} rows={3} />
        </>
      ) : (
        <>
          <TextField label="Cabeçalhos (separados por ponto e vírgula)" value={cab} onChange={(e) => setCab(e.target.value)} />
          <TextArea label="Linhas (uma por linha; células separadas por ponto e vírgula)" value={linhas} onChange={setLinhas} rows={4} />
          <Label>Afirmações validadas que sustentam a tabela{quem === "aluno" ? " (obrigatório para o aluno)" : ""}</Label>
          <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {claims.map((c, i) => (
              <Checkbox key={c.id} label={`A${i + 1}: ${c.statement.slice(0, 110)}`} checked={ids.includes(c.id)} onChange={(e) => setIds((cur) => (e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id)))} />
            ))}
          </div>
        </>
      )}
      <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
        O texto que o aluno lê não pode trazer referência ([1], "Referências", "Trechos citados"). Se a versão já estava aprovada, inserir material que o aluno vê derruba as aprovações: o aluno não pode ver o que o revisor não viu.
      </span>
      {act.feedback}
      <div style={{ display: "flex", gap: 8 }}>
        <Button icon="plus" loading={act.busy} onClick={enviar}>
          Inserir {tipo === "video" ? "vídeo" : tipo === "audio" ? "áudio" : "tabela"}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Janela>
  );
}

function Linha({ it, secoes, canEdit, onPreview, onRetire, onRestore, busy }) {
  const retirado = it.status === "retirado";
  const midia = it.kind === "audio" || it.kind === "video";
  return (
    <li style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", padding: "10px 0", borderTop: "1px solid var(--border-subtle)", opacity: retirado ? 0.7 : 1 }} data-kind={it.kind} data-status={it.status}>
      <div style={{ minWidth: 0, flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 4 }}>
        <strong style={{ overflowWrap: "anywhere" }}>{it.title}</strong>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Badge size="sm">{TIPO_MATERIAL[it.kind] ?? it.kind}</Badge>
          <Badge size="sm" tone={it.visibility === "aluno" ? "success" : "neutral"}>
            {it.visibility === "aluno" ? "Aluno vê" : "Só equipe"}
          </Badge>
          <Badge size="sm" tone={retirado ? "danger" : "info"}>
            {retirado ? "Retirado" : "Ativo"}
          </Badge>
          {it.origin === "inserido" && <Badge size="sm" tone="brand">Inserido pela equipe</Badge>}
        </div>
        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
          {DESCRICAO_MATERIAL[it.kind]}
          {(midia || it.kind === "tabela") && ` Posição: ${nomePosicao(it.position, secoes)}.`}
          {midia && it.duration_seconds ? ` Duração: ${Math.floor(it.duration_seconds / 60)}:${String(it.duration_seconds % 60).padStart(2, "0")}. Origem: link.` : ""}
        </span>
        {retirado && (
          <span style={{ font: "var(--type-caption)", color: "var(--danger-text)" }}>
            Retirado em {dataHora(it.retired_at)} por {it.retired_by ?? "—"}: {it.retire_reason}. Continua no histórico da unidade.
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {!retirado && (
          <Button size="sm" variant="secondary" icon="eye" onClick={() => onPreview(it)}>
            Pré-visualizar{it.visibility === "aluno" ? " como aluno" : ""}
          </Button>
        )}
        {canEdit && !retirado && it.kind !== "texto_aula" && (
          <Button size="sm" variant="ghost" icon="archive" disabled={busy} onClick={() => onRetire(it)}>
            Retirar
          </Button>
        )}
        {canEdit && retirado && (
          <Button size="sm" variant="secondary" icon="undo-2" disabled={busy} onClick={() => onRestore(it)}>
            Inserir de novo
          </Button>
        )}
      </div>
    </li>
  );
}

export function MateriaisUnidade({ versionId, secoes = [], claims = [], canEdit, onChanged, refresh }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_unit_materials", { p_version_id: versionId }), [backend, versionId, refresh]);
  const act = useAction();
  const [insere, setInsere] = React.useState(false);
  const [previa, setPrevia] = React.useState(false);
  const [arquivo, setArquivo] = React.useState(null);
  const [retirando, setRetirando] = React.useState(null);
  const [motivo, setMotivo] = React.useState("");
  if (!Array.isArray(data)) return error ? <LoadError error={error} retry={reload} /> : null;
  const ativos = data.filter((x) => x.status === "ativo");
  const alunoVe = ativos.filter((x) => x.visibility === "aluno").length;
  const depois = () => {
    reload();
    onChanged?.();
  };
  // material do aluno abre a página da aula como o aluno vê; material só da equipe abre o arquivo, para a equipe
  const preview = (it) => (it.visibility === "aluno" ? setPrevia(true) : setArquivo(it));
  return (
    <section className="sm-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }} aria-label="Materiais da unidade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Materiais da unidade</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Button size="sm" variant="secondary" icon="eye" onClick={() => setPrevia(true)}>
            Pré-visualizar como aluno
          </Button>
          {canEdit && (
            <Button size="sm" icon="plus" onClick={() => setInsere(true)}>
              Inserir
            </Button>
          )}
        </div>
      </div>
      <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
        {ativos.length} ativos · {alunoVe} o aluno vê · {ativos.length - alunoVe} só da equipe. O aluno nunca baixa PDF: PDF interativo e PDF da A4 são só da equipe. Retirar não apaga: fica no histórico.
      </span>
      {act.feedback}
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {data.map((it) => (
          <Linha key={it.id} it={it} secoes={secoes} canEdit={canEdit} busy={act.busy} onPreview={preview} onRetire={(x) => (setRetirando(x), setMotivo(""))} onRestore={(x) => act.run(() => backend.rpc("app_ch_unit_material_restore", { p_item_id: x.id }), `Devolvido à lista: ${x.title}.`).then((r) => r && depois())} />
        ))}
      </ul>
      {retirando && (
        <Janela titulo={`Retirar: ${retirando.title}`} onClose={() => setRetirando(null)} largura={520}>
          <p style={{ margin: 0 }}>
            {retirando.visibility === "aluno" ? "O aluno deixa de ver este material na página da aula. " : ""}O item continua na lista como "retirado" e no histórico, com o seu nome e o motivo.
          </p>
          <TextField label="Motivo da retirada" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <Button disabled={!motivo.trim()} loading={act.busy} icon="archive" onClick={() => act.run(() => backend.rpc("app_ch_unit_material_retire", { p_item_id: retirando.id, p_reason: motivo }), `Retirado: ${retirando.title}.`).then((r) => r && (setRetirando(null), depois()))}>
              Retirar
            </Button>
            <Button variant="secondary" onClick={() => setRetirando(null)}>
              Cancelar
            </Button>
          </div>
        </Janela>
      )}
      {insere && <FormularioInserir versionId={versionId} secoes={secoes} claims={claims} onClose={() => setInsere(false)} onDone={() => (setInsere(false), depois())} />}
      {previa && <PreviaAluno versionId={versionId} onClose={() => setPrevia(false)} />}
      {arquivo && <ArquivoDaEquipe item={arquivo} onClose={() => setArquivo(null)} />}
    </section>
  );
}
