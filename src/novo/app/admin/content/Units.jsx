// Unidades por tema: texto da aula (base revisada), materiais, revisão médica e editorial, publicação.
// Toda decisão é registrada no banco com revisor, data, versão e hash; editar invalida a aprovação.
import React from "react";
import { Badge, Banner, Button, Checkbox, EmptyState, SegmentedControl, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { ListRow, LoadError, Loading, useLoad } from "../common.jsx";
import { hubAvailable, hubBlobUrl } from "./api.js";
import { AREA_LABEL, isMockModel, MATERIAL_KIND, UNIT_STATUS } from "./labels.js";
import { openFileInTab } from "./openFile.js";
import { PublishPanel } from "./PublishPanel.jsx";
import { TemaDaUnidade } from "./vigilancia/TemasVigiados.jsx";
import { CampoTexto } from "../../textoRico/CampoTexto.jsx";
import { TextoRico } from "../../textoRico/TextoRico.jsx";
import { ClaimCard, Label, ModelBadge, Pre, Section, shortHash, StatusBadge, useAction, when } from "./ui.jsx";
import { CabecalhoUnidade, CaminhoAtePublicar, useVisaoGeral } from "./unidades/Topo.jsx";
import { MateriaisUnidade } from "./unidades/Materiais.jsx";
import { FichaRevisor } from "./unidades/Ficha.jsx";
import { HistoricoUnidade } from "./unidades/Historico.jsx";
import { ResumoAprovacao } from "./unidades/Resumo.jsx";
import { dataCurta } from "./unidades/rotulos.js";
import { ricoValido, soFormatacao } from "../../../../shared/docRico";
import ParagrafoRico from "../../editorPro/leitor/ParagrafoRico.jsx";
const EditorAula = React.lazy(() => import("../../editorPro/EditorAula.jsx"));

const ORDER = ["awaiting_review", "needs_update", "draft", "approved", "published", "retired"];

export function Units(ctx) {
  const id = ctx.params.get("versao");
  if (id) return <UnitVersion id={id} {...ctx} />;
  return <UnitList {...ctx} />;
}

function UnitList({ go, reviewerAreas, isStaff }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_units"), [backend]);
  // dados novos da lista (código, subárea, palavras, questões ligadas): sem a função no banco, a lista continua como antes
  const extras = useLoad(() => backend.rpc("app_ch_unit_overview_list").catch(() => null), [backend]).data;
  const extra = new Map((Array.isArray(extras) ? extras : []).map((x) => [x.unit_id, x]));
  const [filter, setFilter] = React.useState(isStaff ? "all" : "mine");
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const latest = (u) => u.versions[0];
  const importada = (r) => go("unidades", { versao: r.version_id });
  const rows = data
    .filter((u) => filter !== "mine" || reviewerAreas.includes(u.area_code))
    .filter((u) => filter !== "review" || latest(u).status === "awaiting_review")
    .sort((a, b) => ORDER.indexOf(latest(a).status) - ORDER.indexOf(latest(b).status));
  return (
    <Section
      title="Unidades por tema"
      action={
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={[
            ...(isStaff ? [{ value: "all", label: "Todas" }] : []),
            { value: "review", label: "Aguardando revisão" },
            ...(reviewerAreas.length ? [{ value: "mine", label: "Minhas áreas" }] : []),
          ]}
        />
      }
    >
      {isStaff && <ImportLesson onImported={importada} />}
      {rows.length === 0 && <EmptyState icon="stamp" title="Nenhuma unidade aqui" description="As unidades nascem do processamento dos documentos: cada documento enviado gera um rascunho por tema, que aparece aqui para revisão." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((u) => {
          const v = latest(u);
          const x = extra.get(u.unit_id);
          const cam = x?.caminho ?? {};
          return (
            <ListRow key={u.unit_id} onClick={() => go("unidades", { versao: v.id })} label={`Abrir ${u.title}`}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {x?.code && <Badge size="sm" tone="solid">{x.code}</Badge>}
                  <strong>{u.title}</strong>
                  <StatusBadge map={UNIT_STATUS} value={v.status} />
                  <Badge size="sm">versão {v.version}{x ? ` · ${dataCurta(x.date)}` : ""}</Badge>
                  {u.area_code && <Badge size="sm" tone="brand">{[AREA_LABEL[u.area_code] ?? u.area_code, cam.subarea].filter(Boolean).join(" › ")}</Badge>}
                  <ModelBadge model={v.generated_by_model} />
                </div>
                {x && (
                  <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                    {x.afirmacoes} afirmações · {Number(x.palavras).toLocaleString("pt-BR")} palavras{x.questoes_ligadas != null ? ` · ${x.questoes_ligadas} questões ligadas` : ""}
                  </span>
                )}
                {v.candidate_reason && <span style={{ font: "var(--type-body-sm)", color: "var(--warning-text)" }}>Candidata: {v.candidate_reason}</span>}
              </div>
            </ListRow>
          );
        })}
      </div>
    </Section>
  );
}

/**
 * "Importar aula pronta" (só equipe): lê o pacote-<código>.json gerado por scripts/aulas/gerar-sql-importacao.mjs e chama
 * app_ch_import_lesson_package. A aula entra sempre "aguardando revisão"; o banco recusa com a lista do que falta.
 */
function ImportLesson({ onImported }) {
  const { backend } = useSession();
  const act = useAction();
  const input = React.useRef(null);
  const escolher = async (file) => {
    if (!file) return;
    const r = await act.run(async () => {
      let pacote;
      try {
        pacote = JSON.parse(await file.text());
      } catch {
        throw new Error("O arquivo não é um pacote de aula (JSON). Use o pacote-<código>.json gerado para a aula.");
      }
      return backend.rpc("app_ch_import_lesson_package", { p_package: pacote });
    }, null);
    if (input.current) input.current.value = "";
    if (r) onImported(r);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input ref={input} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => escolher(e.target.files?.[0])} />
        <Button size="sm" variant="secondary" icon="file-up" loading={act.busy} onClick={() => input.current?.click()}>
          Importar aula pronta
        </Button>
        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Pacote da aula (.json). Entra na fila "Aguardando revisão"; nada é publicado.</span>
      </div>
      {act.feedback}
    </div>
  );
}

