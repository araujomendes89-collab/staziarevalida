// Questões parecidas (Motor de Similaridade Clínica e Pedagógica, pedido do dono de 2026-10-12): os pares de questões que o motor
// achou parecidos, para a equipe conferir. O motor compara o que cada questão cobra (assunto, raciocínio clínico e competência), não só
// as palavras; mesmo tema não é a mesma resposta nem duplicata. Cada par traz as duas questões lado a lado, o tipo de relação, a
// pontuação, a confiança e a justificativa. A equipe aprova ou rejeita (podendo trocar o tipo e anotar) e pede reprocessamento.
// Só equipe (a seção fica fora da lista do revisor médico e do aluno); quem decide o que vale é o banco.
import React from "react";
import { Badge, Banner, Button, Chip, EmptyState, SelectField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, TextArea, useLoad } from "../common.jsx";
import { isMissingFunction } from "./AiRequests.jsx";
import { Label, Pre, Section, useAction, when } from "./ui.jsx";

const PAGE = 20;

export const FILTERS = [
  { value: "propostas", label: "Propostas" },
  { value: "duplicadas", label: "Possíveis duplicatas" },
  { value: "baixa_confianca", label: "Baixa confiança" },
  { value: "todas", label: "Todas" },
];

/** Tipos de relação (os que a equipe pode escolher ao trocar o tipo), do mais forte ao mais fraco. */
export const RELATION = {
  duplicada_exata: ["Duplicada (texto quase igual)", "danger"],
  duplicada_semantica: ["Duplicada pelo sentido (paráfrase)", "danger"],
  mesmo_raciocinio: ["Mesmo raciocínio clínico", "brand"],
  complementar: ["Complementar", "info"],
  mesmo_subtema: ["Mesmo subtema", "neutral"],
  mesmo_tema: ["Mesmo tema", "neutral"],
  nao_relacionada: ["Não relacionada", "neutral"],
};
const STATUS = {
  proposta: ["Proposta", "warning"],
  pendente: ["Para revisar", "warning"],
  em_revisao: ["Para revisar", "warning"],
  aprovada: ["Aprovada", "success"],
  rejeitada: ["Rejeitada", "danger"],
};
const ORIGIN = { motor: "motor automático", vetor: "busca por sentido", lexical: "palavras parecidas", regra: "regras", regras: "regras", ia: "classificador de IA", manual: "equipe" };
const CONFIDENCE = { alta: ["Confiança alta", "success"], media: ["Confiança média", "info"], "média": ["Confiança média", "info"], baixa: ["Confiança baixa", "warning"] };
const MISSING = "Falta aplicar a atualização do banco desta função. Avise quem cuida do sistema; o resto da Central de Conteúdo funciona normalmente.";

const caption = { font: "var(--type-caption)", color: "var(--text-tertiary)" };
const decimal = (v) => (typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null);
const pick = (map, value) => map[value] ?? [value ?? "—", "neutral"];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function confidenceOf(c) {
  if (typeof c === "number") return [`Confiança ${decimal(c)}`, "neutral"];
  if (typeof c === "string" && c.trim()) return CONFIDENCE[c.trim().toLowerCase()] ?? [`Confiança ${c}`, "neutral"];
  return null;
}

function lastRun(value) {
  if (!value) return "nunca";
  if (typeof value === "string") return when(value);
  return when(value.finished_at ?? value.started_at ?? value.at ?? null);
}

/** Roda e diz se deu certo (a resposta do banco pode vir vazia). */
async function attempt(act, fn) {
  let ok = false;
  await act.run(async () => {
    const result = await fn();
    ok = true;
    return result;
  }, null);
  return ok;
}

function MissingNotice() {
  return (
    <Banner tone="warning" icon="triangle-alert" title="Questões parecidas ainda indisponíveis">
      {MISSING}
    </Banner>
  );
}

