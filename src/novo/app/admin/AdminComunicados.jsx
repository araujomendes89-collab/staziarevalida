// Administração > Comunicados (migração 013830; só administrador, o aluno nunca vê esta tela): escrever um comunicado (título, texto e
// link opcional) para todos os alunos ou só para um plano/fase, ver a prévia (como fica no sino e quantos alunos recebem) e enviar.
// Cada envio fica registrado com quem enviou (lista abaixo e Administração > Registro). O mesmo envio não sai duas vezes.
//
// 013940 (pedido do dono, 18/10): o texto é escrito no editor profissional (CampoRico: negrito, itálico, listas, títulos, links; o
// mesmo de Questões, Aulas, Atualizações e Podcasts). Na lista, cada comunicado pode ser EDITADO (título, texto e link; o público só
// enquanto nenhum aluno leu) e APAGADO (some do sino dos alunos; confirmação aqui mesmo, com "Desfazer" por alguns segundos e
// "Restaurar" no filtro Apagados). Tudo conferido no banco (só administrador) e guardado no histórico (quem, quando, antes e depois).
// Comunicado não vai por e-mail: editar ou apagar também não manda nada.
import React from "react";
import { Badge, Banner, Button, Card, SectionHeader, SegmentedControl, SelectField, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { LoadError, Loading, dateTimeBR, messageOf, useLoad } from "./common.jsx";
import { CampoRico } from "../editorPro/CampoRico.jsx";
import ParagrafoRico from "../editorPro/leitor/ParagrafoRico.jsx";
import { NotificacaoItem } from "../notificacoes/Sino.jsx";
import { FILTROS, PUBLICOS, publicoRotulo } from "../notificacoes/publico.js";
import "../notificacoes/notificacoes.css";

const LINK_OK = /^(\/novo)?\/[a-z0-9/_-]*(\?[a-z0-9=&_-]*)?$|^https:\/\/[^\s<>"]+$/;
const TEXTO_MAX = 600;
/** Tempo do "Desfazer" depois de apagar (depois disso, o comunicado continua em Apagados, com "Restaurar"). */
export const DESFAZER_MS = 10_000;
const novoIdem = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `com-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const alunos = (n) => `${n} ${n === 1 ? "aluno" : "alunos"}`;
const SEM_EMAIL = "Comunicado não vai por e-mail: aparece só no sino dos alunos.";

/** O que falta para poder ver a prévia ou salvar (null = pronto). */
export function problemaDoComunicado({ titulo, texto, link }) {
  const t = titulo.trim();
  const x = texto.trim();
  const l = link.trim();
  if (t.length < 3) return "Escreva um título (pelo menos 3 letras).";
  if (x.length < 3) return "Escreva o texto do comunicado.";
  if (x.length > TEXTO_MAX) return `O texto passou de ${TEXTO_MAX} letras (está com ${x.length}). Encurte um pouco.`;
  if (l && !LINK_OK.test(l)) return "O link precisa ser uma tela do app (ex.: /atualizacoes) ou um endereço que começa com https://.";
  return null;
}

/** Como a notificação aparece no sino (prévia da Administração). */
function exemploDoSino({ titulo, texto, rico, link }, extra = {}) {
  const l = link.trim();
  return {
    id: 0,
    tipo: "comunicado",
    titulo: titulo.trim() || "Título do comunicado",
    texto: texto.trim() || "Texto do comunicado.",
    rico: texto.trim() ? rico ?? null : null,
    rota: l ? "link" : "nenhuma",
    link: l || null,
    acao: l ? "Abrir" : null,
    em: new Date().toISOString(),
    lida: false,
    ...extra,
  };
}

/** Título, texto (editor profissional) e link: o mesmo bloco no comunicado novo e na edição. */
function CamposDoComunicado({ form, mudar, idBase }) {
  return (
    <>
      <TextField label="Título" value={form.titulo} maxLength={140} onChange={(e) => mudar("titulo")(e.target.value)} hint={`${form.titulo.trim().length}/140`} placeholder="Ex.: Simulado nacional no sábado" />
      <CampoRico
        id={`${idBase}-texto`}
        label="Texto"
        texto={form.texto}
        rico={form.rico}
        maxLength={TEXTO_MAX}
        onChange={(c) => mudar("texto")(c)}
        hint={`${form.texto.trim().length}/${TEXTO_MAX} · curto e direto, como uma mensagem. Dá para usar negrito, itálico, listas, títulos e links.`}
      />
      <TextField label="Link (opcional)" value={form.link} maxLength={300} onChange={(e) => mudar("link")(e.target.value)} placeholder="/atualizacoes ou https://…" hint="Uma tela do app (ex.: /atualizacoes, /planos) ou uma página https://. Vira o botão “Abrir”." />
    </>
  );
}

/** "Para quem": todos, um plano ou uma fase. */
function ParaQuem({ form, mudar }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="sm-field__label">Para quem</span>
      <SegmentedControl label="Para quem" value={form.publico} onChange={mudar("publico")} options={PUBLICOS} />
      {form.publico !== "todos" && (
        <div style={{ maxWidth: 320 }}>
          <SelectField label={form.publico === "plano" ? "Plano" : "Fase"} value={form.filtro} onChange={(e) => mudar("filtro")(e.target.value)} options={FILTROS[form.publico]} />
        </div>
      )}
    </div>
  );
}

/** Mudança de campo do formulário: o texto vem do editor como { texto, rico }; mudar o público escolhe o 1º filtro. */
const aplicar = (f, campo, valor) => {
  if (campo === "texto") return { ...f, texto: valor.texto, rico: valor.rico };
  if (campo === "publico") return { ...f, publico: valor, filtro: valor === "todos" ? "" : FILTROS[valor][0].value };
  return { ...f, [campo]: valor };
};

export function AdminComunicados() {
  const { backend } = useSession();
  const [situacao, setSituacao] = React.useState("ativos");
  const enviados = useLoad(() => backend.rpc("app_admin_comunicados", { p_limite: 30, p_situacao: situacao }), [backend, situacao]);
  const [form, setForm] = React.useState({ titulo: "", texto: "", rico: null, link: "", publico: "todos", filtro: "" });
  const [previa, setPrevia] = React.useState(null); // { destinatarios, idem }
  const [estado, setEstado] = React.useState({ ocupado: false, erro: null, enviado: null });
  const [apagado, setApagado] = React.useState(null); // { id, titulo } do último apagado (barra "Desfazer")
  const [aviso, setAviso] = React.useState(null); // { tom, texto } depois de editar/restaurar

  const mudar = (campo) => (valor) => {
    setForm((f) => aplicar(f, campo, valor));
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
        p_rico: form.rico ?? null,
        p_link: form.link.trim() || null,
        p_publico: form.publico,
        p_filtro: filtro,
        p_idem: previa.idem,
      });
      setEstado({ ocupado: false, erro: null, enviado: r });
      setForm({ titulo: "", texto: "", rico: null, link: "", publico: "todos", filtro: "" });
      setPrevia(null);
      if (situacao === "ativos") enviados.reload();
      else setSituacao("ativos");
    } catch (e) {
      setEstado({ ocupado: false, erro: messageOf(e), enviado: null });
    }
  };

  const fimDesfazer = React.useCallback(() => setApagado(null), []);
  const aoApagar = (c) => {
    setAviso(null);
    setApagado({ id: c.id, titulo: c.titulo });
    enviados.setData((enviados.data ?? []).filter((x) => x.id !== c.id));
  };
  const aoRestaurar = (c) => {
    setApagado(null);
    setAviso({ tom: "success", texto: `“${c.titulo}” voltou para o sino dos alunos.` });
    enviados.reload();
  };
  const aoEditar = (c) => {
    setAviso({ tom: "success", texto: `“${c.titulo}” foi atualizado. Os alunos veem a versão nova com o selo “editado”.` });
    enviados.setData((enviados.data ?? []).map((x) => (x.id === c.id ? c : x)));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }} data-testid="admin-comunicados">
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SectionHeader icon="megaphone" title="Novo comunicado" subtitle="Aparece no sino de notificações dos alunos escolhidos. Não vai por e-mail." />
          <CamposDoComunicado form={form} mudar={mudar} idBase="novo" />
          <ParaQuem form={form} mudar={mudar} />
          {problema && (form.titulo || form.texto || form.link) ? <span className="sm-field__hint">{problema}</span> : null}
          {estado.erro && <Banner tone="danger">{estado.erro}</Banner>}
          {estado.enviado && (
            <Banner tone="success" title="Comunicado enviado">
              {estado.enviado.repetido ? "Este envio já tinha sido feito; nada foi mandado de novo." : `Foi para ${alunos(estado.enviado.destinatarios)}.`}
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
                <NotificacaoItem n={exemploDoSino(form)} />
              </div>
              <p className="ntf-previa-p">
                Vai para <b>{alunos(previa.destinatarios)}</b> ({publicoRotulo(form.publico, filtro)}). Depois de enviado, dá para editar ou apagar na lista abaixo.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <Button variant="secondary" onClick={() => setPrevia(null)} disabled={estado.ocupado}>
                  Voltar e editar
                </Button>
                <Button icon="send" loading={estado.ocupado} disabled={previa.destinatarios === 0} onClick={enviar}>
                  {previa.destinatarios === 0 ? "Nenhum aluno neste público" : `Enviar para ${alunos(previa.destinatarios)}`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionHeader icon="history" title="Comunicados enviados" subtitle="Quem enviou, para quem e quantos alunos já leram. Dá para editar ou apagar." />
          <div style={{ alignSelf: "flex-start" }}>
            <SegmentedControl
              label="Mostrar"
              value={situacao}
              onChange={(v) => {
                setSituacao(v);
                setAviso(null);
              }}
              options={[
                { value: "ativos", label: "Enviados" },
                { value: "apagados", label: "Apagados" },
              ]}
            />
          </div>
          {apagado && <BarraDesfazer key={apagado.id} item={apagado} onRestaurado={aoRestaurar} onFim={fimDesfazer} />}
          {aviso && <Banner tone={aviso.tom}>{aviso.texto}</Banner>}
          {enviados.error ? (
            <LoadError error={enviados.error} retry={enviados.reload} />
          ) : !enviados.data ? (
            <Loading />
          ) : enviados.data.length === 0 ? (
            <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
              {situacao === "apagados" ? "Nenhum comunicado apagado." : "Nenhum comunicado enviado ainda."}
            </p>
          ) : (
            <ul className="ntf-enviados" aria-label={situacao === "apagados" ? "Comunicados apagados" : "Comunicados enviados"}>
              {enviados.data.map((c) => (
                <ItemEnviado key={c.id} c={c} onApagado={aoApagar} onEditado={aoEditar} onRestaurado={aoRestaurar} />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Barra "Comunicado apagado. Desfazer" que some sozinha depois de alguns segundos. */
function BarraDesfazer({ item, onRestaurado, onFim }) {
  const { backend } = useSession();
  const [estado, setEstado] = React.useState({ ocupado: false, erro: null });
  React.useEffect(() => {
    if (estado.ocupado || estado.erro) return undefined;
    const t = setTimeout(onFim, DESFAZER_MS);
    return () => clearTimeout(t);
  }, [estado.ocupado, estado.erro, onFim]);
  const desfazer = async () => {
    setEstado({ ocupado: true, erro: null });
    try {
      const r = await backend.rpc("app_admin_comunicado_restaurar", { p_id: item.id });
      onRestaurado(r ?? item);
    } catch (e) {
      setEstado({ ocupado: false, erro: messageOf(e) });
    }
  };
  return (
    <div data-testid="barra-desfazer">
      <Banner
        tone={estado.erro ? "danger" : "info"}
        icon="trash-2"
        title="Comunicado apagado"
        action={
          <Button size="sm" variant="secondary" icon="undo-2" loading={estado.ocupado} onClick={desfazer}>
            Desfazer
          </Button>
        }
      >
        {estado.erro ?? `“${item.titulo}” saiu do sino dos alunos. Ele fica em “Apagados”, de onde dá para restaurar.`}
      </Banner>
    </div>
  );
}

/** Um comunicado da lista, com Editar / Apagar (ou Restaurar, nos apagados). */
function ItemEnviado({ c, onApagado, onEditado, onRestaurado }) {
  const { backend } = useSession();
  const [modo, setModo] = React.useState(null); // null | "editar" | "apagar" | "historico"
  const [motivo, setMotivo] = React.useState("");
  const [estado, setEstado] = React.useState({ ocupado: false, erro: null });
  const apagadoJa = Boolean(c.apagado_em);

  const apagar = async () => {
    setEstado({ ocupado: true, erro: null });
    try {
      await backend.rpc("app_admin_comunicado_apagar", { p_id: c.id, p_motivo: motivo.trim() || null });
      onApagado(c);
    } catch (e) {
      setEstado({ ocupado: false, erro: messageOf(e) });
    }
  };
  const restaurar = async () => {
    setEstado({ ocupado: true, erro: null });
    try {
      const r = await backend.rpc("app_admin_comunicado_restaurar", { p_id: c.id });
      onRestaurado(r ?? c);
    } catch (e) {
      setEstado({ ocupado: false, erro: messageOf(e) });
    }
  };

  return (
    <li className={modo ? "is-aberto" : undefined} data-testid={`comunicado-${c.id}`}>
      <div className="ntf-env-cab">
        <div className="ntf-env-txt">
          <b>{c.titulo}</b>
          <ParagrafoRico texto={c.texto} rico={c.rico} className="ntf-rico" />
          <small>
            {publicoRotulo(c.publico, c.filtro)} · {dateTimeBR(c.enviado_em)} · por {c.enviado_por} · lido por {c.lidas} de {c.destinatarios}
          </small>
          {(c.editado_em || apagadoJa) && (
            <small>
              {c.editado_em ? `Editado por ${c.editado_por} em ${dateTimeBR(c.editado_em)}` : ""}
              {c.editado_em && apagadoJa ? " · " : ""}
              {apagadoJa ? `Apagado por ${c.apagado_por} em ${dateTimeBR(c.apagado_em)}${c.apagado_motivo ? ` · Motivo: ${c.apagado_motivo}` : ""}` : ""}
            </small>
          )}
        </div>
        {!modo && (
          <div className="ntf-env-acoes">
            {(c.versao > 1 || apagadoJa) && (
              <Button size="sm" variant="ghost" icon="history" onClick={() => setModo("historico")}>
                Histórico
              </Button>
            )}
            {apagadoJa ? (
              <Button size="sm" variant="secondary" icon="archive-restore" loading={estado.ocupado} onClick={restaurar}>
                Restaurar
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" icon="pencil" onClick={() => setModo("editar")} aria-label={`Editar “${c.titulo}”`}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" icon="trash-2" onClick={() => setModo("apagar")} aria-label={`Apagar “${c.titulo}”`}>
                  Apagar
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {!modo && estado.erro && <Banner tone="danger">{estado.erro}</Banner>}

      {modo === "apagar" && (
        <div className="ntf-confirma" role="group" aria-label="Confirmar apagar" data-testid="confirmar-apagar">
          <b>Apagar “{c.titulo}”?</b>
          <p>
            Ele some do sino e da lista de notificações {c.destinatarios === 1 ? "do aluno que recebeu" : `dos ${c.destinatarios} alunos que receberam`}
            {c.lidas > 0 ? ` (inclusive de quem já leu: ${c.lidas})` : ""}. Nada é apagado de vez: fica em “Apagados”, de onde dá para restaurar. Nenhum e-mail é enviado.
          </p>
          <TextField label="Motivo (opcional)" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: data errada, mandei de novo corrigido" hint="Fica no histórico; o aluno não vê." />
          {estado.erro && <Banner tone="danger">{estado.erro}</Banner>}
          <div className="ntf-botoes">
            <Button variant="secondary" disabled={estado.ocupado} onClick={() => (setModo(null), setEstado({ ocupado: false, erro: null }))}>
              Cancelar
            </Button>
            <Button variant="danger" icon="trash-2" loading={estado.ocupado} onClick={apagar}>
              Apagar comunicado
            </Button>
          </div>
        </div>
      )}

      {modo === "editar" && (
        <EditarComunicado
          c={c}
          onCancelar={() => setModo(null)}
          onSalvo={(r) => {
            setModo(null);
            onEditado(r);
          }}
        />
      )}

      {modo === "historico" && <HistoricoComunicado c={c} onFechar={() => setModo(null)} />}
    </li>
  );
}

/** Edição de um comunicado já enviado. */
function EditarComunicado({ c, onCancelar, onSalvo }) {
  const { backend } = useSession();
  const inicial = React.useMemo(
    () => ({ titulo: c.titulo ?? "", texto: c.texto ?? "", rico: c.rico ?? null, link: c.link ?? "", publico: c.publico, filtro: c.filtro ?? "" }),
    [c]
  );
  const [form, setForm] = React.useState(inicial);
  const [estado, setEstado] = React.useState({ ocupado: false, erro: null });
  const [contagem, setContagem] = React.useState(null); // alunos do público novo (só quando o público muda)
  const podeMudarPublico = Number(c.lidas) === 0;
  const filtro = form.publico === "todos" ? null : form.filtro;
  const mudouPublico = podeMudarPublico && (form.publico !== c.publico || (filtro ?? null) !== (c.filtro ?? null));
  const mudar = (campo) => (valor) => {
    setForm((f) => aplicar(f, campo, valor));
    setEstado((e) => ({ ...e, erro: null }));
  };
  const problema = problemaDoComunicado(form);
  const igual =
    !mudouPublico && form.titulo.trim() === inicial.titulo && form.texto.trim() === inicial.texto && JSON.stringify(form.rico ?? null) === JSON.stringify(inicial.rico) && form.link.trim() === inicial.link;

  React.useEffect(() => {
    if (!mudouPublico) {
      setContagem(null);
      return undefined;
    }
    let vivo = true;
    setContagem("…");
    backend
      .rpc("app_admin_comunicado_previa", { p_publico: form.publico, p_filtro: filtro })
      .then((r) => vivo && setContagem(Number(r?.destinatarios) || 0))
      .catch(() => vivo && setContagem(null));
    return () => {
      vivo = false;
    };
  }, [mudouPublico, form.publico, filtro, backend]);

  const salvar = async () => {
    setEstado({ ocupado: true, erro: null });
    try {
      const r = await backend.rpc("app_admin_comunicado_editar", {
        p_id: c.id,
        p_titulo: form.titulo.trim(),
        p_texto: form.texto.trim(),
        p_rico: form.rico ?? null,
        p_link: form.link.trim() || null,
        p_publico: mudouPublico ? form.publico : null,
        p_filtro: mudouPublico ? filtro : null,
        p_versao: c.versao ?? null,
      });
      onSalvo(r ?? { ...c, ...form });
    } catch (e) {
      setEstado({ ocupado: false, erro: messageOf(e) });
    }
  };

  return (
    <div className="ntf-edita" data-testid="editar-comunicado">
      <div className="ntf-edita-t">Editar comunicado enviado</div>
      <Banner tone="info" icon="mail-x">
        A versão nova aparece no sino dos alunos com o selo “editado”, e quem já leu continua com ele como lido. {SEM_EMAIL} Editar não manda e-mail nem notificação nova.
      </Banner>
      <CamposDoComunicado form={form} mudar={mudar} idBase={`editar-${c.id}`} />
      {podeMudarPublico ? (
        <>
          <ParaQuem form={form} mudar={mudar} />
          <span className="sm-field__hint">
            Nenhum aluno leu ainda, então ainda dá para mudar para quem vai.
            {mudouPublico && contagem !== null ? ` Com a mudança, vai para ${contagem === "…" ? "…" : alunos(contagem)} (${publicoRotulo(form.publico, filtro)}); quem não é desse público deixa de ver.` : ""}
          </span>
        </>
      ) : (
        <div className="ntf-fixo" data-testid="publico-fixo">
          <b>Para quem: {publicoRotulo(c.publico, c.filtro)} ({alunos(c.destinatarios)})</b>
          <span>
            O público não muda mais porque {c.lidas === 1 ? "1 aluno já leu" : `${c.lidas} alunos já leram`}. Dá para corrigir o título, o texto e o link. Para falar com outro público, envie um comunicado novo.
          </span>
        </div>
      )}
      <div className="ntf-previa-caixa">
        <NotificacaoItem n={exemploDoSino(form, { editado: true, em: c.enviado_em })} />
      </div>
      {problema && <span className="sm-field__hint">{problema}</span>}
      {estado.erro && <Banner tone="danger">{estado.erro}</Banner>}
      <div className="ntf-botoes">
        <Button variant="secondary" disabled={estado.ocupado} onClick={onCancelar}>
          Cancelar
        </Button>
        <Button icon="check" loading={estado.ocupado} disabled={Boolean(problema) || igual || (mudouPublico && contagem === 0)} onClick={salvar}>
          {mudouPublico && contagem === 0 ? "Nenhum aluno neste público" : "Salvar alteração"}
        </Button>
      </div>
    </div>
  );
}

const ACAO_HIST = { editar: "Editado", apagar: "Apagado", restaurar: "Restaurado" };

/** Histórico de versões (quem, quando, antes e depois). */
function HistoricoComunicado({ c, onFechar }) {
  const { backend } = useSession();
  const h = useLoad(() => backend.rpc("app_admin_comunicado_historico", { p_id: c.id }), [backend, c.id]);
  return (
    <div className="ntf-edita" data-testid="historico-comunicado">
      <div className="ntf-edita-t">Histórico</div>
      {h.error ? (
        <LoadError error={h.error} retry={h.reload} />
      ) : !h.data ? (
        <Loading />
      ) : h.data.length === 0 ? (
        <span className="sm-field__hint">Sem mudanças depois do envio.</span>
      ) : (
        <ul className="ntf-hist">
          {h.data.map((x) => (
            <li key={x.id}>
              <Badge size="sm" tone={x.acao === "apagar" ? "danger" : x.acao === "restaurar" ? "success" : "neutral"}>{ACAO_HIST[x.acao] ?? x.acao}</Badge> por {x.por} em {dateTimeBR(x.em)}
              {x.acao === "editar" && x.antes?.titulo !== x.depois?.titulo ? ` · título antes: “${x.antes?.titulo}”` : ""}
              {x.acao === "editar" && x.antes?.texto !== x.depois?.texto ? " · texto mudou" : ""}
              {x.acao === "editar" && JSON.stringify(x.antes?.rico ?? null) !== JSON.stringify(x.depois?.rico ?? null) && x.antes?.texto === x.depois?.texto ? " · formatação mudou" : ""}
              {x.acao === "editar" && x.antes?.link !== x.depois?.link ? " · link mudou" : ""}
              {x.acao === "editar" && (x.antes?.publico !== x.depois?.publico || x.antes?.filtro !== x.depois?.filtro) ? ` · público: ${publicoRotulo(x.antes?.publico, x.antes?.filtro)} → ${publicoRotulo(x.depois?.publico, x.depois?.filtro)}` : ""}
              {x.motivo ? ` · Motivo: ${x.motivo}` : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="ntf-botoes">
        <Button variant="secondary" size="sm" onClick={onFechar}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