function UnitVersion({ id, go, isAdmin, isStaff, reviewerAreas }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_ch_unit_version", { p_version_id: id }), [backend, id]);
  const [publishing, setPublishing] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const [tick, setTick] = React.useState(0);
  const visao = useVisaoGeral(id, tick);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const v = data.version;
  const recarrega = () => {
    setTick((t) => t + 1);
    reload();
  };
  const secoes = (v.content?.sections ?? []).map((sec) => ({ titulo: sec.heading }));
  const editable = isStaff && !["published", "retired", "needs_update"].includes(v.status);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Button variant="ghost" size="sm" icon="undo-2" onClick={() => go("unidades")}>
          Unidades
        </Button>
      </div>
      {visao ? (
        <>
          <CabecalhoUnidade o={visao} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 16, alignItems: "start" }}>
            <CaminhoAtePublicar o={visao} onPublish={() => setPublishing(true)} />
            <MateriaisUnidade versionId={id} secoes={secoes} claims={data.claims ?? []} canEdit={visao.pode?.editar === true} refresh={tick} onChanged={recarrega} />
          </div>
          <FichaRevisor versionId={id} refresh={tick} podeDecidir={visao.pode?.aprovar_medica === true} podeImportar={isStaff} onChanged={recarrega} />
        </>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, font: "var(--type-h3)" }}>{data.title}</h2>
          <StatusBadge map={UNIT_STATUS} value={v.status} size="md" />
          <Badge>versão {v.version}</Badge>
          {data.area_code && <Badge tone="brand">{AREA_LABEL[data.area_code] ?? data.area_code}</Badge>}
          <ModelBadge model={v.generated_by_model} />
        </div>
      )}
      {visao && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <ModelBadge model={v.generated_by_model} />
        </div>
      )}
      {isMockModel(v.generated_by_model) && <Banner tone="danger" title="Simulação de desenvolvimento">Esta versão foi produzida pela simulação (não é IA nem revisão). Serve para testar o fluxo e não pode ser publicada.</Banner>}
      {isStaff && <TemaDaUnidade unitId={v.unit_id} />}
      {v.candidate_reason && <Banner tone="warning" title="Versão candidata">{v.candidate_reason}</Banner>}
      {v.scope_note && <Banner tone="info" title="Escopo">{v.scope_note}</Banner>}
      {notice && <Banner tone="success" icon="globe">{notice}</Banner>}
      <Problems problems={data.problems} status={v.status} isAdmin={isAdmin} />
      <ReviewFlags flags={v.review_flags} />
      <Decisions data={data} isAdmin={isAdmin} isStaff={isStaff} reviewerAreas={reviewerAreas} onChanged={recarrega} onPublish={() => setPublishing(true)} go={go} hideLegacyPublish={Boolean(visao)} />
      {publishing && isAdmin && v.status === "approved" && <PublishPanel version={v} publishFn={visao ? "app_ch_unit_publish" : "app_ch_publish"} onClose={() => setPublishing(false)} onPublished={(msg) => (setPublishing(false), setNotice(msg), recarrega())} />}
      <Editor key={v.content_hash} version={v} titulo={data.title} claims={data.claims} editable={editable} canNewVersion={isStaff && ["published", "needs_update"].includes(v.status)} podeFormatar={isStaff && v.status === "published"} onNewVersion={(novo) => go("unidades", { versao: novo })} onSaved={reload} />
      <Materials data={data} canRegenerate={editable} onChanged={recarrega} />
      <Section title={`Afirmações e evidências (${data.claims.length})`}>
        <p style={{ margin: "0 0 8px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Lista só da equipe: cada afirmação com a fonte, a página e a citação literal. O aluno nunca vê esta lista.</p>
        {data.claims.map((c) => (
          <ClaimCard key={c.id} claim={c} onChanged={recarrega} canConfirm={isAdmin || reviewerAreas.includes(data.area_code)} />
        ))}
      </Section>
      {visao && <HistoricoUnidade versionId={id} refresh={tick} />}
      <Section title="Aprovações e publicações">
        {data.approvals.length === 0 && <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Nenhuma aprovação registrada.</p>}
        {data.approvals.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--border-subtle)", font: "var(--type-body-sm)" }}>
            <Badge size="sm" tone={a.valid ? "success" : "neutral"}>
              {a.kind === "medical" ? "Médica" : "Editorial"} · {a.valid ? "válida" : "invalidada"}
            </Badge>
            <span>{a.reviewer}</span>
            {a.area_code && <span>· {AREA_LABEL[a.area_code] ?? a.area_code}</span>}
            <span>· {when(a.decided_at)}</span>
            <code>· {shortHash(a.content_hash)}</code>
            {a.note && <span style={{ flexBasis: "100%", color: "var(--text-secondary)" }}><TextoRico texto={a.note} /></span>}
          </div>
        ))}
        {data.publications.map((p, i) => (
          <div key={`p${i}`} style={{ font: "var(--type-body-sm)", padding: "6px 0", borderTop: "1px solid var(--border-subtle)" }}>
            Publicada em {when(p.published_at)} <code>{shortHash(p.content_hash)}</code>
            {p.retired_at ? ` · retirada em ${when(p.retired_at)}` : " · no ar"}
          </div>
        ))}
      </Section>
    </div>
  );
}

