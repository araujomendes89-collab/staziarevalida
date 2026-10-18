// Administração → Lista de interesse da 2ª fase (migração 013960; pedido do dono, 18/10/2026). Só administrador: a aba some para os
// outros, o servidor confere o papel (/api/interesse/admin) e cada função do banco confere de novo. O aluno nunca vê esta tela.
//   * números: quantos estão na lista, quantos clicaram para entrar no grupo, e-mails confirmados, por dia;
//   * link do grupo do WhatsApp (só https://chat.whatsapp.com/…; vazio = o site mostra só "Pronto", sem botão);
//   * lista com busca (WhatsApp, e-mail ou nome), botão para abrir a conversa no WhatsApp (wa.me), exportar CSV e "Tirar da lista";
//   * "Avisar todos que a 2ª fase abriu" POR E-MAIL (só quem informou e confirmou o e-mail; uma vez por pessoa), com prévia e
//     confirmação aqui mesmo. O aviso pelo WhatsApp é feito no próprio grupo (não há envio automático pelo WhatsApp).
import React from "react";
import { Badge, Banner, Button, Card, SectionHeader, SelectField, StatCard, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { LoadError, Loading, dateBR, dateTimeBR, messageOf, useDebounced, useLoad } from "./common.jsx";
import { GRUPO_LINK_RE, interesseApi, linkConversa, whatsappBonito } from "./listaInteresseApi.js";

const FILTROS = [
  { value: "", label: "Todos" },
  { value: "ativos", label: "Na lista" },
  { value: "clicaram_grupo", label: "Clicaram no grupo" },
  { value: "nao_clicaram_grupo", label: "Não clicaram no grupo" },
  { value: "email_confirmado", label: "E-mail confirmado" },
  { value: "email_pendente", label: "E-mail não confirmado" },
  { value: "email_avisado", label: "Avisados por e-mail" },
  { value: "sem_email", label: "Sem e-mail" },
  { value: "descadastrados", label: "Saíram da lista" },
];
const EMAIL = { sem_email: ["Sem e-mail", "neutral"], pendente: ["E-mail não confirmado", "warning"], confirmado: ["E-mail confirmado", "success"], avisado: ["Avisado por e-mail", "info"] };
const pessoas = (n) => `${n} ${n === 1 ? "pessoa" : "pessoas"}`;
const textoPequeno = { margin: 0, font: "var(--type-body-sm)", color: "var(--text-secondary)" };

export function AdminListaInteresse() {
  const { backend } = useSession();
  const resumo = useLoad(() => interesseApi.resumo(backend), [backend]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }} data-testid="admin-lista-interesse">
      {resumo.error ? <LoadError error={resumo.error} retry={resumo.reload} /> : !resumo.data ? <Loading /> : <Resumo r={resumo.data} />}
      {resumo.data && <LinkDoGrupo atual={resumo.data.grupo?.link ?? null} onSalvo={resumo.reload} />}
      <Lista onMudou={resumo.reload} />
      {resumo.data && <AvisarTodos aAvisar={Number(resumo.data.a_avisar) || 0} aviso={resumo.data.aviso} onAvisado={resumo.reload} />}
    </div>
  );
}