/** Botão de reprocessar com confirmação antes (todas as questões ou só as do par). */
function Reprocess({ ids, label, title, text, onDone }) {
  const { backend } = useSession();
  const act = useAction();
  const [asking, setAsking] = React.useState(false);
  const [note, setNote] = React.useState(null);
  const confirm = async () => {
    let queued = null;
    const ok = await attempt(act, async () => {
      const r = await backend.rpc("app_admin_similarity_reprocess", { p_question_ids: ids });
      queued = typeof r?.queued === "number" ? r.queued : null;
      return r;
    });
    if (!ok) return;
    setAsking(false);
    setNote(queued == null ? "Pedido de reprocessamento enviado." : `${plural(queued, "questão entrou", "questões entraram")} na fila de reprocessamento.`);
    onDone?.();
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      {!asking && (
        <div>
          <Button size="sm" variant="secondary" icon="refresh-cw" onClick={() => (setAsking(true), setNote(null))}>
            {label}
          </Button>
        </div>
      )}
      {asking && (
        <Banner
          tone="warning"
          icon="refresh-cw"
          title={title}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button size="sm" icon="refresh-cw" loading={act.busy} onClick={confirm}>
                Sim, reprocessar
              </Button>
              <Button size="sm" variant="ghost" disabled={act.busy} onClick={() => setAsking(false)}>
                Cancelar
              </Button>
            </div>
          }
        >
          {text}
        </Banner>
      )}
      {act.feedback}
      {note && <Banner tone="success">{note}</Banner>}
    </div>
  );
}

