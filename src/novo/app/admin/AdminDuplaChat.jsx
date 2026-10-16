// Administração › Treinamento em Dupla: chat entre os dois do match (migração 013370).
//  - AdminDuplaChatReports (aba "Denúncias do chat", equipe: administrador e editor): denúncias enviadas pelos alunos. A equipe
//    lê SÓ a cópia guardada em cada denúncia (as conversas em si nunca aparecem aqui); cada leitura fica no Registro.
//  - AdminDuplaChatSettings (Configurações, só administrador): palavras bloqueadas, tamanho máximo, limite de envios seguidos e
//    por quanto tempo guardar as denúncias encerradas. Os valores vêm do banco (app_settings.treino_dupla_chat).
import React from "react";
import { Badge, Banner, Button, Card, EmptyState, SegmentedControl, Textarea, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { dateTimeBR, LoadError, Loading, messageOf, useLoad } from "./common.jsx";

const FILTERS = [
  { value: "aberta", label: "Abertas" },
  { value: "encerrada", label: "Encerradas" },
  { value: "todas", label: "Todas" },
];
const AUTOR = { denunciante: "quem denunciou", denunciado: "denunciado(a)", conta_excluida: "conta excluída" };

function ReportDetail({ id, onClosed }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_dupla_chat_report", { p_id: id }), [backend, id]);
  const [note, setNote] = React.useState("");
  const [state, setState] = React.useState({ busy: false, error: null });
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const close = async () => {
    setState({ busy: true, error: null });
    try {
      await backend.rpc("app_admin_dupla_chat_report_close", { p_id: id, p_note: note.trim() || null });
      setState({ busy: false, error: null });
      onClosed();
    } catch (e) {
      setState({ busy: false, error: messageOf(e) });
    }
  };
  const messages = Array.isArray(data.messages) ? data.messages : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
        Cópia das mensagens que ainda não tinham se apagado no momento da denúncia ({messages.length}).
      </p>
      {messages.length === 0 ? (
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>Nenhuma mensagem na conversa no momento da denúncia.</p>
      ) : (
        <ol aria-label="Mensagens denunciadas" style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.map((m, i) => (
            <li key={i} style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: m.autor === "denunciado" ? "var(--danger-bg)" : "var(--surface-subtle)" }}>
              <div style={{ font: "600 12px var(--font-sans)", color: "var(--text-secondary)", marginBottom: 4 }}>
                {m.nome} ({AUTOR[m.autor] ?? m.autor}) · {dateTimeBR(m.enviada_em)}
              </div>
              <div style={{ font: "var(--type-body-sm)", color: "var(--text-primary)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.texto}</div>
            </li>
          ))}
        </ol>
      )}
      {data.status === "aberta" ? (
        <>
          <Textarea label="Anotação da equipe (opcional)" rows={3} maxLength={1000} showCount value={note} onChange={(e) => setNote(e.target.value)} />
          {state.error && <Banner tone="danger">{state.error}</Banner>}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button loading={state.busy} onClick={close}>
              Encerrar denúncia
            </Button>
          </div>
        </>
      ) : (
        data.team_note && <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Anotação da equipe: {data.team_note}</p>
      )}
    </div>
  );
}

