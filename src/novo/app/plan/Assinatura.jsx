// Minha conta › Assinatura (planos etapa 4). Só aparece com a cobrança ligada no servidor e para aluno (equipe e revisor não têm
// plano). Mostra: plano atual, próxima cobrança, forma de pagamento, trocar para Pix/cartão, cancelar (sem multa, a devolução volta
// pela mesma forma de pagamento), histórico de pagamentos com recibo e link da nota fiscal (013850) e os avisos recentes. Quem decide tudo é o servidor.
import React from "react";
import { Badge, Banner, Button, Icon, IconTile } from "../../ds";
import { useSession } from "../session.jsx";
import { brl, cancelRenewal, changePaymentMethod, dateBR, getBillingOverview, newIdem, requestRefund } from "./billingApi.js";
import { PedidoAberto, RenovacaoPendente, abrirAbaVazia, pedidoDoResumo } from "./BillingSection.jsx";
import "./planos.css";

const CICLO = { mensal: "mensal", trimestral: "trimestral" };
const METODO = { pix: "Pix", cartao: "Cartão de crédito", debito: "Cartão de débito" };
const STATUS = {
  paga: ["Pago", "success"],
  pendente: ["Aguardando", "warning"],
  falhou: ["Não passou", "danger"],
  devolvida: ["Devolvido", "neutral"],
  devolvida_parcial: ["Devolvido em parte", "neutral"],
};
const REGRA = {
  integral_7_dias: "Até 7 dias da contratação: devolução integral.",
  trimestral_meses_nao_iniciados: "Trimestral: meses ainda não iniciados, menos 10%.",
  extra_creditos_nao_usados: "Extra: créditos não usados, menos 10%.",
};

/** A cobrança está ligada para esta pessoa? (para a Conta mostrar ou não a seção). Falha = desligada, em silêncio. */
export function useCobrancaLigada(ativo = true) {
  const { backend } = useSession();
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    getBillingOverview(backend).then((x) => vivo && setOn(Boolean(x?.enabled)));
    return () => {
      vivo = false;
    };
  }, [backend, ativo]);
  return on;
}

/** Pergunta de confirmação dentro da própria seção (sem janela do navegador). */
function Confirmar({ titulo, texto, sim, onSim, onNao, perigo, busy }) {
  return (
    <div className="ev-panel as-confirma" role="alertdialog" aria-label={titulo}>
      <h4 className="bl-h3">{titulo}</h4>
      <p>{texto}</p>
      <div className="bl-acoes">
        <Button variant={perigo ? "danger" : "primary"} onClick={onSim} loading={busy}>
          {sim}
        </Button>
        <Button variant="secondary" onClick={onNao} disabled={busy}>
          Voltar
        </Button>
      </div>
    </div>
  );
}