function Resumo({ r }) {
  const c = r.contagem ?? {};
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SectionHeader icon="list-checks" title="Lista de interesse da 2ª fase" subtitle="Quem pediu, no site, para ser avisado quando a 2ª fase abrir. O WhatsApp não é verificado." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <StatCard label="Na lista" value={r.total} icon="users-round" />
          <StatCard label="Clicaram no grupo" value={c.clicaram_grupo ?? 0} icon="message-circle" tone="success" />
          <StatCard label="E-mails confirmados" value={(c.email_confirmado ?? 0) + (c.email_avisado ?? 0)} caption={`${c.email_pendente ?? 0} sem confirmar`} icon="mail" tone="info" />
          <StatCard label="Saíram da lista" value={c.descadastrados ?? 0} icon="user-minus" tone="neutral" />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", font: "var(--type-body-sm)" }} aria-label="Por dia (últimos 14 dias)">
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
                <th style={{ padding: "6px 8px" }}>Dia</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Inscrições</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>E-mails confirmados</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Cliques no grupo</th>
              </tr>
            </thead>
            <tbody>
              {(r.por_dia ?? []).map((d) => (
                <tr key={d.dia} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "6px 8px" }}>{d.dia.split("-").reverse().join("/")}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.inscritos}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.emails_confirmados}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.cliques_grupo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function LinkDoGrupo({ atual, onSalvo }) {
  const { backend } = useSession();
  const [link, setLink] = React.useState(atual ?? "");
  const [estado, setEstado] = React.useState({ ocupado: false, erro: null, ok: null });
  React.useEffect(() => setLink(atual ?? ""), [atual]);
  const limpo = link.trim();
  const problema = limpo && !GRUPO_LINK_RE.test(limpo)
    ? /\?/.test(limpo) ? "Tire o que vem depois do “?” (ex.: ?s=cl&p=…): deixe só https://chat.whatsapp.com/CÓDIGO." : "Cole o link de convite do grupo: https://chat.whatsapp.com/…"
    : null;
  const salvar = async () => {
    setEstado({ ocupado: true, erro: null, ok: null });
    try {
      const r = await interesseApi.salvarGrupo(backend, limpo);
      setEstado({ ocupado: false, erro: null, ok: r.link ? "Link salvo. O botão “Entrar no grupo do WhatsApp” já aparece para quem entra na lista." : "Link apagado. O site mostra só “Pronto”, sem o botão do grupo." });
      onSalvo();
    } catch (e) {
      setEstado({ ocupado: false, erro: messageOf(e), ok: null });
    }
  };
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHeader icon="link" title="Link do grupo da 2ª fase" subtitle="Depois de entrar na lista, a pessoa vê o botão “Entrar no grupo do WhatsApp”. Sem link, aparece só “Pronto”." />
        <TextField label="Link de convite do grupo do WhatsApp" value={link} onChange={(e) => { setLink(e.target.value); setEstado({ ocupado: false, erro: null, ok: null }); }} placeholder="https://chat.whatsapp.com/…" error={problema ?? undefined} inputMode="url" autoComplete="off" />
        {estado.erro && <Banner tone="danger">{estado.erro}</Banner>}
        {estado.ok && <Banner tone="success">{estado.ok}</Banner>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {atual && (
            <a className="sm-btn sm-btn--secondary" href={atual} target="_blank" rel="noopener noreferrer">
              Abrir o grupo
            </a>
          )}
          <Button icon="save" loading={estado.ocupado} disabled={Boolean(problema) || limpo === (atual ?? "")} onClick={salvar}>
            {limpo ? "Salvar link" : "Apagar link"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Lista({ onMudou }) {
  const { backend } = useSession();
  const [busca, setBusca] = React.useState("");
  const [filtro, setFiltro] = React.useState("ativos");
  const [pagina, setPagina] = React.useState(0);
  const [baixando, setBaixando] = React.useState({ ocupado: false, erro: null });
  const b = useDebounced(busca.trim(), 350);
  React.useEffect(() => setPagina(0), [b, filtro]);
  const lista = useLoad(() => interesseApi.lista(backend, { busca: b, filtro, pagina }), [backend, b, filtro, pagina]);
  const exportar = async () => {
    setBaixando({ ocupado: true, erro: null });
    try {
      const blob = await interesseApi.csv(backend, filtro);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lista-interesse-2a-fase-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBaixando({ ocupado: false, erro: null });
    } catch (e) {
      setBaixando({ ocupado: false, erro: messageOf(e) });
    }
  };
  const aoTirar = (linha) => {
    lista.setData({ ...lista.data, itens: lista.data.itens.map((x) => (x.id === linha.id ? linha : x)) });
    onMudou();
  };
  const total = Number(lista.data?.total) || 0;
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHeader icon="users-round" title="Pessoas na lista" subtitle="O WhatsApp não é verificado: confira antes de chamar. O CSV leva o filtro escolhido e fica no Registro." />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 220px" }}>
            <TextField label="Buscar" icon="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="WhatsApp, e-mail ou nome" maxLength={100} />
          </div>
          <div style={{ flex: "0 1 220px" }}>
            <SelectField label="Mostrar" value={filtro} onChange={(e) => setFiltro(e.target.value)} options={FILTROS} />
          </div>
          <Button variant="secondary" icon="download" loading={baixando.ocupado} onClick={exportar}>
            Exportar CSV
          </Button>
        </div>
        {baixando.erro && <Banner tone="danger">{baixando.erro}</Banner>}
        {lista.error ? (
          <LoadError error={lista.error} retry={lista.reload} />
        ) : !lista.data ? (
          <Loading />
        ) : total === 0 ? (
          <p style={textoPequeno}>{b ? "Ninguém encontrado com essa busca." : "Ninguém na lista ainda."}</p>
        ) : (
          <>
            <p style={textoPequeno}>{pessoas(total)}</p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }} aria-label="Pessoas na lista de interesse">
              {lista.data.itens.map((i) => (
                <Pessoa key={i.id} i={i} onTirado={aoTirar} />
              ))}
            </ul>
            {(pagina > 0 || total > (pagina + 1) * 50) && (
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <Button variant="secondary" size="sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                  Anteriores
                </Button>
                <Button variant="secondary" size="sm" disabled={total <= (pagina + 1) * 50} onClick={() => setPagina((p) => p + 1)}>
                  Próximos
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Pessoa({ i, onTirado }) {
  const { backend } = useSession();
  const [confirmar, setConfirmar] = React.useState(false);
  const [estado, setEstado] = React.useState({ ocupado: false, erro: null });
  const [rotulo, tom] = EMAIL[i.email_estado] ?? [i.email_estado, "neutral"];
  const saiu = i.estado === "descadastrado";
  const tirar = async () => {
    setEstado({ ocupado: true, erro: null });
    try {
      onTirado(await interesseApi.tirar(backend, i.id));
      setConfirmar(false);
      setEstado({ ocupado: false, erro: null });
    } catch (e) {
      setEstado({ ocupado: false, erro: messageOf(e) });
    }
  };
  return (
    <li className="sm-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, opacity: saiu ? 0.7 : 1 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>{whatsappBonito(i.whatsapp)}</strong>
          <span style={{ ...textoPequeno, overflowWrap: "anywhere" }}>
            {[i.nome, i.email].filter(Boolean).join(" · ") || "Sem nome e sem e-mail"}
          </span>
        </div>
        <a className="sm-btn sm-btn--secondary sm-btn--sm" href={linkConversa(i.whatsapp)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir conversa no WhatsApp com ${whatsappBonito(i.whatsapp)}`}>
          Abrir conversa
        </a>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {saiu ? <Badge tone="neutral">Saiu da lista em {dateBR(i.descadastrado_em)}</Badge> : null}
        <Badge tone={i.grupo_clicado_em ? "success" : "neutral"}>{i.grupo_clicado_em ? `Clicou no grupo em ${dateBR(i.grupo_clicado_em)}` : "Não clicou no grupo"}</Badge>
        <Badge tone={tom}>{rotulo}</Badge>
        <span style={textoPequeno}>Entrou em {dateTimeBR(i.criado_em)}{i.origem && i.origem !== "site" ? ` · ${i.origem}` : ""}</span>
      </div>
      {estado.erro && <Banner tone="danger">{estado.erro}</Banner>}
      {!saiu && (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {confirmar ? (
            <>
              <span style={{ ...textoPequeno, alignSelf: "center" }}>Tirar esta pessoa da lista? Ela não recebe mais o aviso.</span>
              <Button variant="secondary" size="sm" onClick={() => setConfirmar(false)} disabled={estado.ocupado}>
                Cancelar
              </Button>
              <Button variant="danger" size="sm" loading={estado.ocupado} onClick={tirar}>
                Sim, tirar
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmar(true)}>
              Tirar da lista
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function AvisarTodos({ aAvisar, aviso, onAvisado }) {
  const { backend } = useSession();
  const [previa, setPrevia] = React.useState(null);
  const [estado, setEstado] = React.useState({ ocupado: false, erro: null, ok: null });
  const verPrevia = async () => {
    setEstado({ ocupado: true, erro: null, ok: null });
    try {
      setPrevia(await interesseApi.previaAviso(backend));
      setEstado({ ocupado: false, erro: null, ok: null });
    } catch (e) {
      setEstado({ ocupado: false, erro: messageOf(e), ok: null });
    }
  };
  const avisar = async () => {
    setEstado({ ocupado: true, erro: null, ok: null });
    try {
      const r = await interesseApi.avisar(backend, previa.destinatarios);
      setPrevia(null);
      setEstado({ ocupado: false, erro: null, ok: `${pessoas(r.emails)} entraram na fila de e-mail. Saem em lotes de alguns minutos (até 1.500 e-mails por dia, junto com os outros e-mails do app).` });
      onAvisado();
    } catch (e) {
      setPrevia(null);
      setEstado({ ocupado: false, erro: messageOf(e), ok: null });
    }
  };
  const andamento = aviso && (aviso.na_fila || aviso.enviados || aviso.nao_enviados)
    ? `Aviso por e-mail: ${aviso.enviados} enviados${aviso.na_fila ? `, ${aviso.na_fila} na fila` : ""}${aviso.nao_enviados ? `, ${aviso.nao_enviados} não enviados (saíram da lista ou o e-mail falhou)` : ""}${aviso.incertos ? `, ${aviso.incertos} incertos` : ""}.`
    : null;
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHeader icon="send" title="Avisar todos que a 2ª fase abriu" subtitle="Por e-mail, só para quem informou e confirmou o e-mail. Cada pessoa recebe uma vez só. No WhatsApp, avise pelo próprio grupo." />
        {andamento && <p style={textoPequeno}>{andamento}</p>}
        {estado.erro && <Banner tone="danger">{estado.erro}</Banner>}
        {estado.ok && <Banner tone="success">{estado.ok}</Banner>}
        {!previa ? (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button icon="eye" loading={estado.ocupado} disabled={aAvisar === 0} onClick={verPrevia}>
              {aAvisar === 0 ? "Ninguém com e-mail confirmado esperando o aviso" : `Ver prévia (${pessoas(aAvisar)})`}
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="previa-aviso">
            <p style={{ margin: 0 }}>
              Vai para <b>{pessoas(previa.destinatarios)}</b> com e-mail confirmado. Não recebem: {previa.email_pendente} com e-mail sem confirmar e {previa.so_whatsapp} só com WhatsApp.
            </p>
            <div style={{ border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 14, background: "var(--surface-sunken, transparent)" }}>
              <div style={{ ...textoPequeno, marginBottom: 6 }}>Assunto: <b>{previa.email?.assunto}</b></div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", font: "var(--type-body-sm)", color: "var(--text-primary)" }}>{previa.email?.texto}</pre>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={() => setPrevia(null)} disabled={estado.ocupado}>
                Cancelar
              </Button>
              <Button icon="send" loading={estado.ocupado} disabled={!previa.destinatarios} onClick={avisar}>
                {`Sim, avisar ${pessoas(previa.destinatarios)}`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