export function AdminDuplaChatReports() {
  const { backend } = useSession();
  const [status, setStatus] = React.useState("aberta");
  const [openId, setOpenId] = React.useState(null);
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_dupla_chat_reports", { p_status: status }), [backend, status]);
  const items = data?.items ?? [];
  return (
    <Card padding={0}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Denúncias do chat do Treino em Dupla</h3>
            {data && data.open > 0 && (
              <Badge tone="warning" size="sm">
                {data.open} {data.open === 1 ? "aberta" : "abertas"}
              </Badge>
            )}
          </div>
          <SegmentedControl label="Mostrar denúncias" value={status} onChange={(v) => (setStatus(v), setOpenId(null))} options={FILTERS} />
        </div>
        <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
          Só as conversas denunciadas aparecem aqui, com a cópia das mensagens guardada na hora da denúncia. As outras conversas não podem ser lidas pela equipe.
        </p>
        {error && <LoadError error={error} retry={reload} />}
      </div>
      {!data ? (
        !error && (
          <div style={{ padding: "0 20px 20px" }}>
            <Loading />
          </div>
        )
      ) : items.length === 0 ? (
        <div style={{ padding: "0 20px 20px" }}>
          <EmptyState icon="inbox" title={status === "aberta" ? "Nenhuma denúncia aberta" : "Nenhuma denúncia"} description="Quando um aluno denunciar uma conversa do chat, ela aparece aqui." />
        </div>
      ) : (
        <div role="list" aria-label="Denúncias do chat">
          {items.map((item) => (
            <div key={item.id} role="listitem" style={{ padding: 16, borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ font: "600 14px var(--font-sans)", color: "var(--text-primary)" }}>
                    {item.reporter_name} denunciou {item.reported_name}
                  </div>
                  <div style={{ font: "var(--type-body-sm)", color: "var(--text-tertiary)" }}>
                    {dateTimeBR(item.created_at)} · {item.message_count} {item.message_count === 1 ? "mensagem" : "mensagens"}
                  </div>
                  {item.reason && <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)", marginTop: 4, overflowWrap: "anywhere" }}>Motivo: {item.reason}</div>}
                </div>
                <Badge size="sm" tone={item.status === "aberta" ? "warning" : "neutral"}>
                  {item.status === "aberta" ? "Aberta" : "Encerrada"}
                </Badge>
                <Button size="sm" variant="secondary" onClick={() => setOpenId(openId === item.id ? null : item.id)}>
                  {openId === item.id ? "Fechar" : "Ler conversa denunciada"}
                </Button>
              </div>
              {openId === item.id && (
                <ReportDetail
                  id={item.id}
                  onClosed={() => {
                    setOpenId(null);
                    reload();
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const toForm = (v) => ({
  palavras: Array.isArray(v?.palavras) ? v.palavras.join("\n") : "",
  max: v?.max != null ? String(v.max) : "",
  rajada: v?.rajada != null ? String(v.rajada) : "",
  janela_s: v?.janela_s != null ? String(v.janela_s) : "",
  guarda: v?.guarda_denuncia_dias != null ? String(v.guarda_denuncia_dias) : "",
});
const num = (s) => (String(s).trim() === "" ? null : Number(s));

export function AdminDuplaChatSettings() {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_settings"), [backend]);
  const [form, setForm] = React.useState(null);
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  React.useEffect(() => {
    if (data) setForm(toForm(data.treino_dupla_chat));
  }, [data]);
  if (error) return <LoadError error={error} retry={reload} />;
  if (!form) return <Loading />;
  const change = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setState((s) => ({ ...s, done: false }));
  };
  const save = async (event) => {
    event.preventDefault();
    setState({ saving: true, error: null, done: false });
    try {
      const palavras = form.palavras.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
      const saved = await backend.rpc("app_admin_save_dupla_chat", {
        p_settings: { palavras, max: num(form.max), rajada: num(form.rajada), janela_s: num(form.janela_s), guarda_denuncia_dias: num(form.guarda) },
      });
      setForm(toForm(saved));
      setState({ saving: false, error: null, done: true });
    } catch (err) {
      setState({ saving: false, error: messageOf(err), done: false });
    }
  };
  return (
    <form onSubmit={save} noValidate>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Chat do Treinamento em Dupla</h3>
          <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
            As mensagens se apagam 24 horas depois de enviadas. Termos clínicos que contêm uma palavra da lista não são bloqueados: só a palavra inteira.
          </p>
          <Textarea label="Palavras bloqueadas (uma por linha)" rows={5} value={form.palavras} onChange={(e) => change({ palavras: e.target.value })} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <TextField label="Tamanho máximo (caracteres)" type="number" inputMode="numeric" value={form.max} onChange={(e) => change({ max: e.target.value })} />
            <TextField label="Mensagens seguidas (máximo)" type="number" inputMode="numeric" value={form.rajada} onChange={(e) => change({ rajada: e.target.value })} />
            <TextField label="Em quantos segundos" type="number" inputMode="numeric" value={form.janela_s} onChange={(e) => change({ janela_s: e.target.value })} />
            <TextField
              label="Guardar denúncias encerradas (dias)"
              hint="Vazio: não apaga."
              type="number"
              inputMode="numeric"
              value={form.guarda}
              onChange={(e) => change({ guarda: e.target.value })}
            />
          </div>
          {state.error && <Banner tone="danger">{state.error}</Banner>}
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
            {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Configurações salvas.</span>}
            <Button type="submit" loading={state.saving}>
              Salvar configurações do chat
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