export function AssinaturaSection({ go, Cabecalho }) {
  const { backend, refresh } = useSession();
  const [ov, setOv] = React.useState(null);
  const [hist, setHist] = React.useState(null);
  const [avisos, setAvisos] = React.useState([]);
  const [tick, setTick] = React.useState(0);
  const [pergunta, setPergunta] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [pedido, setPedido] = React.useState(null);

  React.useEffect(() => {
    let vivo = true;
    getBillingOverview(backend).then((x) => vivo && setOv(x));
    Promise.resolve()
      .then(() => backend.rpc("app_billing_historico"))
      .then((h) => vivo && setHist(h ?? null))
      .catch(() => vivo && setHist(null));
    Promise.resolve()
      .then(() => backend.rpc("app_meus_avisos"))
      .then((a) => vivo && setAvisos(Array.isArray(a?.recentes) ? a.recentes : []))
      .catch(() => vivo && setAvisos([]));
    return () => {
      vivo = false;
    };
  }, [backend, tick]);
  const recarregar = React.useCallback(() => {
    setTick((n) => n + 1);
    Promise.resolve(refresh?.()).catch(() => undefined);
  }, [refresh]);

  const titulo = Cabecalho ? <Cabecalho title="Assinatura" subtitle="Plano, pagamento, renovação, recibos e cancelamento" /> : null;
  if (!ov) return <>{titulo}<p className="bl-fina">Carregando a assinatura…</p></>;
  if (!ov.enabled) return <>{titulo}<p className="bl-fina">A assinatura pelo app ainda não está disponível.</p></>;

  const c = ov.contrato;
  const vigente = c && new Date(c.periodo_fim) > new Date();
  const aberto = pedido ?? pedidoDoResumo(ov);
  const pagamentos = hist?.pagamentos ?? [];
  const contratoUrl = hist?.contrato_url ?? ov.contrato_doc?.url ?? "/novo/termos";
  // Contrato 3.0: "Desistir da compra" nos 7 dias (CDC art. 49) = devolução integral do plano, pela mesma forma de pagamento
  // devolução já pedida (em andamento, com a equipe ou feita) para uma compra: o botão some e a tela diz como está (o servidor também
  // tira a compra da lista; isto cobre a tela que ainda não recarregou)
  const registradas = pagamentos.filter((x) => x.devolucao && x.devolucao.status !== "falhou");
  const jaPedida = new Set(registradas.map((x) => x.id));
  const podeDevolver = (ov.devolucoes ?? []).filter((d) => !jaPedida.has(d.cobranca_id));
  const desistencia = podeDevolver.find((d) => d.tipo === "plano" && d.regra === "integral_7_dias") ?? null;
  const outrasDevolucoes = podeDevolver.filter((d) => d !== desistencia);

  const agir = async (fn) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
      setPergunta(null);
    }
  };

  return (
    <div className="as" data-testid="assinatura">
      {titulo}
      {ov.mode === "test" && <Badge tone="warning">Modo de teste: nenhum valor real é cobrado</Badge>}
      {ov.renovacao_pendente && !aberto && <RenovacaoPendente pendente={ov.renovacao_pendente} onPedido={setPedido} onErro={(m) => (setMsg(m), recarregar())} />}
      {aberto && (
        <PedidoAberto
          pedido={aberto}
          onChange={(x) => {
            // estado final (ex.: a troca para cartão que não passou): a tela segura o pedido até o aluno escolher o que fazer
            if (x && x.status !== "aberto") setPedido(x);
            recarregar();
          }}
          onNovo={(_metodo, final) => {
            setPedido(null);
            // "Tentar de novo" depois da troca para cartão que não passou: volta à pergunta da troca
            if (final?.motivo === "renovacao" && final.metodo !== "pix" && final.status === "falhou") setPergunta("trocar");
            recarregar();
          }}
        />
      )}

      {vigente ? (
        <div className="ev-panel as-plano" data-testid="assinatura-plano">
          <div className="as-plano__top">
            <IconTile name="badge-check" tone="pro" size={48} />
            <div className="as-plano__t">
              <span className="as-k">Seu plano</span>
              <b className="as-nome">
                {c.plano.toUpperCase()} {CICLO[c.ciclo]}
              </b>
              <span className="bl-fina">{brl(c.valor_centavos)} à vista {c.ciclo === "trimestral" ? "a cada 3 meses" : "por mês"}</span>
            </div>
            {c.renova ? <Badge tone="success">Ativa</Badge> : <Badge tone="warning">Sem renovação</Badge>}
          </div>
          <dl className="bl-resumo">
            <div className="bl-resumo__l">
              <dt>{c.renova ? "Próxima cobrança" : "Acesso até"}</dt>
              <dd>
                {dateBR(c.periodo_fim)}
                {c.renova && ` · ${brl(c.valor_centavos)}`}
              </dd>
            </div>
            <div className="bl-resumo__l">
              <dt>Forma de pagamento</dt>
              <dd>
                {METODO[c.metodo]}
                {c.renova && (c.metodo === "cartao" ? " · renova sozinho no dia" : " · Pix novo 7 dias antes")}
              </dd>
            </div>
            <div className="bl-resumo__l">
              <dt>Contratado em</dt>
              <dd>{dateBR(c.contratado_em)}</dd>
            </div>
          </dl>

          {pergunta === "trocar" && (
            <Confirmar
              titulo={c.metodo === "cartao" ? "Trocar para Pix?" : "Trocar para cartão de crédito?"}
              texto={
                c.metodo === "cartao"
                  ? `A renovação automática no cartão é cancelada agora. Seu acesso continua até ${dateBR(c.periodo_fim)} e, 7 dias antes, um Pix de ${brl(c.valor_centavos)} aparece em Meu plano. Sem multa e sem cobrança a mais.`
                  : `Vamos abrir a página segura da instituição de pagamento. Lá você cadastra o cartão pagando a próxima renovação (${brl(c.valor_centavos)}, que vence em ${dateBR(c.periodo_fim)}); pagar antes não encurta o seu período. Depois disso, renova sozinho no cartão.`
              }
              sim={c.metodo === "cartao" ? "Trocar para Pix" : "Abrir a página do cartão"}
              busy={busy}
              onNao={() => setPergunta(null)}
              onSim={() =>
                agir(async () => {
                  const aba = c.metodo === "cartao" ? null : abrirAbaVazia();
                  try {
                    const r = await changePaymentMethod(backend, c.metodo === "cartao" ? "pix" : "cartao", newIdem());
                    if (r?.url) {
                      if (aba) aba.location.href = r.url;
                      setPedido({ ...r, abriuAba: Boolean(aba) });
                    } else {
                      aba?.close();
                      setMsg("Pronto: a renovação agora é por Pix. O Pix chega 7 dias antes do vencimento.");
                    }
                  } catch (e) {
                    aba?.close();
                    throw e;
                  }
                  recarregar();
                })
              }
            />
          )}
          {pergunta === "desistir" && desistencia && (
            <Confirmar
              perigo
              titulo="Desistir da compra?"
              texto={`Você está dentro dos 7 dias: devolvemos ${brl(desistencia.valor_centavos)} inteiros, pela mesma forma de pagamento (no Pix, a devolução pode levar alguns dias para ser autorizada). O acesso pago termina agora e a renovação é cancelada. Seus dados ficam guardados.`}
              sim={`Desistir e receber ${brl(desistencia.valor_centavos)}`}
              busy={busy}
              onNao={() => setPergunta(null)}
              onSim={() =>
                agir(async () => {
                  const r = await requestRefund(backend, desistencia.cobranca_id);
                  setMsg(r.mensagem ?? "Desistência registrada. O valor volta pela mesma forma de pagamento.");
                  recarregar();
                })
              }
            />
          )}
          {pergunta === "cancelar" && (
            <Confirmar
              perigo
              titulo="Cancelar a assinatura?"
              texto={`Sem multa. A renovação é cancelada agora e o acesso pago continua até ${dateBR(c.periodo_fim)}. Seus dados ficam guardados.${
                desistencia ? " Ainda está nos 7 dias? Use “Desistir da compra” para receber o valor inteiro de volta." : ""
              }`}
              sim="Cancelar a renovação"
              busy={busy}
              onNao={() => setPergunta(null)}
              onSim={() =>
                agir(async () => {
                  const r = await cancelRenewal(backend);
                  setMsg(new Date(r.acesso_ate) > new Date() ? `Renovação cancelada. Seu acesso vai até ${dateBR(r.acesso_ate)}.` : "Assinatura cancelada. Nada mais será cobrado.");
                  recarregar();
                })
              }
            />
          )}
          {!pergunta && c.renova && !ov.renovacao_pendente && !(aberto && aberto.status === "aberto" && aberto.motivo !== "renovacao") && (
            <div className="bl-acoes">
              <Button variant="secondary" icon={c.metodo === "cartao" ? "qr-code" : "credit-card"} onClick={() => setPergunta("trocar")}>
                {c.metodo === "cartao" ? "Trocar para Pix" : "Trocar para cartão"}
              </Button>
              <Button variant="ghost" onClick={() => setPergunta("cancelar")}>
                Cancelar assinatura
              </Button>
              {desistencia && (
                <Button variant="ghost" icon="rotate-ccw" onClick={() => setPergunta("desistir")}>
                  Desistir da compra (7 dias)
                </Button>
              )}
            </div>
          )}
          {!pergunta && !c.renova && desistencia && (
            <div className="bl-acoes">
              <Button variant="ghost" icon="rotate-ccw" onClick={() => setPergunta("desistir")}>
                Desistir da compra (7 dias)
              </Button>
            </div>
          )}
          {!c.renova && go && (
            <div className="bl-acoes">
              <Button iconRight="arrow-right" onClick={() => go("planos")}>
                Assinar de novo
              </Button>
            </div>
          )}
        </div>
      ) : c?.renova ? (
        // venceu sem pagamento confirmado: acesso pausado; pagar (acima) devolve na hora, ou parar de vez sem multa
        <div className="ev-panel as-plano" data-testid="assinatura-pausada">
          <div className="as-plano__top">
            <IconTile name="lock" tone="warning" size={48} />
            <div className="as-plano__t">
              <span className="as-k">Seu plano</span>
              <b className="as-nome">
                {c.plano.toUpperCase()} {CICLO[c.ciclo]}
              </b>
              <span className="bl-fina">Acesso pago pausado desde {dateBR(c.periodo_fim)}: a renovação ainda não foi paga. Seus dados estão guardados.</span>
            </div>
            <Badge tone="warning">Pausada</Badge>
          </div>
          {pergunta === "cancelar" ? (
            <Confirmar
              perigo
              titulo="Cancelar a assinatura?"
              texto="Sem multa. A cobrança da renovação em aberto é cancelada e nada mais é cobrado. Para voltar depois, é só assinar de novo."
              sim="Cancelar a assinatura"
              busy={busy}
              onNao={() => setPergunta(null)}
              onSim={() =>
                agir(async () => {
                  await cancelRenewal(backend);
                  setMsg("Assinatura cancelada. Nada mais será cobrado.");
                  recarregar();
                })
              }
            />
          ) : (
            <div className="bl-acoes">
              <Button variant="ghost" onClick={() => setPergunta("cancelar")}>
                Cancelar assinatura
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Banner
          tone="brand"
          icon="crown"
          title={c ? "Sua assinatura terminou" : "Você ainda não tem assinatura"}
          action={
            go && (
              <Button size="sm" onClick={() => go("planos")}>
                Ver planos
              </Button>
            )
          }
        >
          {c ? "Seus dados ficam guardados. Assine de novo para liberar tudo." : "O PRO libera a teoria completa, simulados e flashcards. Pix ou cartão, à vista."}
        </Banner>
      )}

      {msg && (
        <p className="pn-note" role="status">
          {msg}
        </p>
      )}

      {registradas.length > 0 && (
        <ul className="bl-lista" data-testid="assinatura-devolucao-registrada">
          {registradas.map((x) => {
            const feita = x.devolucao.status === "feito" || x.status === "devolvida" || x.status === "devolvida_parcial";
            return (
              <li key={x.id} className="ev-panel bl-extra">
                <span>
                  <b>
                    {x.devolucao.desistencia ? "Desistência registrada" : "Devolução registrada"} – {feita ? "devolução concluída" : "devolução em andamento"}
                  </b>
                  <br />
                  <small>
                    {x.tipo === "plano" ? `${String(x.codigo).toUpperCase()} ${x.ciclo}` : `Extra ${x.codigo}`} · {brl(x.devolucao.valor_centavos)}
                    {feita ? " devolvidos pela mesma forma de pagamento." : " voltam pela mesma forma de pagamento (no Pix, pode levar alguns dias)."}
                  </small>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {outrasDevolucoes.length > 0 && (
        <div className="as-bloco">
          <h3 className="as-h">Devolução</h3>
          <ul className="bl-lista">
            {outrasDevolucoes.map((d) => (
              <li key={d.cobranca_id} className="ev-panel bl-extra">
                <span>
                  {d.tipo === "plano" ? `Plano ${String(d.codigo).toUpperCase()} ${d.ciclo}` : `Extra ${d.codigo}`} · você recebe <b>{brl(d.valor_centavos)}</b>
                  <br />
                  <small>{REGRA[d.regra] ?? ""} Volta pela mesma forma de pagamento.</small>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setPergunta({ devolucao: d })
                  }
                >
                  Pedir devolução
                </Button>
              </li>
            ))}
          </ul>
          {pergunta?.devolucao && (
            <Confirmar
              perigo
              titulo={`Pedir a devolução de ${brl(pergunta.devolucao.valor_centavos)}?`}
              texto={pergunta.devolucao.tipo === "plano" ? "O acesso pago é encerrado conforme a regra e a renovação acaba. O valor volta pela mesma forma de pagamento." : "Os créditos deste extra deixam de valer. O valor volta pela mesma forma de pagamento."}
              sim="Pedir a devolução"
              busy={busy}
              onNao={() => setPergunta(null)}
              onSim={() =>
                agir(async () => {
                  const r = await requestRefund(backend, pergunta.devolucao.cobranca_id);
                  setMsg(r.mensagem ?? "Devolução pedida. O valor volta pela mesma forma de pagamento.");
                  recarregar();
                })
              }
            />
          )}
        </div>
      )}

      <div className="as-bloco">
        <h3 className="as-h">Pagamentos e notas</h3>
        {pagamentos.length === 0 ? (
          <p className="bl-fina">Nenhum pagamento ainda.</p>
        ) : (
          <ul className="as-hist" data-testid="assinatura-historico">
            {pagamentos.map((x) => {
              const [rot, tom] = STATUS[x.status] ?? [x.status, "neutral"];
              return (
                <li key={x.id} className="as-hist__l">
                  <span className="as-hist__d">{dateBR(x.pago_em ?? x.em)}</span>
                  <span className="as-hist__o">
                    {x.tipo === "plano" ? `${String(x.codigo).toUpperCase()} ${x.ciclo}` : `Extra ${x.codigo}`}
                    <small>{METODO[x.metodo] ?? x.metodo}</small>
                  </span>
                  <span className="as-hist__v">{brl(x.valor_centavos)}</span>
                  <Badge tone={tom} size="sm">
                    {rot}
                  </Badge>
                  <span className="as-hist__links">
                    {x.recibo_url && (
                      <a className="as-hist__r" href={x.recibo_url} target="_blank" rel="noopener noreferrer">
                        <Icon name="receipt" size={16} /> Recibo
                      </a>
                    )}
                    {x.nota_url ? (
                      <a className="as-hist__r" href={x.nota_url} target="_blank" rel="noopener noreferrer" data-testid={`nota-${x.id}`}>
                        <Icon name="file-text" size={16} /> Nota fiscal{x.nota_numero ? ` nº ${x.nota_numero}` : ""}
                      </a>
                    ) : x.nota_status === "cancelada" ? (
                      <span className="as-hist__nc">Nota cancelada</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="bl-fina">A nota fiscal é emitida depois de cada pagamento confirmado: ela chega no seu e-mail e o link aparece aqui. Na devolução total, a nota é cancelada.</p>
        {hist?.aceite && (
          <p className="bl-fina">
            Contrato aceito em {dateBR(hist.aceite.em)}
            {hist.aceite.versao ? ` (versão ${hist.aceite.versao})` : ""} ·{" "}
            <a href={contratoUrl} target="_blank" rel="noopener noreferrer">
              ver o contrato
            </a>
          </p>
        )}
      </div>

      {avisos.length > 0 && (
        <div className="as-bloco">
          <h3 className="as-h">Avisos recentes</h3>
          <ul className="as-avisos">
            {avisos.map((a) => (
              <li key={a.id}>
                <b>{a.titulo}</b>
                <small>
                  {dateBR(a.em)}
                  {a.email ? " · enviado por e-mail" : ""}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
