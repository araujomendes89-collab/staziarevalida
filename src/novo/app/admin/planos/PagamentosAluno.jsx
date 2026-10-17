// Administração › Usuários › ficha do aluno › "Pagamentos" e Administração › Planos › "Devoluções" (migração …013850, ramo
// ajustes-cobranca, decisões do dono de 17/10). Só o administrador. Lista os pagamentos do aluno (com recibo, nota fiscal e as
// devoluções já feitas: quem fez, motivo, origem) e o botão "Devolver pagamento": motivo obrigatório, valor total ou parcial, e a
// escolha entre "devolver e manter acesso" e "devolver e encerrar acesso". O servidor registra (com quem fez) e pede ao Asaas; o acesso
// só muda quando o Asaas confirmar (Pix espera a autorização por token no Asaas). Sem a migração, só um aviso discreto.
import React from "react";
import { Badge, Banner, Button, Card, SegmentedControl, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, messageOf, useLoad } from "../common.jsx";
import { adminRefund, brl, dateBR } from "../../plan/billingApi.js";
import { centavosParaReais, reaisParaCentavos } from "./DireitosPorFase.jsx";

const SEM_FUNCAO = /could not find the function|schema cache|does not exist|PGRST202|42883/i;
const METODO = { pix: "Pix", cartao: "Cartão de crédito", debito: "Cartão de débito" };
const STATUS = {
  paga: ["Pago", "success"],
  pendente: ["Aguardando", "warning"],
  falhou: ["Não passou", "danger"],
  devolvida: ["Devolvido", "neutral"],
  devolvida_parcial: ["Devolvido em parte", "neutral"],
};
const DEV_STATUS = { solicitado: ["Esperando o Asaas", "warning"], feito: ["Feita", "success"], equipe: ["Para a equipe", "danger"], falhou: ["Falhou", "danger"] };
const ORIGEM = { aluno: "Pedida pelo aluno", equipe: "Equipe", painel: "Feita no painel do Asaas" };
/** O que o sistema entendeu de uma devolução feita direto no painel do Asaas. */
export const CLASSIFICACAO = {
  duplicada: "cobrança repetida: o período já estava pago por outra cobrança; acesso mantido",
  parcial: "devolução parcial; acesso mantido",
  periodo_encerrado: "período que já tinha acabado; acesso de hoje não mudou",
  conferir: "há renovação já paga depois deste período; acesso mantido, confira",
  unica: "única cobrança do período: acesso encerrado e renovação desligada",
  extra_total: "extra devolvido por inteiro: créditos cancelados",
};
const NOTA = { agendada: "Nota agendada", autorizada: "Nota emitida", cancelando: "Nota cancelando", cancelada: "Nota cancelada", erro: "Nota com erro" };

const linha = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
const fina = { font: "var(--type-caption)", color: "var(--text-tertiary)" };

const oQue = (x) => (x.tipo === "plano" ? `${String(x.codigo).toUpperCase()} ${x.ciclo}` : x.nome || `Extra ${x.codigo}`);

/** Uma devolução (aluno, equipe ou painel) em uma linha. */
function Devolucao({ d }) {
  const [rot, tom] = DEV_STATUS[d.status] ?? [d.status, "neutral"];
  return (
    <div style={{ ...linha, font: "var(--type-body-sm)" }} data-testid={`devolucao-${d.id}`}>
      <Badge size="sm" tone={tom}>{rot}</Badge>
      <span>
        {brl(d.valor_centavos)} · {ORIGEM[d.origem] ?? d.origem}
        {d.feito_por ? ` (${d.feito_por})` : ""} · {dateBR(d.em)}
        {d.acesso === "encerrar" ? " · acesso encerrado" : d.acesso === "manter" ? " · acesso mantido" : ""}
      </span>
      {d.classificacao && <span style={fina}>{CLASSIFICACAO[d.classificacao] ?? d.classificacao}</span>}
      {d.conferir && <Badge size="sm" tone="warning">Conferir</Badge>}
      {d.motivo && d.origem !== "painel" && <span style={fina}>Motivo: {d.motivo}</span>}
      {d.erro && <span style={{ ...fina, color: "var(--text-danger, #B42318)" }}>{d.erro}</span>}
    </div>
  );
}

