// Administração > Comunicados (migração 013830; só administrador, o aluno nunca vê esta tela): escrever um comunicado (título, texto e
// link opcional) para todos os alunos ou só para um plano/fase, ver a prévia (como fica no sino e quantos alunos recebem) e enviar.
// Cada envio fica registrado com quem enviou (lista abaixo e Administração > Registro). O mesmo envio não sai duas vezes.
import React from "react";
import { Banner, Button, Card, SectionHeader, SegmentedControl, SelectField, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { LoadError, Loading, TextArea, dateTimeBR, messageOf, useLoad } from "./common.jsx";
import { NotificacaoItem } from "../notificacoes/Sino.jsx";
import { FILTROS, PUBLICOS, publicoRotulo } from "../notificacoes/publico.js";
import "../notificacoes/notificacoes.css";

const LINK_OK = /^(\/novo)?\/[a-z0-9/_-]*(\?[a-z0-9=&_-]*)?$|^https:\/\/[^\s<>"]+$/;
const novoIdem = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `com-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** O que falta para poder ver a prévia (null = pronto). */
export function problemaDoComunicado({ titulo, texto, link }) {
  const t = titulo.trim();
  const x = texto.trim();
  const l = link.trim();
  if (t.length < 3) return "Escreva um título (pelo menos 3 letras).";
  if (x.length < 3) return "Escreva o texto do comunicado.";
  if (l && !LINK_OK.test(l)) return "O link precisa ser uma tela do app (ex.: /atualizacoes) ou um endereço que começa com https://.";
  return null;
}

export function AdminComunicados() {
  const { backend } = useSession();
  const enviados = useLoad(() => backend.rpc("app_admin_comunicados", { p_limite: 30 }), [backend]);
  const [form, setForm] = React.useState({ titulo: "", texto: "", link: "", publico: "todos", filtro: "" });
  const [previa, setPrevia] = React.useState(null); // { destinatarios, idem }
  const [estado, setEstado] = React.useState({ ocupado: false, erro: null, enviado: null });

  const mudar = (campo) => (valor) => {
    setForm((f) => ({ ...f, [campo]: valor, ...(campo === "publico" ? { filtro: valor === "todos" ? "" : FILTROS[valor][0].value } : {}) }));
    setPrevia(null);
    setEstado((e) => ({ ...e, erro: null, enviado: null }));
  };
  const problema = problemaDoComunicado(form);
  const filtro = form.publico === "todos" ? null : form.filtro;

  const verPrevia = async () => {
    setEstado({ ocupado: true, erro: null, enviado: null });
    try {
      const r = await backend.rpc("app_admin_comunicado_previa", { p_publico: form.publico, p_filtro: filtro });
      setPrevia({ destinatarios: Number(r?.destinatarios) || 0, idem: novoIdem() });
      setEstado({ ocupado: false, erro: null, enviado: null });
    } catch (e) {
      setEstado({ ocupado: false, erro: messageOf(e), enviado: null });
    }
  };
  const enviar = async () => {
    if (!previa) return;
    setEstado({ ocupado: true, erro: null, enviado: null });
    try {
      const r = await backend.rpc("app_admin_comunicado_enviar", {
        p_titulo: form.titulo.trim(),
        p_texto: form.texto.trim(),
        p_link: form.link.trim() || null,
        p_publico: form.publico,
        p_filtro: filtro,
        p_idem: previa.idem,
      });
      setEstado({ ocupado: false, erro: null, enviado: r });
      setForm({ titulo: "", texto: "", link: "", publico: "todos", filtro: "" });
      setPrevia(null);
      enviados.reload();
    } catch (e) {
      setEstado({ ocupado: false, erro: messageOf(e), enviado: null });
    }
  };

  const exemplo = {
    id: 0,
    tipo: "comunicado",
    titulo: form.titulo.trim() || "Título do comunicado",
    texto: form.texto.trim() || "Texto do comunicado.",
    rota: form.link.trim() ? "link" : "nenhuma",
    link: form.link.trim() || null,
    acao: form.link.trim() ? "Abrir" : null,
    em: new Date().toISOString(),
    lida: false,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }} data-testid="admin-comunicados">
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SectionHeader icon="megaphone" title="Novo comunicado" subtitle="Aparece no sino de notificações dos alunos escolhidos. Não vai por e-mail." />
          <TextField label="Título" value={form.titulo} maxLength={140} onChange={(e) => mudar("titulo")(e.target.value)} hint={`${form.titulo.trim().length}/140`} placeholder="Ex.: Simulado nacional no sábado" />
          <TextArea label="Texto" value={form.texto} maxLength={600} rows={4} onChange={mudar("texto")} hint={`${form.texto.trim().length}/600 · curto e direto, como uma mensagem`} />
          <TextField label="Link (opcional)" value={form.link} maxLength={300} onChange={(e) => mudar("link")(e.target.value)} placeholder="/atualizacoes ou https://…" hint="Uma tela do app (ex.: /atualizacoes, /planos) ou uma página https://. Vira o botão “Abrir”." />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="sm-field__label">Para quem</span>
            <SegmentedControl label="Para quem" value={form.publico} onChange={mudar("publico")} options={PUBLICOS} />
            {form.publico !== "todos" && (
              <div style={{ maxWidth: 320 }}>
                <SelectField label={form.publico === "plano" ? "Plano" : "Fase"} value={form.filtro} onChange={(e) => mudar("filtro")(e.target.value)} options={FILTROS[form.publico]} />
              </div>
            )}
          </div>
          {problema && (form.titulo || form.texto || form.link) ? <span className="sm-field__hint">{problema}</span> : null}
          {estado.erro && <Banner tone="danger">{estado.erro}</Banner>}
          {estado.enviado && (
            <Banner tone="success" title="Comunicado enviado">
              {estado.enviado.repetido ? "Este envio já tinha sido feito; nada foi mandado de novo." : `Foi para ${estado.enviado.destinatarios} ${estado.enviado.destinatarios === 1 ? "aluno" : "alunos"}.`}
            </Banner>
          )}
          {!previa ? (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button icon="eye" disabled={Boolean(problema)} loading={estado.ocupado} onClick={verPrevia}>
                Ver prévia
              </Button>
            </div>
          ) : (
            <div className="ntf-previa" data-testid="previa-comunicado">
              <div className="ntf-previa-t">Prévia: como o aluno vê no sino</div>
              <div className="ntf-previa-caixa">
                <NotificacaoItem n={exemplo} />
              </div>
              <p className="ntf-previa-p">
                Vai para <b>{previa.destinatarios} {previa.destinatarios === 1 ? "aluno" : "alunos"}</b> ({publicoRotulo(form.publico, filtro)}). Depois de enviado não dá para editar nem apagar.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <Button variant="secondary" onClick={() => setPrevia(null)} disabled={estado.ocupado}>
                  Voltar e editar
                </Button>
                <Button icon="send" loading={estado.ocupado} disabled={previa.destinatarios === 0} onClick={enviar}>
                  {previa.destinatarios === 0 ? "Nenhum aluno neste público" : `Enviar para ${previa.destinatarios} ${previa.destinatarios === 1 ? "aluno" : "alunos"}`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionHeader icon="history" title="Enviados" subtitle="Quem enviou, para quem e quantos alunos já leram." />
          {enviados.error ? (
            <LoadError error={enviados.error} retry={enviados.reload} />
          ) : !enviados.data ? (
            <Loading />
          ) : enviados.data.length === 0 ? (
            <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>Nenhum comunicado enviado ainda.</p>
          ) : (
            <ul className="ntf-enviados">
              {enviados.data.map((c) => (
                <li key={c.id}>
                  <b>{c.titulo}</b>
                  <span>{c.texto}</span>
                  <small>
                    {publicoRotulo(c.publico, c.filtro)} · {dateTimeBR(c.enviado_em)} · por {c.enviado_por} · lido por {c.lidas} de {c.destinatarios}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
