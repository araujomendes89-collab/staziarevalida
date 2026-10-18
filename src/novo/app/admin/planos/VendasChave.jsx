// Administração › Planos › "Vendas" (migração …013850, pedido de 17/10 noite): botão "Abrir vendas" / "Fechar vendas" no lugar do
// SQL em billing_config. Só o administrador; pergunta antes; a mudança fica no Registro. Mostra o que fica à venda (planos e extras de
// IA), a chave dos cadeados e se a cobrança está ligada no servidor, para conferir a ordem de ligar: abrir as vendas e, logo
// depois, ligar os cadeados (decisão do dono: os dois ligados na abertura).
import React from "react";
import { Badge, Banner, Button, Card } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, messageOf, useLoad } from "../common.jsx";
import { brl, getBillingOverview } from "../../plan/billingApi.js";

const SEM_FUNCAO = /could not find the function|schema cache|does not exist|PGRST202|42883/i;
const fina = { font: "var(--type-body-sm)", color: "var(--text-secondary)", margin: 0 };

export function VendasChave() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_billing_vendas"), [backend]);
  const [servidor, setServidor] = React.useState(null);
  const [pergunta, setPergunta] = React.useState(false);
  const [st, setSt] = React.useState({ busy: false, error: null, ok: null });
  React.useEffect(() => {
    let vivo = true;
    getBillingOverview(backend).then((o) => vivo && setServidor(Boolean(o?.enabled)));
    return () => {
      vivo = false;
    };
  }, [backend]);
  if (error && SEM_FUNCAO.test(String(error?.message ?? error))) return null;
  if (error) return <LoadError error={error} retry={reload} />;
  if (!data) return <Loading />;
  const ligadas = Boolean(data.vendas_ligadas);
  const mudar = async () => {
    setSt({ busy: true, error: null, ok: null });
    try {
      const novo = await backend.rpc("app_admin_billing_vendas_ligar", { p_ligar: !ligadas });
      setData(novo);
      setPergunta(false);
      setSt({ busy: false, error: null, ok: novo.vendas_ligadas ? "Vendas abertas." : "Vendas fechadas." });
    } catch (err) {
      setSt({ busy: false, error: messageOf(err), ok: null });
    }
  };
  const planos = (data.planos_a_venda ?? []).map((p) => `${p.nome} (${brl(p.mensal_centavos)} por mês ou ${brl(p.trimestral_centavos)} no trimestral)`);
  const extras = (data.extras_a_venda ?? []).map((x) => `${x.nome} ${brl(x.valor_centavos)}`);
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-label="Vendas" data-testid="vendas-chave">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>Vendas</h3>
          <Badge tone={ligadas ? "success" : "neutral"}>{ligadas ? "Abertas" : "Fechadas"}</Badge>
          <Badge tone={data.cadeados_ligados ? "success" : "warning"}>{data.cadeados_ligados ? "Cadeados ligados" : "Cadeados desligados"}</Badge>
          {servidor === false && <Badge tone="warning">Cobrança desligada no servidor</Badge>}
        </div>
        <p style={fina}>
          {ligadas ? "Os alunos podem comprar. " : "Ninguém consegue comprar agora; quem já assina continua com acesso e as renovações continuam. "}
          À venda quando abertas: {planos.length ? planos.join(", ") : "nenhum plano"}; extras de IA: {extras.length ? extras.join(", ") : "nenhum"}.
          {data.atualizado_em ? ` Última mudança em ${new Date(data.atualizado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}${data.atualizado_por ? ` por ${data.atualizado_por}` : ""}.` : ""}
        </p>
        {servidor === false && (
          <Banner tone="warning">A chave do Asaas ainda não está no servidor: mesmo com as vendas abertas, a parte de pagamento não aparece para o aluno.</Banner>
        )}
        {ligadas && data.cadeados_ligados === false && (
          <Banner tone="warning" title="Ligue os cadeados também">
            Com as vendas abertas e os cadeados desligados, o aluno compra, mas os créditos dos extras de IA só valem com os cadeados ligados. Ligue em "Planos por fase e cadeados", mais abaixo.
          </Banner>
        )}
        {st.ok && <Banner tone="success">{st.ok}</Banner>}
        {st.error && <Banner tone="danger">{st.error}</Banner>}
        {pergunta ? (
          <div className="ev-panel" role="alertdialog" aria-label={ligadas ? "Fechar as vendas" : "Abrir as vendas"} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 12, border: "1px solid var(--border-default)" }}>
            <b>{ligadas ? "Fechar as vendas agora?" : "Abrir as vendas agora?"}</b>
            <p style={fina}>
              {ligadas
                ? "Nenhuma compra nova poderá ser feita. Pagamentos já abertos, assinaturas e renovações continuam."
                : `Os alunos passam a poder comprar o que está à venda (acima), por Pix, cartão de crédito ou cartão de débito.${data.cadeados_ligados ? "" : " Logo depois, ligue os cadeados (decisão do dono: os dois ligados na abertura)."}`}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant={ligadas ? "danger" : "primary"} onClick={mudar} loading={st.busy}>
                {ligadas ? "Sim, fechar as vendas" : "Sim, abrir as vendas"}
              </Button>
              <Button variant="secondary" onClick={() => setPergunta(false)} disabled={st.busy}>
                Voltar
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button variant={ligadas ? "secondary" : "primary"} icon={ligadas ? "lock" : "shopping-cart"} onClick={() => (setSt({ busy: false, error: null, ok: null }), setPergunta(true))}>
              {ligadas ? "Fechar vendas" : "Abrir vendas"}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
