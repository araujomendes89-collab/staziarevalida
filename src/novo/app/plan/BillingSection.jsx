// Cobrança na tela Planos (migração 013700). SÓ aparece quando o servidor tem o fornecedor ligado (overview.enabled); sem chave,
// a tela Planos continua só informativa, como hoje. Regras do dono (17/10/2026): Pix ou cartão, à vista; só o PRO à venda até a
// 2ª fase abrir (PRÁTICA e ELITE "em breve"); CPF só na hora de pagar; aceite obrigatório (caixa desmarcada); o cartão é digitado
// SÓ na página da instituição de pagamento; o acesso é liberado quando o pagamento é confirmado (nunca pela tela).
import React from "react";
import { Badge, BillingOption, Button, Checkbox, Icon, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { brl, cancelOrder, cancelRenewal, dateBR, getBillingOverview, getOrder, newIdem, requestRefund, startCheckout } from "./billingApi.js";

const CICLO = { mensal: "Mensal", trimestral: "Trimestral" };
const METODOS = [
  { id: "pix", title: "Pix", note: "Na renovação, um Pix novo chega 7 dias antes do vencimento." },
  { id: "cartao", title: "Cartão de crédito", note: "À vista. Renova sozinho no dia do vencimento." },
];
const REGRA = {
  integral_7_dias: "Até 7 dias da contratação: devolução integral.",
  trimestral_meses_nao_iniciados: "Trimestral: meses ainda não iniciados, menos 10%.",
  extra_creditos_nao_usados: "Extra: créditos não usados, menos 10%.",
};

function Compra({ alvo, overview, onDone, onCancel }) {
  const { backend } = useSession();
  const [metodo, setMetodo] = React.useState("pix");
  const [nome, setNome] = React.useState("");
  const [cpf, setCpf] = React.useState("");
  const [aceite, setAceite] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [erro, setErro] = React.useState(null);
  const idem = React.useMemo(() => newIdem(), [alvo.tipo, alvo.codigo, alvo.ciclo, metodo]);
  const precisaDoc = Boolean(overview.precisa_documento);
  const pronto = aceite && (!precisaDoc || (nome.trim().length >= 3 && cpf.replace(/\D/g, "").length >= 11));

  const pagar = async () => {
    setBusy(true);
    setErro(null);
    try {
      const body = { tipo: alvo.tipo, codigo: alvo.codigo, ciclo: alvo.ciclo, metodo, aceite: true, idem };
      if (precisaDoc) Object.assign(body, { nome: nome.trim(), documento: cpf });
      const pedido = await startCheckout(backend, body);
      if (metodo === "cartao" && pedido?.url) window.open(pedido.url, "_blank", "noopener");
      onDone(pedido);
    } catch (e) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ev-panel bl-compra" data-testid="cobranca-compra">
      <h3 className="bl-h3">
        {alvo.nome} · {brl(alvo.valor)}
        {alvo.ciclo === "trimestral" && <span className="bl-sub"> à vista</span>}
      </h3>
      <div className="bl-opts" role="radiogroup" aria-label="Forma de pagamento">
        {METODOS.filter((m) => overview.methods?.[m.id === "pix" ? "pix" : "card"] !== false).map((m) => (
          <BillingOption key={m.id} title={m.title} price="" period="" note={alvo.tipo === "extra" ? "Pagamento único." : m.note} selected={metodo === m.id} onClick={() => setMetodo(m.id)} />
        ))}
      </div>
      {precisaDoc && (
        <div className="bl-doc">
          <TextField label="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
          <TextField label="CPF" value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" autoComplete="off" hint="Pedimos só agora: vai para a instituição de pagamento, para a cobrança e a nota fiscal." />
        </div>
      )}
      <Checkbox
        checked={aceite}
        onChange={(e) => setAceite(Boolean(e?.target ? e.target.checked : e))}
        label={
          <span>
            Li e aceito o <a href="/novo/termos" target="_blank" rel="noopener noreferrer">Contrato de Assinatura e os Termos de Uso</a> e conheço a{" "}
            <a href="/novo/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.
          </span>
        }
      />
      <ul className="bl-regras">
        <li>O acesso é liberado assim que o pagamento é confirmado.</li>
        {alvo.tipo === "plano" && <li>No vencimento, sem pagamento confirmado, o acesso pago pausa na hora e volta quando o pagamento for confirmado.</li>}
        <li>Arrependimento em até 7 dias: devolução integral.</li>
      </ul>
      {erro && (
        <p className="bl-erro" role="alert">
          {erro}
        </p>
      )}
      <div className="bl-acoes">
        <Button onClick={pagar} disabled={!pronto || busy}>
          {busy ? "Abrindo o pagamento…" : metodo === "pix" ? "Gerar o Pix" : "Ir para o pagamento"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Voltar
        </Button>
      </div>
    </div>
  );
}

function PedidoAberto({ pedido, onChange }) {
  const { backend } = useSession();
  const [p, setP] = React.useState(pedido);
  const [copiado, setCopiado] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  React.useEffect(() => setP(pedido), [pedido]);
  React.useEffect(() => {
    if (!p?.id || p.status !== "aberto") return undefined;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      if (n > 120) return clearInterval(t); // 10 minutos conferindo de 5 em 5 s
      try {
        const x = await getOrder(backend, p.id);
        if (x?.status && x.status !== "aberto") {
          clearInterval(t);
          setP(x);
          onChange?.();
        }
      } catch {
        // tenta de novo no próximo ciclo
      }
    }, 5000);
    return () => clearInterval(t);
  }, [backend, p?.id, p?.status, onChange]);

  if (!p) return null;
  if (p.status === "pago") {
    return (
      <div className="ev-panel bl-ok" role="status" data-testid="cobranca-pago">
        <Icon name="check" size={20} /> Pagamento confirmado. {p.tipo === "extra" ? "Os créditos já estão na sua conta." : "Seu plano está ativo."}
      </div>
    );
  }
  if (p.status !== "aberto") return null;
  const conferir = async () => {
    setMsg(null);
    try {
      const x = await getOrder(backend, p.id);
      setP(x);
      if (x.status === "aberto") setMsg("Ainda não recebemos a confirmação. Se já pagou, aguarde alguns instantes.");
      else onChange?.();
    } catch (e) {
      setMsg(e.message);
    }
  };
  const cancelar = async () => {
    try {
      await cancelOrder(backend, p.id);
      onChange?.();
    } catch (e) {
      setMsg(e.message);
    }
  };
  return (
    <div className="ev-panel bl-aberto" data-testid="cobranca-aberta">
      <h3 className="bl-h3">
        Pagamento em aberto: {p.nome} · {brl(p.valor_centavos)}
      </h3>
      {p.metodo === "pix" && p.pix?.payload ? (
        <>
          {p.pix.image && <img className="bl-qr" alt="QR Code do Pix" src={`data:image/png;base64,${p.pix.image}`} />}
          <div className="bl-copia">
            <code>{p.pix.payload}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(p.pix.payload);
                  setCopiado(true);
                } catch {
                  setCopiado(false);
                }
              }}
            >
              {copiado ? "Copiado" : "Copiar código Pix"}
            </Button>
          </div>
        </>
      ) : (
        p.url && (
          <p>
            <a className="bl-link" href={p.url} target="_blank" rel="noopener noreferrer">
              Abrir a página de pagamento
            </a>{" "}
            (o cartão é digitado só na página da instituição de pagamento).
          </p>
        )
      )}
      {msg && <p className="bl-erro">{msg}</p>}
      <div className="bl-acoes">
        <Button onClick={conferir}>Já paguei: conferir</Button>
        <Button variant="secondary" onClick={cancelar}>
          Cancelar este pagamento
        </Button>
      </div>
    </div>
  );
}