/** O formulário "Devolver pagamento" de um pagamento. */
export function DevolverForm({ pagamento, onDone, onCancel }) {
  const { backend } = useSession();
  const resta = pagamento.valor_centavos - (pagamento.devolvido_centavos ?? 0);
  const [f, setF] = React.useState({ valor: centavosParaReais(resta), motivo: "", acesso: "" });
  const [st, setSt] = React.useState({ busy: false, error: null });
  const valor = reaisParaCentavos(f.valor);
  const motivoOk = f.motivo.trim().length >= 5;
  const valorOk = Number.isFinite(valor) && valor > 0 && valor <= resta;
  const pronto = motivoOk && valorOk && (f.acesso === "manter" || f.acesso === "encerrar");
  const enviar = async () => {
    if (!pronto) return setSt({ busy: false, error: !valorOk ? `Valor entre R$ 0,01 e ${brl(resta)}.` : !motivoOk ? "Escreva o motivo (pelo menos 5 letras)." : "Escolha o que acontece com o acesso." });
    setSt({ busy: true, error: null });
    try {
      const r = await adminRefund(backend, { cobranca_id: pagamento.id, valor_centavos: valor === resta ? null : valor, motivo: f.motivo.trim(), acesso: f.acesso });
      onDone(r.mensagem ?? "Devolução registrada.");
    } catch (err) {
      setSt({ busy: false, error: messageOf(err) });
    }
  };
  return (
    <div className="ev-panel" role="group" aria-label="Devolver pagamento" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: 12, border: "1px solid var(--border-default)" }}>
      <b>Devolver {oQue(pagamento)} de {dateBR(pagamento.pago_em ?? pagamento.em)}</b>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <TextField label="Valor a devolver (R$)" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} hint={`Até ${brl(resta)}. Tudo = devolução total.`} />
      </div>
      <TextField label="Motivo (obrigatório)" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Ex.: cobrança em dobro; desistência pedida por e-mail" maxLength={300} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ font: "var(--type-label)" }}>O que acontece com o acesso</span>
        <SegmentedControl
          label="O que acontece com o acesso"
          value={f.acesso}
          onChange={(v) => setF({ ...f, acesso: v })}
          options={[
            { value: "manter", label: "Devolver e manter acesso" },
            { value: "encerrar", label: "Devolver e encerrar acesso" },
          ]}
        />
        <span style={fina}>
          {f.acesso === "encerrar"
            ? pagamento.tipo === "plano"
              ? "O acesso pago acaba quando o Asaas confirmar a devolução, e a renovação é cancelada já."
              : "Os créditos deste extra são cancelados quando o Asaas confirmar."
            : f.acesso === "manter"
              ? "Só o dinheiro volta. O acesso e a renovação continuam como estão (ex.: cobrança em dobro)."
              : "Escolha uma das duas opções."}
        </span>
      </div>
      <span style={fina}>
        O valor volta pela mesma forma de pagamento. No Pix, a devolução só sai depois que você autorizar no painel ou no aplicativo do Asaas. Devolução parcial no cartão só a partir do dia seguinte ao pagamento.
      </span>
      {st.error && <Banner tone="danger">{st.error}</Banner>}
      <div style={linha}>
        <Button variant="danger" onClick={enviar} loading={st.busy} disabled={!pronto}>
          Confirmar devolução
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={st.busy}>
          Voltar
        </Button>
      </div>
    </div>
  );
}

