// Administração › "Vendas e pagamentos" (migração …013850, pedido de 17/10 noite). Só o administrador. Lista do período com filtro
// por situação (pago, pendente, vencido, devolvido, em análise) e busca por aluno: aluno, produto, forma, valor, data, recibo e nota.
// Os pedidos de devolução que ficaram para a equipe (prazo de 5 dias úteis) vêm primeiro, com o botão "Devolver pagamento". Total
// do período: recebido, devolvido e líquido (sem as taxas do Asaas, que saem no extrato do Asaas).
import React from "react";
import { Badge, Banner, Button, Card, SegmentedControl, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, useDebounced, useLoad } from "../common.jsx";
import { brl, dateBR } from "../../plan/billingApi.js";
import { DevolverForm } from "./PagamentosAluno.jsx";

const SEM_FUNCAO = /could not find the function|schema cache|does not exist|PGRST202|42883/i;
const SITUACAO = {
  pago: ["Pago", "success"],
  pendente: ["Pendente", "warning"],
  vencido: ["Vencido", "danger"],
  devolvido: ["Devolvido", "neutral"],
  em_analise: ["Em análise", "brand"],
};
const METODO = { pix: "Pix", cartao: "Crédito", debito: "Débito" };
const dia = (d) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const fina = { font: "var(--type-caption)", color: "var(--text-tertiary)" };

function Total({ rotulo, valor, dica }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={fina}>{rotulo}</span>
      <span style={{ font: "var(--type-h4)", fontVariantNumeric: "tabular-nums" }}>{valor}</span>
      {dica && <span style={fina}>{dica}</span>}
    </div>
  );
}

function Linha({ l, aberto, setAberto, onFeito }) {
  const [rot, tom] = SITUACAO[l.situacao] ?? [l.situacao, "neutral"];
  const d = l.devolucao;
  const podeDevolver = l.cobranca_id && ["pago", "em_analise"].includes(l.situacao) && !(d && d.status === "solicitado") && l.valor_centavos - (l.devolvido_centavos ?? 0) > 0;
  const chave = l.cobranca_id ? `c${l.cobranca_id}` : `p${l.pedido_id}`;
  return (
    <li style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 0", borderBottom: "1px solid var(--border-subtle)" }} data-testid={`venda-${chave}`}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.4fr) auto", gap: 10, alignItems: "center" }} className="vp-linha">
        <div style={{ minWidth: 0 }}>
          <b style={{ overflowWrap: "anywhere" }}>{l.nome ?? l.email ?? "Conta excluída"}</b>
          {l.nome && l.email && <div style={{ ...fina, overflowWrap: "anywhere" }}>{l.email}</div>}
        </div>
        <div style={{ minWidth: 0 }}>
          <span>{l.produto}</span>
          <div style={fina}>
            {METODO[l.metodo] ?? l.metodo} · {dateBR(l.em)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <b style={{ fontVariantNumeric: "tabular-nums" }}>{brl(l.valor_centavos)}</b>
          <Badge size="sm" tone={tom}>{rot}</Badge>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", font: "var(--type-body-sm)" }}>
        {l.devolvido_centavos > 0 && <span style={fina}>devolvido {brl(l.devolvido_centavos)}</span>}
        {l.recibo_url && <a href={l.recibo_url} target="_blank" rel="noopener noreferrer">Recibo</a>}
        {l.nota_url ? <a href={l.nota_url} target="_blank" rel="noopener noreferrer">Nota fiscal</a> : l.nota_status ? <span style={fina}>Nota: {l.nota_status}</span> : null}
        {d && (
          <span style={{ ...fina, color: d.status === "equipe" ? "var(--text-primary)" : undefined }}>
            {d.status === "equipe"
              ? `Pedido de devolução de ${brl(d.valor_centavos)} esperando a equipe desde ${dateBR(d.em)} · prazo ${dateBR(`${d.prazo}T12:00:00-03:00`)}`
              : `Devolução de ${brl(d.valor_centavos)} esperando a confirmação do Asaas (Pix: autorize com o token)`}
            {d.erro ? ` · ${d.erro}` : ""}
          </span>
        )}
        {podeDevolver && aberto !== chave && (
          <Button size="sm" variant={l.situacao === "em_analise" ? "primary" : "secondary"} icon="undo-2" onClick={() => setAberto(chave)}>
            Devolver pagamento
          </Button>
        )}
      </div>
      {aberto === chave && (
        <DevolverForm
          pagamento={{ id: l.cobranca_id, valor_centavos: l.valor_centavos, devolvido_centavos: l.devolvido_centavos, tipo: l.tipo, codigo: l.codigo, ciclo: l.ciclo, nome: l.produto, pago_em: l.pago_em, em: l.em }}
          onCancel={() => setAberto(null)}
          onDone={(m) => {
            setAberto(null);
            onFeito(m);
          }}
        />
      )}
    </li>
  );
}

