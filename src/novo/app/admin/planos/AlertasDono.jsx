// Administração › Planos › Carteira de IA › "Alertas por e-mail" (migração …013850, decisões do dono de 17/10). Só o administrador.
// E-mail para o dono quando o gasto de IA do dia passa de 80% e de 100% do teto da conta, quando um aluno passa do limite "fora do
// comum" e, de manhã, o resumo do dia anterior (desligável). Uma vez só por evento. A tarefa de hora em hora gera e manda.
import React from "react";
import { Badge, Banner, Button, Card, Switch, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, messageOf, useLoad } from "../common.jsx";

const SEM_FUNCAO = /could not find the function|schema cache|does not exist|PGRST202|42883/i;
const TIPO = {
  teto_80: "80% do teto do dia",
  teto_100: "Teto do dia (100%)",
  aluno_fora_do_comum: "Aluno fora do comum",
  resumo_diario: "Resumo diário",
  devolucao_conferir: "Devolução para conferir",
};
const EMAIL = { pendente: ["Na fila", "warning"], enviando: ["Enviando", "warning"], enviado: ["Enviado", "success"], falhou: ["Falhou", "danger"], expirado: ["Não enviado (sem e-mail no servidor)", "neutral"] };

function Form({ data, setData, onSalvo }) {
  const { backend } = useSession();
  const c = data.config;
  const [f, setF] = React.useState({
    email: c.email ?? "",
    ligado: Boolean(c.ligado),
    resumo: Boolean(c.resumo_diario),
    limite: Number(c.aluno_limite_usd_dia ?? 1).toFixed(2).replace(".", ","),
  });
  const [st, setSt] = React.useState({ saving: false, error: null });
  const salvar = async () => {
    setSt({ saving: true, error: null });
    onSalvo(false);
    try {
      const novo = await backend.rpc("app_admin_alertas_dono_salvar", { p_dados: { email: f.email.trim(), ligado: f.ligado, resumo_diario: f.resumo, aluno_limite_usd_dia: f.limite.trim().replace(",", ".") } });
      setSt({ saving: false, error: null });
      onSalvo(true);
      setData(novo); // o formulário renasce com o que o banco gravou (ex.: e-mail em minúsculas)
    } catch (err) {
      setSt({ saving: false, error: messageOf(err) });
    }
  };
  const marca = (v) => (typeof v === "boolean" ? v : Boolean(v?.target?.checked));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <TextField label="Mandar os alertas para" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} hint="Padrão: suporte@staziamed.com.br" />
        <TextField label="Aluno fora do comum: a partir de (US$ por dia)" value={f.limite} onChange={(e) => setF({ ...f, limite: e.target.value })} hint="Custo de IA de um aluno num dia" />
      </div>
      <Switch label="Alertas ligados" description="80% e 100% do teto do dia, aluno fora do comum e devolução para conferir" checked={f.ligado} onChange={(v) => setF({ ...f, ligado: marca(v) })} />
      <Switch label="Resumo diário do custo de IA" description="De manhã, os números do dia anterior" checked={f.resumo} onChange={(v) => setF({ ...f, resumo: marca(v) })} />
      {st.error && <Banner tone="danger">{st.error}</Banner>}
      <div>
        <Button onClick={salvar} loading={st.saving}>Salvar alertas</Button>
      </div>
    </div>
  );
}

export function AlertasDono() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_alertas_dono"), [backend]);
  const [salvo, setSalvo] = React.useState(false);
  if (error && SEM_FUNCAO.test(String(error?.message ?? error))) return null;
  let corpo;
  if (error) corpo = <LoadError error={error} retry={reload} />;
  else if (!data) corpo = <Loading />;
  else
    corpo = (
      <>
        <Form key={JSON.stringify(data.config)} data={data} setData={setData} onSalvo={setSalvo} />
        {salvo && <Banner tone="success">Salvo.</Banner>}
        {data.recentes.length > 0 && (
          <details>
            <summary>Últimos alertas ({data.recentes.length})</summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, font: "var(--type-body-sm)" }}>
              {data.recentes.map((a) => {
                const [rot, tom] = EMAIL[a.email_status] ?? [a.email_status, "neutral"];
                return (
                  <li key={a.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>{new Date(a.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                    <Badge size="sm">{TIPO[a.tipo] ?? a.tipo}</Badge>
                    <span>{a.titulo}</span>
                    <Badge size="sm" tone={tom}>{rot}</Badge>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </>
    );
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-label="Alertas por e-mail">
        <div>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Alertas por e-mail</h3>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>
            Um e-mail quando o gasto de IA do dia passa de 80% e de 100% do teto, quando um aluno passa do limite fora do comum e quando uma devolução feita no painel do Asaas pede conferência. Uma vez só por evento. A conferência roda de hora em hora.
          </p>
        </div>
        {corpo}
      </div>
    </Card>
  );
}