function Side({ q, label }) {
  return (
    <div style={{ flex: "1 1 260px", minWidth: 0, border: "1px solid var(--border-subtle)", borderRadius: 14, padding: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge size="sm" tone="info">{label}</Badge>
        <strong style={{ font: "var(--type-body-sm)", fontWeight: 600, overflowWrap: "anywhere" }}>{q?.code || "—"}</strong>
      </div>
      {q?.subtema && <div style={{ ...caption, marginTop: 6, overflowWrap: "anywhere" }}>Subtema: {q.subtema}</div>}
      <div style={{ marginTop: 6 }}>
        <Pre>{q?.excerpt}</Pre>
      </div>
    </div>
  );
}

function Pair({ item, onDecided, onReprocessed }) {
  const { backend } = useSession();
  const act = useAction();
  const [editing, setEditing] = React.useState(false);
  const [relation, setRelation] = React.useState(item.relation ?? "");
  const [note, setNote] = React.useState("");
  const [relLabel, relTone] = pick(RELATION, item.relation);
  const [statusLabel, statusTone] = pick(STATUS, item.status);
  const confidence = confidenceOf(item.confidence);
  const score = decimal(item.score);
  const options = Object.entries(RELATION).map(([value, [label]]) => ({ value, label }));
  if (item.relation && !RELATION[item.relation]) options.unshift({ value: item.relation, label: item.relation });
  const decide = async (decision) => {
    const ok = await attempt(act, () =>
      backend.rpc("app_admin_review_relation", {
        p_id: item.id,
        p_decision: decision,
        p_relation: relation && relation !== item.relation ? relation : null,
        p_note: note.trim() || null,
      })
    );
    if (ok) onDecided(decision === "aprovar" ? "Relação aprovada." : "Relação rejeitada.");
  };
  const ids = [item.a?.id, item.b?.id].filter(Boolean);
  return (
    <div role="group" aria-label={`Par ${item.a?.code ?? ""} e ${item.b?.code ?? ""}`} style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 12, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge size="sm" tone={relTone}>{relLabel}</Badge>
        {score && <Badge size="sm">Pontuação {score}</Badge>}
        {confidence && <Badge size="sm" tone={confidence[1]}>{confidence[0]}</Badge>}
        <Badge size="sm" tone={statusTone}>{statusLabel}</Badge>
        <span style={caption}>
          {item.origin ? `achada por ${ORIGIN[item.origin] ?? item.origin}` : ""}
          {item.origin && item.created_at ? " · " : ""}
          {item.created_at ? `em ${when(item.created_at)}` : ""}
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
        <Side q={item.a} label="Questão A" />
        <Side q={item.b} label="Questão B" />
      </div>
      <Label>Justificativa</Label>
      <div style={{ font: "var(--type-body-sm)", overflowWrap: "anywhere" }}>{item.reason || <span style={caption}>(sem justificativa)</span>}</div>
      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <SelectField label="Tipo de relação" value={relation} onChange={(e) => setRelation(e.target.value)} options={options} />
          <TextArea label="Nota (opcional)" value={note} onChange={setNote} rows={2} maxLength={1000} />
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {item.status !== "aprovada" && (
          <Button size="sm" icon="check" loading={act.busy} onClick={() => decide("aprovar")}>
            Aprovar
          </Button>
        )}
        {item.status !== "rejeitada" && (
          <Button size="sm" variant="secondary" icon="x" loading={act.busy} onClick={() => decide("rejeitar")}>
            Rejeitar
          </Button>
        )}
        <Button size="sm" variant="ghost" icon="pencil" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
          {editing ? "Fechar troca de tipo e nota" : "Trocar o tipo ou anotar"}
        </Button>
      </div>
      {act.feedback}
      {ids.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <Reprocess
            ids={ids}
            label="Reprocessar este par"
            title="Reprocessar as duas questões deste par?"
            text="As duas questões entram na fila para refazer o perfil, os vetores e a busca das parecidas. Pode gerar custo com o serviço de IA."
            onDone={onReprocessed}
          />
        </div>
      )}
    </div>
  );
}

export function SimilarQuestions() {
  const { backend } = useSession();
  const [filter, setFilter] = React.useState("propostas");
  const [page, setPage] = React.useState(0);
  const [done, setDone] = React.useState(null);
  const status = useLoad(() => backend.rpc("app_admin_similarity_status"), [backend]);
  const list = useLoad(() => backend.rpc("app_admin_question_relations", { p_filter: filter, p_limit: PAGE, p_offset: page * PAGE }), [backend, filter, page]);
  if (isMissingFunction(status.error) || isMissingFunction(list.error)) return <MissingNotice />;
  const s = status.data;
  const items = Array.isArray(list.data?.items) ? list.data.items : [];
  const total = list.data?.total ?? items.length;
  const pages = Math.max(Math.ceil(total / PAGE), 1);
  const pending = s?.pendentes_revisao ?? 0;
  const choose = (value) => (setFilter(value), setPage(0), setDone(null));
  const decided = (message) => (setDone(message), list.reload(), status.reload());
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner tone="info" icon="git-compare" title="Como o motor compara">
        O motor compara o que cada questão cobra (assunto, raciocínio clínico e competência), não só as palavras. Mesmo tema não quer dizer a mesma resposta nem duplicata. A pontuação não é porcentagem: 0,85 não quer dizer 85% iguais. O aluno vê as questões relacionadas só depois de responder, sem o gabarito de outra questão.
      </Banner>
      <Section title="Andamento">
        {status.error && <LoadError error={status.error} retry={status.reload} />}
        {!s && !status.error && <Loading />}
        {s && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} aria-label="Andamento do motor">
            <Badge>{plural(s.perfis ?? 0, "questão com perfil", "questões com perfil")}</Badge>
            <Badge>{s.com_vetor ?? 0} com vetor</Badge>
            <Badge>{plural(s.relacoes ?? 0, "relação encontrada", "relações encontradas")}</Badge>
            <Badge tone={pending > 0 ? "warning" : "neutral"}>{pending} para revisar</Badge>
            <Badge tone="info">Última execução: {lastRun(s.ultima_execucao)}</Badge>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <Reprocess
            ids={null}
            label="Reprocessar todas"
            title="Reprocessar todas as questões?"
            text="Todas as questões entram na fila para refazer o perfil, os vetores e a busca das parecidas. Pode demorar e gerar custo com o serviço de IA."
            onDone={status.reload}
          />
        </div>
      </Section>
      <Section title="Pares de questões">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div role="group" aria-label="Filtrar pares" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <Chip key={f.value} selected={filter === f.value} onClick={() => choose(f.value)}>
                {f.label}
              </Chip>
            ))}
          </div>
          {done && <Banner tone="success">{done}</Banner>}
          {list.error && <LoadError error={list.error} retry={list.reload} />}
          {!list.data && !list.error && <Loading />}
          {list.data && items.length === 0 && (
            <EmptyState icon="git-compare" title="Nenhum par neste filtro" description="Quando o motor encontrar questões parecidas, os pares aparecem aqui para a equipe conferir." />
          )}
          {items.map((item) => (
            <Pair key={item.id} item={item} onDecided={decided} onReprocessed={status.reload} />
          ))}
          {pages > 1 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => (setPage(page - 1), setDone(null))}>Anterior</Button>
              <span style={{ font: "var(--type-label)" }}>{page + 1}/{pages}</span>
              <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => (setPage(page + 1), setDone(null))}>Próxima</Button>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
