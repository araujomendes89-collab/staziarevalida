// Fontes vinculadas da questão (pedido do dono de 12/10/2026): o trecho exato do documento oficial que sustenta a resposta.
// Aparece no comentário da questão, depois de responder. Só mostra o que está gravado e confirmado no banco
// (app_question_source_links); nada é escrito aqui e nenhuma IA participa.
//  - "Referência atual": a versão vigente do documento, com a data em que a vigência foi conferida.
//  - "Versão da época da prova": só histórico (explica por que o Inep deu aquele gabarito); nunca é a conduta atual.
//  - Conferida e não confirmada: o aviso "Fonte não confirmada" (nunca um protocolo parecido no lugar).
//  - Ainda não conferida: nada aparece.
//  - "O que mudou desde a prova": a nota da referência atual que diverge do gabarito, só depois de aprovada pela equipe (o banco
//    só a manda em vínculo confirmado). O gabarito oficial não muda. Se o comentário já mostra o cartão de atualização, a nota
//    não se repete aqui (hideUpdateNote).
import React from "react";
import { Badge } from "../../ds";
import { useSession } from "../session.jsx";

export const NOT_CONFIRMED_TITLE = "Fonte não confirmada";
export const NOT_CONFIRMED_TEXT = "Ainda não localizamos o trecho exato de um documento oficial que sustente esta resposta.";
export const CURRENT_TITLE = "Referência atual";
export const HISTORICAL_TITLE = "Versão da época da prova (histórico — não é a conduta atual)";
export const HISTORICAL_NOTE = "Explica por que o Inep deu este gabarito. Não use como conduta de hoje.";
export const UPDATE_TITLE = "O que mudou desde a prova";
export const UPDATE_CAPTION = "O gabarito oficial da prova não muda. A nota mostra o que mudou na referência atual.";
export const ROLE_LABEL = {
  diagnostico: "Diagnóstico",
  conduta: "Conduta",
  exame: "Exame",
  tratamento: "Tratamento",
  prevencao: "Prevenção",
  conceito: "Conceito",
  outro: "Outro",
};

const box = { padding: "14px 16px", borderRadius: 14, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", fontSize: 14, lineHeight: 1.55, minWidth: 0 };
const caption = { font: "var(--type-caption)", color: "var(--text-secondary)", overflowWrap: "anywhere" };
// datas: "2026-10-12" (dia) ou data e hora; o dia não pode voltar um dia por causa do fuso
const dayBR = (value) => {
  if (!value) return "";
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
};

/** Busca as fontes vinculadas (nulo enquanto carrega, sem permissão, sem nada a mostrar ou sem a atualização do banco). */
export function useLinkedSources(questionId) {
  const { backend } = useSession();
  const [state, setState] = React.useState({ id: null, data: null });
  React.useEffect(() => {
    let alive = true;
    if (!questionId) return undefined;
    backend.rpc("app_question_source_links", { p_question_id: questionId }).then(
      (data) => alive && setState({ id: questionId, data: data ?? null }),
      () => alive && setState({ id: questionId, data: null })
    );
    return () => {
      alive = false;
    };
  }, [backend, questionId]);
  return state.id === questionId ? state.data : null;
}

/** Documento, órgão, versão (ou ano) e ato, numa linha que quebra no celular. */
function SourceTitle({ item }) {
  const version = item.version ? `versão ${item.version}` : null;
  const year = item.year && !String(item.version ?? "").includes(String(item.year)) ? String(item.year) : null;
  const rest = [item.organ, version, year, item.act].filter(Boolean).join(" · ");
  return (
    <div style={{ overflowWrap: "anywhere" }}>
      <b>
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            {item.title}
          </a>
        ) : (
          item.title
        )}
      </b>
      {rest ? ` · ${rest}` : ""}
    </div>
  );
}

function Item({ item, current }) {
  const where = [item.page_label || (item.page != null ? `p. ${item.page}` : null), item.section && `Seção: ${item.section}`].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      {ROLE_LABEL[item.role] && (
        <div>
          <Badge size="sm" tone={current ? "info" : "neutral"}>
            {ROLE_LABEL[item.role]}
          </Badge>
        </div>
      )}
      <SourceTitle item={item} />
      {where && <div style={caption}>{where}</div>}
      {item.quote && (
        <blockquote style={{ margin: "2px 0 0", paddingLeft: 10, borderLeft: "3px solid var(--border-default)", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
          “{item.quote}”
        </blockquote>
      )}
      {current && item.validity_checked_on && <div style={caption}>Vigência conferida em {dayBR(item.validity_checked_on)}</div>}
    </div>
  );
}

function Group({ title, items, current, note }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div className="sm-overline">{title}</div>
      {note && <div style={caption}>{note}</div>}
      {items.map((item, i) => (
        <Item key={i} item={item} current={current} />
      ))}
    </div>
  );
}

/** O que mudou desde a prova: as notas aprovadas das referências atuais (sem repetir texto igual). */
function WhatChanged({ items }) {
  const notes = [...new Set(items.map((i) => i.update_note).filter((n) => typeof n === "string" && n.trim()))];
  if (!notes.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 12, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", minWidth: 0 }}>
      <div className="sm-overline">{UPDATE_TITLE}</div>
      {notes.map((note, i) => (
        <p key={i} style={{ margin: 0, overflowWrap: "anywhere" }}>
          {note}
        </p>
      ))}
      <div style={caption}>{UPDATE_CAPTION}</div>
    </div>
  );
}

/** O quadro em si: recebe o que o banco devolveu (ou nulo) e não busca nada. */
export function LinkedSources({ data, hideUpdateNote = false }) {
  if (!data) return null;
  const notConfirmed = data.status === "nao_confirmada";
  // a referência atual nunca aparece junto do aviso (o banco já não a manda; a tela confere de novo)
  const current = notConfirmed ? [] : (data.current ?? []);
  const historical = data.historical ?? [];
  if (!notConfirmed && current.length === 0 && historical.length === 0) return null;
  return (
    <section aria-label="Fontes vinculadas" style={{ ...box, display: "flex", flexDirection: "column", gap: 12 }}>
      <b>Fontes vinculadas</b>
      {current.length > 0 && <Group title={CURRENT_TITLE} items={current} current />}
      {!hideUpdateNote && <WhatChanged items={current} />}
      {notConfirmed && (
        <div role="note" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 12, background: "var(--warning-bg)", border: "1px solid var(--warning-border)", minWidth: 0 }}>
          <div>
            <Badge size="sm" tone="warning" icon="triangle-alert">
              {NOT_CONFIRMED_TITLE}
            </Badge>
          </div>
          <div>{NOT_CONFIRMED_TEXT}</div>
          {data.checked_at && <div style={caption}>Conferência feita em {dayBR(data.checked_at)}</div>}
        </div>
      )}
      {historical.length > 0 && <Group title={HISTORICAL_TITLE} items={historical} current={false} note={HISTORICAL_NOTE} />}
    </section>
  );
}