export function VendasPagamentos() {
  const { backend } = useSession();
  const hoje = new Date();
  const [de, setDe] = React.useState(dia(new Date(hoje.getTime() - 30 * 86400e3)));
  const [ate, setAte] = React.useState(dia(hoje));
  const [situacao, setSituacao] = React.useState("todas");
  const [busca, setBusca] = React.useState("");
  const q = useDebounced(busca.trim(), 350);
  const [aberto, setAberto] = React.useState(null);
  const [ok, setOk] = React.useState(null);
  const { data, error, reload } = useLoad(
    () => backend.rpc("app_admin_billing_vendas_lista", { p_de: de || null, p_ate: ate || null, p_situacao: situacao === "todas" ? null : situacao, p_busca: q || null, p_limite: 300 }),
    [backend, de, ate, situacao, q]
  );
  if (error && SEM_FUNCAO.test(String(error?.message ?? error))) return <Banner tone="info">A lista de vendas ainda não está no banco (migração 013850).</Banner>;
  const t = data?.totais;
  const n = t?.por_situacao ?? {};
  const opcoes = [
    { value: "todas", label: "Todas" },
    { value: "pago", label: `Pagos${n.pago != null ? ` (${n.pago})` : ""}` },
    { value: "pendente", label: `Pendentes${n.pendente != null ? ` (${n.pendente})` : ""}` },
    { value: "vencido", label: `Vencidos${n.vencido != null ? ` (${n.vencido})` : ""}` },
    { value: "devolvido", label: `Devolvidos${n.devolvido != null ? ` (${n.devolvido})` : ""}` },
    { value: "em_analise", label: `Em análise${n.em_analise != null ? ` (${n.em_analise})` : ""}` },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <h2 style={{ margin: 0, font: "var(--type-h3)" }}>Vendas e pagamentos</h2>
            <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>
              Tudo o que foi comprado pelo app no período. Pedidos de devolução que esperam a equipe aparecem primeiro (prazo de 5 dias úteis). Os valores são os pagos pelo aluno; as taxas do Asaas aparecem no extrato do Asaas.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <TextField label="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            <TextField label="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            <TextField label="Aluno (nome ou e-mail)" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" />
          </div>
          <div style={{ overflowX: "auto" }}>
            <SegmentedControl label="Situação" value={situacao} onChange={setSituacao} options={opcoes} />
          </div>
          {t && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }} data-testid="vendas-totais">
              <Total rotulo="Recebido no período" valor={brl(t.recebido_centavos)} dica={`${t.pagamentos} pagamento(s)`} />
              <Total rotulo="Devolvido" valor={brl(t.devolvido_centavos)} />
              <Total rotulo="Líquido (antes das taxas)" valor={brl(t.liquido_centavos)} />
              <Total rotulo="Em análise" valor={String(n.em_analise ?? 0)} dica="pedidos de devolução" />
            </div>
          )}
        </div>
      </Card>
      {ok && <Banner tone="success">{ok}</Banner>}
      <Card>
        {error ? (
          <LoadError error={error} retry={reload} />
        ) : !data ? (
          <Loading />
        ) : data.linhas.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>Nada neste período{situacao !== "todas" ? " com esta situação" : ""}.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }} data-testid="vendas-lista">
            {data.linhas.map((l) => (
              <Linha
                key={l.cobranca_id ? `c${l.cobranca_id}` : `p${l.pedido_id}`}
                l={l}
                aberto={aberto}
                setAberto={(k) => (setOk(null), setAberto(k))}
                onFeito={(m) => {
                  setOk(m);
                  reload();
                }}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