export function BillingSection({ onEnabled }) {
  const { backend, refresh } = useSession();
  const [ov, setOv] = React.useState(null);
  const [alvo, setAlvo] = React.useState(null);
  const [pedido, setPedido] = React.useState(null);
  const [tick, setTick] = React.useState(0);
  const [aviso, setAviso] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    getBillingOverview(backend).then((x) => {
      if (!alive) return;
      setOv(x);
      onEnabled?.(Boolean(x?.enabled));
    });
    return () => {
      alive = false;
    };
  }, [backend, tick, onEnabled]);

  const reload = React.useCallback(() => {
    setTick((n) => n + 1);
    Promise.resolve(refresh?.()).catch(() => undefined);
  }, [refresh]);

  if (!ov?.enabled) return null;
  const planos = ov.vitrine?.planos ?? [];
  const extras = ov.vitrine?.extras ?? [];
  const contrato = ov.contrato && new Date(ov.contrato.periodo_fim) > new Date() ? ov.contrato : null;
  const aberto = pedido ?? (ov.pedidos_abertos ?? [])[0] ?? null;
  const vendas = Boolean(ov.vendas_ligadas);

  return (
    <section className="pn-sec bl" aria-label="Assinatura e pagamentos" data-testid="cobranca">
      {ov.mode === "test" && <Badge tone="warning">Modo de teste: nenhum valor real é cobrado</Badge>}
      {aberto && <PedidoAberto pedido={aberto} onChange={reload} />}
      {alvo ? (
        <Compra
          alvo={alvo}
          overview={ov}
          onCancel={() => setAlvo(null)}
          onDone={(p) => {
            setAlvo(null);
            setPedido(p);
            setTick((n) => n + 1);
          }}
        />
      ) : (
        <>
          {contrato ? (
            <div className="ev-panel bl-minha" data-testid="cobranca-minha">
              <h2 className="ev-h2">Minha assinatura</h2>
              <p>
                <b>{contrato.plano.toUpperCase()}</b> {CICLO[contrato.ciclo]?.toLowerCase()} · {contrato.metodo === "pix" ? "Pix" : "cartão de crédito"} · {brl(contrato.valor_centavos)}
              </p>
              <p>{contrato.renova ? `Próximo vencimento: ${dateBR(contrato.periodo_fim)}.` : `Acesso até ${dateBR(contrato.periodo_fim)}, sem renovação.`}</p>
              {contrato.renova && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (!window.confirm("Cancelar a renovação? Seu acesso continua até o fim do período já pago.")) return;
                    try {
                      const r = await cancelRenewal(backend);
                      setAviso(`Renovação cancelada. Seu acesso vai até ${dateBR(r.acesso_ate)}.`);
                      reload();
                    } catch (e) {
                      setAviso(e.message);
                    }
                  }}
                >
                  Cancelar a renovação
                </Button>
              )}
            </div>
          ) : (
            <div className="bl-planos">
              <h2 className="ev-h2">Assinar</h2>
              {!vendas && <p className="pn-note">As vendas ainda não estão abertas.</p>}
              {planos.map((p) => (
                <div key={p.codigo} className="ev-panel bl-plano" data-testid={`cobranca-plano-${p.codigo}`}>
                  <div className="bl-plano__head">
                    <h3 className="bl-h3">{p.nome}</h3>
                    {!p.a_venda && <Badge>Em breve</Badge>}
                  </div>
                  {p.descricao && <p className="pn-desc">{p.descricao}</p>}
                  <div className="bl-opts">
                    {["mensal", "trimestral"].map((c) => {
                      const valor = c === "mensal" ? p.mensal_centavos : p.trimestral_centavos;
                      return (
                        <BillingOption
                          key={c}
                          title={CICLO[c]}
                          price={brl(valor)}
                          period={c === "mensal" ? "/mês" : " à vista"}
                          note={c === "trimestral" ? `equivale a ${brl(Math.round(valor / 3))}/mês` : null}
                          selected={false}
                          onClick={() => p.a_venda && vendas && setAlvo({ tipo: "plano", codigo: p.codigo, ciclo: c, nome: `${p.nome} ${c}`, valor })}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {extras.length > 0 && (
            <div className="bl-extras">
              <h2 className="ev-h2">Extras de IA</h2>
              <p className="pn-note">Para quando a franquia do plano acabar. Valem 30 dias.</p>
              <ul className="bl-lista">
                {extras.map((x) => (
                  <li key={x.codigo} className="ev-panel bl-extra" data-testid={`cobranca-extra-${x.codigo}`}>
                    <span>
                      <b>{x.nome}</b> · {Number(x.creditos)} créditos + {x.voz_minutos} min de voz · {brl(x.valor_centavos)}
                    </span>
                    <Button size="sm" disabled={!vendas} onClick={() => setAlvo({ tipo: "extra", codigo: x.codigo, ciclo: "avulso", nome: x.nome, valor: x.valor_centavos })}>
                      Comprar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(ov.devolucoes ?? []).length > 0 && (
            <div className="bl-devolucoes">
              <h2 className="ev-h2">Devolução</h2>
              <ul className="bl-lista">
                {ov.devolucoes.map((d) => (
                  <li key={d.cobranca_id} className="ev-panel bl-extra">
                    <span>
                      {d.tipo === "plano" ? `Plano ${String(d.codigo).toUpperCase()} ${d.ciclo}` : `Extra ${d.codigo}`} · você recebe {brl(d.valor_centavos)}
                      <br />
                      <small>{REGRA[d.regra] ?? ""}</small>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        if (!window.confirm(`Pedir a devolução de ${brl(d.valor_centavos)}? ${d.tipo === "plano" ? "O acesso pago é encerrado conforme a regra." : "Os créditos deste extra deixam de valer."}`)) return;
                        try {
                          const r = await requestRefund(backend, d.cobranca_id);
                          setAviso(r.mensagem ?? "Devolução pedida. O valor volta pela mesma forma de pagamento.");
                          reload();
                        } catch (e) {
                          setAviso(e.message);
                        }
                      }}
                    >
                      Pedir devolução
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {aviso && (
        <p className="pn-note" role="status">
          {aviso}
        </p>
      )}
    </section>
  );
}