/** Ficha do aluno: pagamentos, notas e devoluções, com o botão "Devolver pagamento". */
export function PagamentosAluno({ userId }) {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_billing_pagamentos", { p_user: userId }), [backend, userId]);
  const [aberto, setAberto] = React.useState(null);
  const [ok, setOk] = React.useState(null);
  let corpo;
  if (error && SEM_FUNCAO.test(String(error?.message ?? error))) corpo = <Banner tone="info">Os pagamentos ainda não estão no banco (migração 013850).</Banner>;
  else if (error) corpo = <LoadError error={error} retry={reload} />;
  else if (!data) corpo = <Loading />;
  else if (data.pagamentos.length === 0) corpo = <p style={{ margin: 0, color: "var(--text-secondary)" }}>Nenhum pagamento pelo app.</p>;
  else
    corpo = (
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }} data-testid="admin-pagamentos">
        {data.pagamentos.map((x) => {
          const [rot, tom] = STATUS[x.status] ?? [x.status, "neutral"];
          const devolvivel = (x.status === "paga" || x.status === "devolvida_parcial") && x.valor_centavos - (x.devolvido_centavos ?? 0) > 0;
          const emAndamento = (x.devolucoes ?? []).some((d) => d.status === "solicitado");
          return (
            <li key={x.id} style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 12, borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={linha}>
                <b>{oQue(x)}</b>
                <span>{brl(x.valor_centavos)}</span>
                <span style={fina}>{METODO[x.metodo] ?? x.metodo} · {dateBR(x.pago_em ?? x.em)}</span>
                <Badge size="sm" tone={tom}>{rot}</Badge>
                {x.devolvido_centavos > 0 && <span style={fina}>devolvido {brl(x.devolvido_centavos)}</span>}
                {x.nota_status && <Badge size="sm" tone={x.nota_status === "erro" ? "danger" : "neutral"}>{NOTA[x.nota_status] ?? x.nota_status}</Badge>}
                {x.recibo_url && <a href={x.recibo_url} target="_blank" rel="noopener noreferrer" style={{ font: "var(--type-body-sm)" }}>Recibo</a>}
                {x.nota_url && x.nota_status === "autorizada" && <a href={x.nota_url} target="_blank" rel="noopener noreferrer" style={{ font: "var(--type-body-sm)" }}>Nota fiscal</a>}
                {devolvivel && aberto !== x.id && (
                  <Button size="sm" variant="secondary" icon="undo-2" disabled={emAndamento} onClick={() => (setOk(null), setAberto(x.id))}>
                    {emAndamento ? "Devolução esperando o Asaas" : "Devolver pagamento"}
                  </Button>
                )}
              </div>
              {(x.devolucoes ?? []).map((d) => <Devolucao key={d.id} d={d} />)}
              {aberto === x.id && (
                <DevolverForm
                  pagamento={x}
                  onCancel={() => setAberto(null)}
                  onDone={(m) => {
                    setAberto(null);
                    setOk(m);
                    reload();
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    );
  const c = data?.contrato;
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-label="Pagamentos do aluno">
        <div>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Pagamentos</h3>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>
            Pagamentos feitos pelo app, com recibo, nota fiscal e devoluções. "Devolver pagamento" pede a devolução ao Asaas e fica registrado com o seu nome e o motivo.
            {c ? ` Assinatura: ${String(c.plano).toUpperCase()} ${c.ciclo}, ${c.metodo === "pix" ? "Pix" : "cartão"}, ${c.renova ? "renova" : "não renova"}, até ${dateBR(c.periodo_fim)}.` : ""}
          </p>
        </div>
        {ok && <Banner tone="success">{ok}</Banner>}
        {corpo}
      </div>
    </Card>
  );
}

/** Aba Planos: devoluções recentes de todos (as que esperam a equipe e as feitas no painel para conferir vêm primeiro). */
export function DevolucoesRecentes() {
  const { backend } = useSession();
  const { data, error, reload } = useLoad(() => backend.rpc("app_admin_billing_devolucoes", { p_limite: 40 }), [backend]);
  let corpo;
  if (error && SEM_FUNCAO.test(String(error?.message ?? error))) return null;
  if (error) corpo = <LoadError error={error} retry={reload} />;
  else if (!data) corpo = <Loading />;
  else if (data.length === 0) corpo = <p style={{ margin: 0, color: "var(--text-secondary)" }}>Nenhuma devolução ainda.</p>;
  else
    corpo = (
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }} data-testid="admin-devolucoes">
        {data.map((d) => (
          <li key={d.id} style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 10, borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={linha}>
              <b style={{ overflowWrap: "anywhere" }}>{d.email ?? "Conta excluída"}</b>
              {d.pagamento && <span style={fina}>{d.pagamento.tipo === "plano" ? `${String(d.pagamento.codigo).toUpperCase()} ${d.pagamento.ciclo}` : `Extra ${d.pagamento.codigo}`} · {METODO[d.pagamento.metodo] ?? d.pagamento.metodo}</span>}
            </div>
            <Devolucao d={d} />
          </li>
        ))}
      </ul>
    );
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-label="Devoluções">
        <div>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Devoluções</h3>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>
            Pedidas pelos alunos, feitas pela equipe e feitas direto no painel do Asaas. As que esperam a equipe ou pedem conferência aparecem primeiro. Para devolver, abra a ficha do aluno em Usuários.
          </p>
        </div>
        {corpo}
      </div>
    </Card>
  );
}
