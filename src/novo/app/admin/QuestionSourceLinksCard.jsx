// Fontes vinculadas da questão, para a equipe (pedido do dono de 12/10/2026): cada vínculo com o documento, a versão, a página,
// a seção, a citação e a situação, e as ações "Confirmar" e "Tirar" (sem IA; o Registro anota quem fez). Os vínculos chegam pelo
// SQL do gerador (scripts/fontes-vinculadas) que o administrador cola no Supabase. Fica dentro do formulário da questão, então
// Enter num campo daqui não envia a questão. O aluno só vê o que está confirmado (e o banco é quem decide).
import React from "react";
import { Badge, Banner, Button, Card, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { CURRENT_TITLE, NOT_CONFIRMED_TEXT, ROLE_LABEL } from "../practice/LinkedSources.jsx";
import { dateBR, LoadError, Loading, messageOf, useLoad } from "./common.jsx";

const STATUS = {
  confirmada: { label: "Confirmada", tone: "success" },
  nao_confirmada: { label: "Não confirmada", tone: "danger" },
  em_revisao: { label: "Em revisão", tone: "warning" },
};
const TEMPORAL = { vigente: CURRENT_TITLE, historica: "Versão da época da prova (histórico)" };
const ORIGIN = { importacao: "importada", equipe: "pela equipe" };
const REASON_MAX = 500;

/** A conferência da referência atual desta questão, em uma frase (e o que o aluno vê). */
function CheckLine({ check }) {
  const style = { font: "var(--type-body-sm)", color: "var(--text-secondary)" };
  if (!check) return <div style={style}>Referência atual ainda não conferida: o aluno não vê nada sobre a fonte desta questão.</div>;
  const when = `${dateBR(check.checked_at)}${check.checked_by ? `, por ${check.checked_by}` : check.origin === "importacao" ? ", importada" : ""}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={style}>
        {check.status === "confirmada"
          ? `Referência atual conferida e confirmada em ${when}.`
          : `Referência atual conferida e NÃO confirmada em ${when}. O aluno vê o aviso “Fonte não confirmada”: ${NOT_CONFIRMED_TEXT}`}
      </div>
      {check.note && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Nota: {check.note}</div>}
    </div>
  );
}

function LinkRow({ link, busy, onConfirm, onAskRemove }) {
  const s = link.source ?? {};
  const status = STATUS[link.status] ?? { label: link.status, tone: "neutral" };
  const where = [link.page_label || (link.page != null ? `p. ${link.page}` : null), link.section && `Seção: ${link.section}`].filter(Boolean).join(" · ");
  const doc = [s.organ, s.version && `versão ${s.version}`, s.year && !String(s.version ?? "").includes(String(s.year)) && String(s.year), link.act].filter(Boolean).join(" · ");
  return (
    <div role="group" aria-label={`Vínculo: ${s.title}`} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 0", borderTop: "1px solid var(--border-default)", minWidth: 0 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge size="sm" tone={status.tone}>{status.label}</Badge>
        <Badge size="sm" tone={link.temporal === "vigente" ? "info" : "neutral"}>{TEMPORAL[link.temporal] ?? link.temporal}</Badge>
        {ROLE_LABEL[link.role] && <Badge size="sm">{ROLE_LABEL[link.role]}</Badge>}
      </div>
      <div style={{ overflowWrap: "anywhere" }}>
        <b>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title}</b>
        {doc ? ` · ${doc}` : ""}
      </div>
      {where && <div style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{where}</div>}
      {link.quote ? (
        <blockquote style={{ margin: 0, paddingLeft: 10, borderLeft: "3px solid var(--border-default)", color: "var(--text-secondary)", font: "var(--type-body-sm)", overflowWrap: "anywhere" }}>“{link.quote}”</blockquote>
      ) : (
        <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Sem citação do trecho: não dá para confirmar.</div>
      )}
      <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", overflowWrap: "anywhere" }}>
        {[
          ORIGIN[link.origin] && `Vínculo ${ORIGIN[link.origin]}`,
          link.status === "confirmada" && link.verified_at && `confirmado em ${dateBR(link.verified_at)}${link.verified_by ? ` por ${link.verified_by}` : ""}`,
          link.temporal === "vigente" && link.validity_checked_on && `vigência conferida em ${dateBR(`${link.validity_checked_on}T12:00:00`)}`,
        ].filter(Boolean).join(" · ")}
      </div>
      {link.reason && <div style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>Motivo: {link.reason}</div>}
      {link.update_note && (
        <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
          <b>O que mudou desde a prova</b> ({link.status === "confirmada" ? "o aluno vê esta nota" : "vai ao aluno só depois de Confirmar"}): {link.update_note}
        </div>
      )}
      {link.status === "confirmada" && link.hidden && <div style={{ font: "var(--type-body-sm)", color: "var(--warning-text)" }}>Não aparece ao aluno: {link.hidden}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {link.status !== "confirmada" && (
          <Button size="sm" variant="secondary" icon="check" loading={busy === `confirm:${link.id}`} disabled={busy != null} onClick={() => onConfirm(link)}>
            Confirmar
          </Button>
        )}
        <Button size="sm" variant="ghost" icon="trash-2" disabled={busy != null} onClick={() => onAskRemove(link)}>
          Tirar
        </Button>
      </div>
    </div>
  );
}

export function QuestionSourceLinksCard({ questionId, isNew }) {
  const { backend } = useSession();
  const load = useLoad(() => (questionId && !isNew ? backend.rpc("app_admin_question_source_links", { p_question_id: questionId }) : Promise.resolve(null)), [backend, questionId, isNew]);
  const [busy, setBusy] = React.useState(null); // "confirm:<id>" | "remove:<id>"
  const [removing, setRemoving] = React.useState(null); // vínculo esperando a confirmação de "Tirar"
  const [reason, setReason] = React.useState("");
  const [state, setState] = React.useState({ error: null, note: null });

  const confirm = async (link) => {
    setBusy(`confirm:${link.id}`);
    setState({ error: null, note: null });
    try {
      load.setData(await backend.rpc("app_admin_question_source_link_confirm", { p_link_id: link.id }));
      setState({ error: null, note: "Vínculo confirmado." });
    } catch (error) {
      setState({ error: messageOf(error), note: null });
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    const link = removing;
    if (!link) return;
    setBusy(`remove:${link.id}`);
    setState({ error: null, note: null });
    try {
      load.setData(await backend.rpc("app_admin_question_source_link_remove", { p_link_id: link.id, p_reason: reason.trim() || null }));
      setRemoving(null);
      setReason("");
      setState({ error: null, note: "Vínculo tirado." });
    } catch (error) {
      setState({ error: messageOf(error), note: null });
    } finally {
      setBusy(null);
    }
  };

  const data = load.data;
  const links = data?.links ?? [];
  return (
    <section
      aria-label="Fontes vinculadas"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target?.tagName === "INPUT") event.preventDefault();
      }}
    >
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Fontes vinculadas</h3>
          {isNew ? (
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Salve a questão primeiro.</div>
          ) : load.error && !data ? (
            <LoadError error={load.error} retry={load.reload} />
          ) : !data ? (
            <Loading />
          ) : (
            <>
              <CheckLine check={data.check} />
              {links.length === 0 ? (
                <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Nenhuma fonte vinculada a esta questão ainda.</div>
              ) : (
                <div>
                  {links.map((link) => (
                    <LinkRow key={link.id} link={link} busy={busy} onConfirm={confirm} onAskRemove={(l) => (setRemoving(l), setReason(""), setState({ error: null, note: null }))} />
                  ))}
                </div>
              )}
              {removing && (
                <Banner tone="warning" title="Tirar este vínculo?">
                  {`${removing.source?.title ?? "Fonte"} (${TEMPORAL[removing.temporal] ?? removing.temporal}). O vínculo sai da questão e o Registro guarda o que era.`}
                  {removing.temporal === "vigente" && removing.status === "confirmada" && " Se era a única referência atual confirmada, a questão volta a “ainda não conferida” (o aluno não vê nada)."}
                  <div style={{ marginTop: 12 }}>
                    <TextField label="Motivo (opcional)" value={reason} maxLength={REASON_MAX} onChange={(e) => setReason(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <Button size="sm" variant="danger" loading={busy === `remove:${removing.id}`} onClick={remove}>
                      Sim, tirar
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy != null} onClick={() => setRemoving(null)}>
                      Cancelar
                    </Button>
                  </div>
                </Banner>
              )}
              {state.note && (
                <div role="status" style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>
                  {state.note}
                </div>
              )}
              {state.error && <Banner tone="danger">{state.error}</Banner>}
            </>
          )}
        </div>
      </Card>
    </section>
  );
}