/** O que o banco achou de bloqueio de CONTEÚDO, e o que ainda falta para a publicação em si (aprovação, administrador, chaves da Configuração). */
const NEXT_STEP = {
  draft: "Falta enviar a versão para revisão: só uma versão aprovada pela revisão médica da área e pela editorial pode ser publicada.",
  awaiting_review: "Falta a aprovação: a revisão médica (administrador ou revisor da área) e a editorial. Só depois a versão pode ser publicada.",
  needs_update: "A versão continua no ar, mas a fonte mudou: revise a versão candidata e retire esta se for preciso.",
  published: "Esta versão está no ar para os alunos.",
  retired: "Esta versão foi retirada e não volta ao ar. Para publicar de novo, é preciso uma versão nova.",
};

function Problems({ problems, status, isAdmin }) {
  if (!problems?.length) {
    const next = status === "approved" ? (isAdmin ? "A versão está aprovada: clique em Publicar para ver a prévia. A publicação também precisa estar ligada e o modo sombra desligado em Configuração e custos." : "A versão está aprovada. A publicação é feita por um administrador.") : NEXT_STEP[status];
    return (
      <Banner tone={status === "approved" || status === "published" ? "success" : "info"} icon="badge-check" title="Nenhum bloqueio de conteúdo encontrado">
        {next}
      </Banner>
    );
  }
  return (
    <Banner tone="warning" icon="triangle-alert" title={`O que falta para publicar (${problems.length})`}>
      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {problems.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </Banner>
  );
}

function ReviewFlags({ flags }) {
  if (!flags?.length) return null;
  return (
    <Section title={`Apontamentos das conferências automáticas (${flags.length})`}>
      <p style={{ margin: "0 0 8px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>A revisão automática só aponta problemas; ela não aprova nada. Trechos removidos pela conferência aparecem aqui para decisão humana.</p>
      {flags.map((f, i) => (
        <div key={i} style={{ borderTop: "1px solid var(--border-subtle)", padding: "8px 0" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge size="sm" tone={f.severity === "critical" ? "danger" : f.severity === "major" ? "warning" : "neutral"}>
              {{ critical: "crítico", major: "importante", minor: "menor" }[f.severity] ?? f.severity}
            </Badge>
            <Badge size="sm" tone={f.by === "ai_review" ? "ai" : "neutral"}>{f.by === "ai_review" ? "revisão por IA" : f.by === "importacao" ? "importação da aula pronta" : "regra de software"}</Badge>
            <span style={{ font: "var(--type-caption)" }}>{f.where}</span>
          </div>
          <div style={{ font: "var(--type-body-sm)", marginTop: 4 }}>{f.detail}</div>
          {f.removed_text && (
            <>
              <Label>Trecho removido</Label>
              <Pre>{f.removed_text}</Pre>
            </>
          )}
        </div>
      ))}
    </Section>
  );
}

function Decisions({ data, isAdmin, isStaff, reviewerAreas, onChanged, onPublish, go, hideLegacyPublish = false }) {
  const { backend } = useSession();
  const v = data.version;
  const [note, setNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  const act = useAction();
  // aprovação médica: administrador OU revisor médico da área (decisão do dono, 13/10/2026); editor nunca
  const medicalReviewer = isAdmin || reviewerAreas.includes(data.area_code);
  const [confirming, setConfirming] = React.useState(null);
  const call = (fn, args, done) => act.run(() => backend.rpc(fn, args), done).then((r) => r !== undefined && onChanged());
  return (
    <Section title="Decisões">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(v.status === "awaiting_review" || v.status === "approved") && <CampoTexto modo="linha" label="Observação da aprovação (o que foi conferido)" value={note} onChange={setNote} minRows={2} />}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isStaff && v.status === "draft" && (
            <Button icon="send" loading={act.busy} onClick={() => call("app_ch_submit_for_review", { p_version_id: v.id }, "Enviada para revisão.")}>
              Enviar para revisão
            </Button>
          )}
          {(v.status === "awaiting_review" || v.status === "approved") && (
            <>
              <Button icon="stamp" disabled={!medicalReviewer} loading={act.busy} onClick={() => setConfirming("medical")}>
                Aprovar (revisão médica)
              </Button>
              <Button variant="secondary" icon="badge-check" disabled={!isStaff} loading={act.busy} onClick={() => setConfirming("editorial")}>
                Aprovar (editorial)
              </Button>
            </>
          )}
          {isAdmin && v.status === "approved" && !hideLegacyPublish && (
            <Button icon="globe" onClick={onPublish}>
              Publicar para os alunos…
            </Button>
          )}
        </div>
        {confirming && (v.status === "awaiting_review" || v.status === "approved") && (
          <ResumoAprovacao
            versionId={v.id}
            tipo={confirming}
            nota={note}
            busy={act.busy}
            onCancel={() => setConfirming(null)}
            onConfirm={(n) => call("app_ch_approve", { p_version_id: v.id, p_kind: confirming, p_note: n }, confirming === "medical" ? "Aprovação médica registrada." : "Aprovação editorial registrada.").then(() => setConfirming(null))}
          />
        )}
        {(v.status === "awaiting_review" || v.status === "approved") && !medicalReviewer && (
          <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>A aprovação médica é do administrador ou de um revisor médico cadastrado na área {AREA_LABEL[data.area_code] ?? data.area_code ?? "?"}.</span>
        )}
        {isStaff && (v.status === "published" || v.status === "needs_update") && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="secondary" icon="file-pen-line" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_new_version", { p_from_version_id: v.id }), null).then((id) => id && go("unidades", { versao: id }))}>
              Criar versão para corrigir
            </Button>
            <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Cria um rascunho com o mesmo texto. A versão no ar continua até a nova ser aprovada e publicada.</span>
          </div>
        )}
        {isAdmin && (v.status === "published" || v.status === "needs_update") && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <TextField label="Motivo da retirada" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button variant="secondary" icon="archive" disabled={!reason.trim()} loading={act.busy} onClick={() => call("app_ch_retire", { p_version_id: v.id, p_reason: reason }, "Retirada do ar. A aula e os flashcards saem da lista do aluno; nada do que os alunos já fizeram é apagado.")}>
              Retirar
            </Button>
          </div>
        )}
        {act.feedback}
      </div>
    </Section>
  );
}

/**
 * Editor da base revisada: seções e parágrafos; parágrafo clínico precisa citar afirmações.
 * Abre em modo leitura; "Editar" liga a edição (equipe, versão editável) e "Cancelar" descarta. Versão no ar não se edita no lugar:
 * "Editar (criar versão nova)" chama app_ch_new_version (só published/needs_update; a versão no ar continua até a nova ser publicada).
 */
function Editor({ version, titulo, claims, editable: podeEditar, canNewVersion = false, podeFormatar = false, onNewVersion, onSaved }) {
  const { backend } = useSession();
  const original = () => structuredClone(version.content.sections ?? []);
  const [sections, setSections] = React.useState(original);
  const [dirty, setDirty] = React.useState(false);
  const [editando, setEditando] = React.useState(false);
  const [confirmaNova, setConfirmaNova] = React.useState(false);
  const [docConfig, setDocConfig] = React.useState(version.content.doc_config ?? null);
  const [completo, setCompleto] = React.useState(false);
  const [chaveEditorAula, setChaveEditorAula] = React.useState(0);
  const act = useAction();
  // trava de edição (migração 013060): enquanto edita, a tela segura a trava com o hash da versão que abriu; o banco recusa
  // salvar por cima de quem está editando ou de uma versão que outra pessoa salvou depois. Sem a 013060 no banco: segue como antes.
  const [trava, setTrava] = React.useState(null); // null | { quem, desde } (outra pessoa) | { mudou: true }
  const sinalTrava = React.useCallback(() => {
    Promise.resolve()
      .then(() => backend.rpc("app_ch_doc_trava", { p_version_id: version.id, p_base_hash: version.content_hash }))
      .then((r) => {
        if (!r) return;
        if (r.minha === false) setTrava({ quem: r.quem || "outra pessoa", desde: r.desde ?? null });
        else if (r.mudou) setTrava({ mudou: true });
        else setTrava(null);
      })
      .catch(() => {});
  }, [backend, version.id, version.content_hash]);
  React.useEffect(() => {
    if (!editando) return undefined;
    sinalTrava();
    const t = setInterval(sinalTrava, 30000);
    return () => {
      clearInterval(t);
      setTrava(null);
      Promise.resolve()
        .then(() => backend.rpc("app_ch_doc_trava_soltar", { p_version_id: version.id }))
        .catch(() => {});
    };
  }, [editando, sinalTrava, backend, version.id]);
  const claimLabel = new Map(claims.map((c, i) => [c.id, `A${i + 1}`]));
  // versão no ar: só a formatação pode mudar (decisão do dono 16/10; o banco confere — migração 013080)
  const soFormatoNoAr = !podeEditar && podeFormatar;
  const editable = (podeEditar || podeFormatar) && editando; // campos ligados agora
  const update = (fn) => {
    setSections((s) => {
      const next = structuredClone(s);
      fn(next);
      return next;
    });
    setDirty(true);
  };
  const cancelar = () => {
    setSections(original());
    setDocConfig(version.content.doc_config ?? null);
    setCompleto(false);
    setDirty(false);
    setEditando(false);
  };
  const novoContent = { ...version.content, sections, ...(docConfig ? { doc_config: docConfig } : {}) };
  // a tela só ADIANTA a resposta (mesma regra do banco, testada lado a lado); quem decide é o banco ao salvar
  const soFormato = dirty && soFormatacao(version.content, novoContent);
  const salvar = () =>
    act.run(
      () => backend.rpc("app_ch_save_unit_version", { p_version_id: version.id, p_content: novoContent }),
      soFormato
        ? `Formatação salva. As aprovações continuam valendo.${version.status === "published" ? " O aluno já vê a formatação nova." : ""}`
        : "Texto salvo. As aprovações desta versão deixaram de valer.",
    ).then((r) => r && (setDirty(false), setEditando(false), setCompleto(false), onSaved()));
  const ajustarFormatacao = () => {
    setChaveEditorAula((n) => n + 1);
    setCompleto(true);
    setEditando(true);
  };
  const criarNova = () => act.run(() => backend.rpc("app_ch_new_version", { p_from_version_id: version.id }), null).then((id) => id && onNewVersion?.(id));

  const alternarModo = () => {
    if (!completo) setChaveEditorAula(prev => prev + 1);
    setCompleto(!completo);
  };
  // ao voltar do editor completo o módulo do histórico solta a trava: a tela pega de novo logo depois (sem esperar 30 s)
  React.useEffect(() => {
    if (!editando || completo) return undefined;
    const t = setTimeout(sinalTrava, 400);
    return () => clearTimeout(t);
  }, [completo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Section
      title="Texto da unidade (base revisada)"
      action={
        editable ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {!soFormatoNoAr && (
              <>
                <Button size="sm" variant="secondary" onClick={alternarModo}>
                  {completo ? "Editar por parágrafo" : "Editor completo"}
                </Button>
                <div style={{ width: 1, background: "var(--border-subtle)", alignSelf: "stretch", margin: "4px 0" }} />
              </>
            )}
            <Button size="sm" icon="check" disabled={!dirty || (soFormatoNoAr && !soFormato) || Boolean(trava)} loading={act.busy} onClick={salvar}>
              {soFormatoNoAr ? "Salvar formatação" : "Salvar texto"}
            </Button>
            <Button size="sm" variant="secondary" disabled={act.busy} onClick={cancelar}>
              Cancelar
            </Button>
          </div>
        ) : podeEditar ? (
          <Button size="sm" variant="secondary" icon="pencil" onClick={() => setEditando(true)}>
            Editar
          </Button>
        ) : (canNewVersion && !confirmaNova) || podeFormatar ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {podeFormatar && (
              <Button size="sm" variant="secondary" icon="paintbrush" onClick={ajustarFormatacao}>
                Ajustar formatação
              </Button>
            )}
            {canNewVersion && !confirmaNova && (
              <Button size="sm" variant="secondary" icon="pencil" onClick={() => setConfirmaNova(true)}>
                Editar (criar versão nova)
              </Button>
            )}
          </div>
        ) : null
      }
    >
      {confirmaNova && canNewVersion && (
        <div style={{ marginBottom: 10 }}>
          <Banner tone="info" icon="file-pen-line" title="Editar uma versão que está no ar">
            <p style={{ margin: "0 0 8px" }}>A versão no ar continua como está; a edição vai numa versão nova, que precisa ser aprovada de novo.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" icon="file-pen-line" loading={act.busy} onClick={criarNova}>
                Criar versão nova e editar
              </Button>
              <Button size="sm" variant="secondary" disabled={act.busy} onClick={() => setConfirmaNova(false)}>
                Cancelar
              </Button>
            </div>
          </Banner>
        </div>
      )}
      {editable && soFormatoNoAr && (
        <div style={{ marginBottom: 10 }}>
          <Banner tone={dirty && !soFormato ? "danger" : "info"} icon="paintbrush" title="Versão no ar: aqui só muda a formatação">
            {dirty && !soFormato
              ? "Você mudou o conteúdo (texto, imagem, link, legenda, nota ou outro). Numa versão no ar só a formatação pode mudar: desfaça essa mudança ou cancele e crie uma versão nova."
              : "Fonte, cor, negrito, alinhamento e página não precisam de nova aprovação e aparecem para o aluno assim que você salvar. Texto, imagens e links pedem uma versão nova."}
          </Banner>
        </div>
      )}
      {editable && !soFormatoNoAr && (
        <p style={{ margin: "0 0 10px", font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          {dirty && soFormato
            ? "Até agora você só mudou a formatação: ao salvar, as aprovações continuam valendo."
            : "Mudar o texto, imagens ou links invalida as aprovações e exige gerar os materiais de novo; mudar só a formatação não. Informação clínica nova precisa de afirmação com evidência."}
        </p>
      )}
      {editable && trava && (
        <div style={{ marginBottom: 10 }}>
          {trava.mudou ? (
            <Banner tone="danger" icon="refresh-cw" title="Esta aula foi salva por outra pessoa">
              <p style={{ margin: "0 0 8px" }}>Depois que você começou a editar, outra pessoa salvou esta versão. Para não salvar por cima, recarregue a aula (o que você mudou aqui se perde).</p>
              <Button size="sm" variant="secondary" icon="refresh-cw" onClick={onSaved}>
                Recarregar
              </Button>
            </Banner>
          ) : (
            <Banner tone="warning" icon="lock" title={`${trava.quem} está editando esta aula`}>
              {`Edição aberta${trava.desde ? ` desde ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(trava.desde))}` : ""}. Para não salvar por cima, espere a outra pessoa salvar ou sair do editor.`}
            </Banner>
          )}
        </div>
      )}
      {act.feedback}
      
      {editable && completo ? (
        <React.Suspense fallback={<div style={{ padding: "20px", textAlign: "center" }}>Carregando editor completo...</div>}>
          <EditorAula
            key={`editor-aula-${chaveEditorAula}`}
            content={{ ...version.content, sections, doc_config: docConfig ?? undefined }}
            contexto={{ versionId: version.id, contentHash: version.content_hash, titulo, versao: version.version, aoRecarregar: onSaved }}
            aoMudar={(c) => {
              setSections(c.sections);
              setDocConfig(c.doc_config ?? null);
              setDirty(true);
            }}
          />
        </React.Suspense>
      ) : (
        sections.map((s, si) => (
          <div key={si} style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10, marginTop: 10 }}>
            {editable ? <TextField label="Seção" value={s.heading ?? ""} onChange={(e) => update((x) => (x[si].heading = e.target.value))} /> : <h4 style={{ margin: "0 0 6px", font: "var(--type-h4)", color: "var(--text-brand)" }}>{s.heading}</h4>}
            {(s.paragraphs ?? []).map((p, pi) => {
              const eRico = ricoValido(p.text, p.rico);
              return (
                <div key={pi} style={{ margin: "8px 0", paddingLeft: 10, borderLeft: `3px solid ${p.clinical ? "var(--border-brand)" : "var(--border-default)"}` }}>
                  {editable ? (
                    eRico ? (
                      <div style={{ padding: "12px", background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", margin: "8px 0" }}>
                        <p style={{ margin: "0 0 8px", font: "var(--type-caption)", color: "var(--text-secondary)", fontStyle: "italic" }}>
                          Este parágrafo tem formatação do editor completo. Para mudar o texto, use o Editor completo.
                        </p>
                        <ParagrafoRico texto={p.text} rico={p.rico} />
                      </div>
                    ) : (
                      <CampoTexto modo="linha" label={`Parágrafo ${pi + 1}`} value={p.text} onChange={(t) => update((x) => (x[si].paragraphs[pi].text = t))} minRows={3} />
                    )
                  ) : (
                    <ParagrafoRico texto={p.text} rico={p.rico} style={{ margin: 0 }} />
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                    {editable ? (
                      <Checkbox label="Conteúdo clínico" checked={Boolean(p.clinical)} onChange={(e) => update((x) => (x[si].paragraphs[pi].clinical = e.target.checked))} />
                    ) : (
                      p.clinical && <Badge size="sm" tone="brand">clínico</Badge>
                    )}
                    {claims.map((c) => {
                      const on = (p.claim_ids ?? []).includes(c.id);
                      if (!editable && !on) return null;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          title={c.statement}
                          disabled={!editable}
                          className={`sm-badge sm-badge--sm`}
                          style={{ cursor: editable ? "pointer" : "default", background: on ? "var(--selected-bg)" : "var(--surface-sunken)", color: on ? "var(--selected-text)" : "var(--text-tertiary)", borderColor: on ? "var(--selected-border)" : "transparent" }}
                          onClick={() =>
                            update((x) => {
                              const ids = new Set(x[si].paragraphs[pi].claim_ids ?? []);
                              on ? ids.delete(c.id) : ids.add(c.id);
                              x[si].paragraphs[pi].claim_ids = [...ids];
                            })
                          }
                        >
                          {claimLabel.get(c.id)}
                        </button>
                      );
                    })}
                    {editable && (
                      <Button size="sm" variant="ghost" icon="x" onClick={() => update((x) => x[si].paragraphs.splice(pi, 1))}>
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {editable && (
              <Button size="sm" variant="ghost" icon="plus" onClick={() => update((x) => (x[si].paragraphs = [...(x[si].paragraphs ?? []), { text: "", clinical: false, claim_ids: [] }]))}>
                Parágrafo
              </Button>
            )}
          </div>
        ))
      )}
      {!completo && editable && (
        <div style={{ marginTop: 10 }}>
          <Button size="sm" variant="secondary" icon="plus" onClick={() => update((x) => x.push({ heading: "Nova seção", paragraphs: [] }))}>
            Seção
          </Button>
        </div>
      )}
      {claims.length > 0 && (
        <div style={{ marginTop: 12, font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
          {claims.map((c, i) => (
            <div key={c.id}>
              A{i + 1}: {c.statement.slice(0, 140)}
              {c.statement.length > 140 ? "…" : ""}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Materials({ data, canRegenerate, onChanged }) {
  const { backend } = useSession();
  const [kind, setKind] = React.useState(data.materials[0]?.kind ?? null);
  const act = useAction();
  const m = data.materials.find((x) => x.kind === kind);
  // a aba abre já no clique (senão o navegador barra como pop-up); se mesmo assim não abrir, o arquivo é baixado e a tela avisa
  const [downloaded, setDownloaded] = React.useState(false);
  const open = (r) => {
    setDownloaded(false);
    return act.run(async () => setDownloaded((await openFileInTab(() => hubBlobUrl(backend, `/renders/${r.id}`), `arquivo-final.${r.format}`)) === "baixado"), null);
  };
  return (
    <Section
      title="Materiais gerados e arquivos finais"
      action={
        canRegenerate && (
          <Button size="sm" variant="secondary" icon="refresh-cw" loading={act.busy} onClick={() => act.run(() => backend.rpc("app_ch_regenerate", { p_version_id: data.version.id }), "Materiais e arquivos finais entraram na fila.").then((r) => r && onChanged())}>
            Gerar materiais de novo
          </Button>
        )
      }
    >
      {act.feedback}
      {downloaded && <Banner tone="info">O navegador não abriu a aba nova, então o arquivo foi baixado.</Banner>}
      {data.materials.length === 0 && <p style={{ margin: 0, color: "var(--text-tertiary)" }}>Nenhum material gerado.</p>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {data.materials.map((x) => (
          <button key={x.kind} type="button" className={`sm-chip${x.kind === kind ? " is-selected" : ""}`} aria-pressed={x.kind === kind} onClick={() => setKind(x.kind)}>
            {MATERIAL_KIND[x.kind] ?? x.kind}
          </button>
        ))}
      </div>
      {m && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <ModelBadge model={m.generated_by_model} />
            {!m.generated_by_model && <Badge size="sm">montado por software</Badge>}
            {(m.renders ?? []).map((r) => (
              <Button key={r.id} size="sm" variant="secondary" icon="external-link" disabled={!hubAvailable(backend)} onClick={() => open(r)}>
                {r.format.toUpperCase()} {r.current ? "" : "(versão anterior)"} {r.check?.ok ? "✓ conferido" : "✗ reprovado"}
              </Button>
            ))}
          </div>
          {(m.renders ?? [])
            .filter((r) => r.current && r.check && !r.check.ok)
            .map((r) => (
              <Banner key={r.id} tone="danger" title={`Arquivo ${r.format.toUpperCase()} reprovado na conferência`}>
                {[r.check.reason, r.check.missing_texts?.length && `Texto ausente: ${r.check.missing_texts.join(" | ")}`, r.check.missing_references?.length && `Referência ausente: ${r.check.missing_references.join(" | ")}`, r.check.cut_cards?.length && `Cards com texto cortado: ${r.check.cut_cards.join(", ")}`, r.check.empty_pages?.length && `Páginas vazias: ${r.check.empty_pages.join(", ")}`, r.check.no_references && "Aula sem referências."]
                  .filter(Boolean)
                  .join(" · ")}
              </Banner>
            ))}
          <MaterialPreview kind={m.kind} content={m.content} />
        </div>
      )}
    </Section>
  );
}

function MaterialPreview({ kind, content }) {
  if (kind === "lesson")
    return (
      <div>
        {(content.sections ?? []).map((s, i) => (
          <div key={i}>
            <h4 style={{ margin: "10px 0 4px", font: "var(--type-h4)", color: "var(--text-brand)" }}>{s.heading}</h4>
            {(s.paragraphs ?? []).map((p, j) => (
              <p key={j} style={{ margin: "0 0 6px" }}>
                <TextoRico texto={p.text} />
              </p>
            ))}
          </div>
        ))}
        <Label>Referências</Label>
        <ol style={{ margin: 0, paddingLeft: 18, font: "var(--type-body-sm)" }}>
          {(content.references ?? []).map((r, i) => (
            <li key={i}>
              {r.source} · {r.organ}
              {r.version ? ` · versão ${r.version}` : ""}
              {r.page != null ? ` · p. ${r.page}` : ""}
              {r.simulated ? " (simulação)" : ""}
            </li>
          ))}
        </ol>
      </div>
    );
  if (kind === "summary" || kind === "visual_cards")
    return (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {(content.items ?? content.cards ?? []).map((it, i) => (
          <li key={i}>{it.text}</li>
        ))}
      </ul>
    );
  if (kind === "flashcards")
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(content.cards ?? []).map((c, i) => (
          <div key={i} style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", padding: 8 }}>
            <strong>{c.front}</strong>
            <div style={{ color: "var(--text-secondary)" }}>{c.back}</div>
          </div>
        ))}
      </div>
    );
  if (kind === "questions")
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(content.items ?? []).map((q, i) => (
          <div key={i}>
            <Badge size="sm" tone="brand">
              {q.label ?? "Questão StaziaMed"}
            </Badge>
            <p style={{ margin: "6px 0" }}>{q.stem}</p>
            {q.options.map((o) => (
              <div key={o.id} style={{ font: "var(--type-body-sm)", fontWeight: o.id === q.correct ? 700 : 400 }}>
                {o.id}) {o.text}
                <div style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>{q.comments.find((c) => c.id === o.id)?.text}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  return <Pre>{JSON.stringify(content, null, 2)}</Pre>;
}
