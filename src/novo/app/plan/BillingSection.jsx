// Compra na tela Planos (cobrança 013700 + etapa 4, 013760). SÓ aparece quando o servidor tem o fornecedor ligado (overview.enabled);
// sem chave, a tela Planos continua só informativa, como hoje. Regras do dono (17/10/2026), que não mudam aqui:
//   - só o PRO à venda (R$ 99,90/mês ou R$ 269,70 no trimestral, à vista); PRÁTICA e ELITE "em breve"; 2ª fase "em breve";
//   - Pix ou cartão de crédito, sempre À VISTA (sem parcelas, sem boleto, sem débito); sem multa e sem juros;
//   - CPF pedido só aqui, na hora de pagar (vai para a instituição de pagamento; não fica no nosso banco);
//   - aceite do Contrato de Assinatura na hora (caixa desmarcada + link do contrato vigente) e resumo antes de pagar;
//   - cartão: digitado SÓ na página segura da instituição; volta ao app pela aba do app (sem depender do "endereço de volta");
//   - o acesso é liberado quando o pagamento é confirmado (aviso conferido ou consulta), nunca pela tela.
// Etapas: escolher → pagamento (forma + CPF) → revisar e aceitar → aguardando → pago / não concluído.
import React from "react";
import { Badge, BillingOption, Button, Checkbox, Icon, IconTile, StepProgress, TextField } from "../../ds";
import { useSession } from "../session.jsx";
import { brl, cancelOrder, dateBR, getBillingOverview, getOrder, newIdem, payRenewalByPix, startCheckout } from "./billingApi.js";
import { cpfValido, formatarCpf, mascararCpf, proximaData } from "./compraUtil.js";

const CICLO = { mensal: "Mensal", trimestral: "Trimestral" };
// Débito (decisão do dono 17/10, noite): só nas compras à vista que não renovam sozinhas (trimestral, extras); a renovação
// automática é só no crédito. Aparece quando o servidor disser que o fornecedor aceita (overview.methods.debit).
const METODOS = [
  { id: "pix", cap: "pix", title: "Pix", icon: "qr-code", note: "Paga na hora pelo app do banco. Na renovação, um Pix novo chega 7 dias antes do vencimento." },
  { id: "cartao", cap: "card", title: "Cartão de crédito", icon: "credit-card", note: "À vista, sem parcelas. Renova sozinho no dia do vencimento." },
  { id: "debito", cap: "debit", title: "Cartão de débito", icon: "credit-card", note: "À vista. Na renovação, você paga de novo (Pix, crédito ou débito)." },
];
/** Formas de pagamento desta compra: débito só fora do plano mensal (que renova sozinho no crédito). */
export const metodosDaCompra = (overview, alvo) =>
  METODOS.filter((m) => (m.id === "debito" ? overview.methods?.debit === true && !(alvo.tipo === "plano" && alvo.ciclo === "mensal") : overview.methods?.[m.cap] !== false));
/** O pagamento em aberto do resumo do servidor (vem sem "status": todos ali estão abertos). */
export const pedidoDoResumo = (ov) => {
  const p = (ov?.pedidos_abertos ?? [])[0];
  return p ? { status: "aberto", ...p } : null;
};
/** Texto das formas aceitas, conforme o servidor. */
export const textoFormas = (overview) => (overview?.methods?.debit === true ? "Pix, crédito ou débito" : "Pix ou cartão de crédito");
const ESTADO_FINAL = {
  falhou: ["O pagamento não foi concluído", "A instituição de pagamento recusou ou não confirmou. Nada foi cobrado. Você pode tentar de novo, com Pix ou outro cartão."],
  expirado: ["O tempo para pagar acabou", "Este pagamento venceu sem confirmação e foi cancelado. Nada foi cobrado. É só começar de novo."],
  cancelado: ["Pagamento cancelado", "Este pagamento foi cancelado. Nada foi cobrado."],
};

/** A página do cartão abre numa aba nova ANTES da resposta do servidor (senão o navegador bloqueia a janela). */
export function abrirAbaVazia() {
  if (typeof window === "undefined" || typeof window.open !== "function") return null;
  try {
    const w = window.open("", "_blank");
    if (!w) return null;
    w.opener = null;
    w.document.title = "Pagamento seguro";
    w.document.body.innerHTML = '<p style="font:16px sans-serif;padding:24px;color:#4F5A69">Abrindo a página segura de pagamento…</p>';
    return w;
  } catch {
    return null;
  }
}

/** Resumo do que será cobrado e de como renova (o mesmo texto que o aluno aceita). */
export function Resumo({ alvo, metodo, cpf }) {
  const meses = alvo.ciclo === "trimestral" ? 3 : 1;
  const proxima = alvo.tipo === "plano" ? dateBR(proximaData(new Date(), meses)) : null;
  const linhas = [
    ["O que você contrata", alvo.tipo === "plano" ? `${alvo.planoNome} · ${CICLO[alvo.ciclo]?.toLowerCase()}` : alvo.nome],
    ["Valor à vista", `${brl(alvo.valor)}${alvo.tipo === "plano" ? (meses === 3 ? " a cada 3 meses" : " por mês") : " (pagamento único)"}`],
    ["Forma de pagamento", metodo === "pix" ? "Pix" : metodo === "debito" ? "Cartão de débito, à vista" : "Cartão de crédito, à vista"],
  ];
  if (alvo.tipo === "plano") {
    linhas.push([
      "Renovação",
      metodo === "pix"
        ? `Sem débito automático: um Pix novo chega 7 dias antes de ${proxima}.`
        : metodo === "debito"
          ? `Não renova sozinho: antes de ${proxima} avisamos para você pagar de novo.`
          : `Renova sozinho no cartão em ${proxima}${meses === 3 ? " (a cada 3 meses)" : " (todo mês)"}.`,
    ]);
  }
  if (cpf) linhas.push(["CPF", mascararCpf(cpf)]);
  return (
    <dl className="bl-resumo" data-testid="cobranca-resumo">
      {linhas.map(([k, v]) => (
        <div key={k} className="bl-resumo__l">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Compra({ alvo, overview, onDone, onCancel }) {
  const { backend } = useSession();
  const [etapa, setEtapa] = React.useState(1);
  const [metodo, setMetodo] = React.useState("pix");
  const [nome, setNome] = React.useState("");
  const [cpf, setCpf] = React.useState("");
  const [aceite, setAceite] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [erro, setErro] = React.useState(null);
  const idem = React.useMemo(() => newIdem(), [alvo.tipo, alvo.codigo, alvo.ciclo, metodo]);
  const precisaDoc = Boolean(overview.precisa_documento);
  const cpfOk = !precisaDoc || cpfValido(cpf);
  const nomeOk = !precisaDoc || nome.trim().replace(/\s+/g, " ").length >= 3;
  const contrato = overview.contrato_doc ?? { url: "/novo/termos", versao: null };
  const metodos = metodosDaCompra(overview, alvo);

  const pagar = async () => {
    setBusy(true);
    setErro(null);
    const aba = metodo === "cartao" || metodo === "debito" ? abrirAbaVazia() : null;
    try {
      const body = { tipo: alvo.tipo, codigo: alvo.codigo, ciclo: alvo.ciclo, metodo, aceite: true, idem };
      if (precisaDoc) Object.assign(body, { nome: nome.trim().replace(/\s+/g, " "), documento: cpf });
      const pedido = await startCheckout(backend, body);
      if (aba && pedido?.url) aba.location.href = pedido.url;
      else aba?.close();
      onDone({ ...pedido, abriuAba: Boolean(aba && pedido?.url) });
    } catch (e) {
      aba?.close();
      setErro(e.message);
      if (e.code === "documento_invalido" || e.code === "documento_obrigatorio" || e.code === "nome_obrigatorio") setEtapa(1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ev-panel bl-compra" data-testid="cobranca-compra">
      <div className="bl-compra__top">
        <button type="button" className="pn-back" onClick={etapa === 1 ? onCancel : () => setEtapa(1)} disabled={busy}>
          <Icon name="chevron-left" size={18} />
          {etapa === 1 ? "Voltar aos planos" : "Voltar"}
        </button>
        <div className="bl-compra__steps">
          <StepProgress current={etapa} total={2} variant="dots" />
        </div>
      </div>
      <h3 className="bl-h3">
        {alvo.nome} · {brl(alvo.valor)}
        {alvo.tipo === "plano" && <span className="bl-sub">{alvo.ciclo === "trimestral" ? " à vista, a cada 3 meses" : " por mês"}</span>}
      </h3>

      {etapa === 1 ? (
        <>
          <p className="bl-k">Como você quer pagar?</p>
          <div className="bl-opts" role="radiogroup" aria-label="Forma de pagamento">
            {metodos.map((m) => (
              <BillingOption key={m.id} title={m.title} price="" period="" note={alvo.tipo === "extra" ? "Pagamento único, à vista." : m.note} selected={metodo === m.id} onClick={() => setMetodo(m.id)} />
            ))}
          </div>
          {precisaDoc && (
            <div className="bl-doc">
              <TextField label="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
              <TextField
                label="CPF"
                value={cpf}
                onChange={(e) => setCpf(formatarCpf(e.target.value))}
                inputMode="numeric"
                autoComplete="off"
                error={cpf.replace(/\D/g, "").length >= 11 && !cpfValido(cpf) ? "CPF inválido. Confira os números." : undefined}
                hint="Pedimos só agora: vai para a instituição de pagamento (cobrança e nota fiscal). Não fica guardado no StaziaMed."
              />
            </div>
          )}
          {erro && (
            <p className="bl-erro" role="alert">
              {erro}
            </p>
          )}
          <div className="bl-acoes">
            <Button iconRight="arrow-right" onClick={() => setEtapa(2)} disabled={!cpfOk || !nomeOk}>
              Revisar e pagar
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="bl-k">Confira antes de pagar</p>
          <Resumo alvo={alvo} metodo={metodo} cpf={precisaDoc ? cpf : null} />
          <ul className="bl-regras">
            <li>O acesso é liberado assim que a instituição de pagamento confirmar.</li>
            {alvo.tipo === "plano" && <li>No vencimento, sem pagamento confirmado, o acesso pago pausa na hora (sem multa e sem juros) e volta quando você pagar.</li>}
            <li>Cancele quando quiser em Minha conta, sem multa. Arrependimento em até 7 dias: devolução integral, pela mesma forma de pagamento.</li>
          </ul>
          <Checkbox
            checked={aceite}
            onChange={(e) => setAceite(Boolean(e?.target ? e.target.checked : e))}
            label={
              <span>
                Li e aceito o{" "}
                <a href={contrato.url} target="_blank" rel="noopener noreferrer">
                  Contrato de Assinatura{contrato.versao ? ` (versão ${contrato.versao})` : ""}
                </a>{" "}
                e conheço a{" "}
                <a href="/novo/privacidade" target="_blank" rel="noopener noreferrer">
                  Política de Privacidade
                </a>
                .
              </span>
            }
          />
          {erro && (
            <p className="bl-erro" role="alert">
              {erro}
            </p>
          )}
          <div className="bl-acoes">
            <Button icon={metodo === "pix" ? "qr-code" : "lock"} onClick={pagar} disabled={!aceite || busy} loading={busy}>
              {busy ? "Abrindo o pagamento…" : metodo === "pix" ? "Gerar o Pix" : "Ir para a página segura do cartão"}
            </Button>
          </div>
          {metodo !== "pix" && <p className="bl-fina">O número do cartão é digitado só na página da instituição de pagamento (Asaas). O StaziaMed não vê nem guarda o cartão.</p>}
        </>
      )}
    </div>
  );
}

/** Pagamento em andamento: Pix (QR + copia-e-cola) ou cartão (página segura), conferindo sozinho até confirmar. */
export function PedidoAberto({ pedido, onChange, onNovo }) {
  const { backend } = useSession();
  const [p, setP] = React.useState(pedido);
  const [copiado, setCopiado] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [conferindo, setConferindo] = React.useState(false);

  React.useEffect(() => setP(pedido), [pedido]);
  const conferirAgora = React.useCallback(async () => {
    if (!p?.id) return;
    try {
      const x = await getOrder(backend, p.id);
      if (x?.status && x.status !== p.status) {
        setP(x);
        if (x.status !== "aberto") onChange?.();
      }
      return x;
    } catch {
      return null;
    }
  }, [backend, p?.id, p?.status, onChange]);

  React.useEffect(() => {
    if (!p?.id || p.status !== "aberto") return undefined;
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      if (n > 180) return clearInterval(t); // 15 minutos conferindo de 5 em 5 s; depois, pelo botão ou ao voltar para a aba
      void conferirAgora();
    }, 5000);
    // voltou da aba do pagamento (cartão) ou do app do banco (Pix): confere na hora
    const voltou = () => document.visibilityState !== "hidden" && void conferirAgora();
    document.addEventListener("visibilitychange", voltou);
    window.addEventListener("focus", voltou);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", voltou);
      window.removeEventListener("focus", voltou);
    };
  }, [p?.id, p?.status, conferirAgora]);

  if (!p) return null;
  if (p.status === "pago") {
    return (
      <div className="ev-panel bl-fim bl-fim--ok" role="status" data-testid="cobranca-pago">
        <IconTile name="circle-check" tone="success" size={52} />
        <div>
          <h3 className="bl-h3">Pagamento confirmado</h3>
          <p>{p.tipo === "extra" ? "Os créditos já estão na sua conta." : "Seu plano já está ativo. Bons estudos!"} O recibo fica em Minha conta › Assinatura.</p>
        </div>
      </div>
    );
  }
  if (ESTADO_FINAL[p.status]) {
    const [t, d] = ESTADO_FINAL[p.status];
    return (
      <div className="ev-panel bl-fim bl-fim--falhou" role="alert" data-testid="cobranca-falhou">
        <IconTile name="circle-alert" tone="danger" size={52} />
        <div>
          <h3 className="bl-h3">{t}</h3>
          <p>{d}</p>
          {onNovo && (
            <div className="bl-acoes">
              <Button icon="rotate-ccw" onClick={onNovo}>
                Tentar de novo
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }
  if (p.status !== "aberto") return null;
  const conferir = async () => {
    setMsg(null);
    setConferindo(true);
    const x = await conferirAgora();
    setConferindo(false);
    if (!x) setMsg("Não foi possível conferir agora. Tente de novo em instantes.");
    else if (x.status === "aberto") setMsg("Ainda não recebemos a confirmação. Se já pagou, aguarde alguns instantes: a tela atualiza sozinha.");
  };
  const cancelar = async () => {
    try {
      await cancelOrder(backend, p.id);
      setP({ ...p, status: "cancelado" });
      onChange?.();
    } catch (e) {
      setMsg(e.message);
    }
  };
  const ate = p.expira_em ? new Date(p.expira_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : null;
  const pix = p.metodo === "pix" && p.pix?.payload;
  return (
    <div className="ev-panel bl-aberto" data-testid="cobranca-aberta">
      <div className="bl-aberto__head">
        <Badge tone="warning" icon="clock">
          Aguardando pagamento
        </Badge>
        <span className="bl-fina">{brl(p.valor_centavos)} · {p.nome}</span>
      </div>
      {pix ? (
        <div className="bl-pix">
          {p.pix.image && <img className="bl-qr" alt="QR Code do Pix" src={`data:image/png;base64,${p.pix.image}`} />}
          <div className="bl-pix__txt">
            <h3 className="bl-h3">Pague com o Pix</h3>
            <ol className="bl-passos">
              <li>Abra o app do seu banco e escolha Pix.</li>
              <li>Leia o QR Code ou cole o código abaixo.</li>
              <li>Pronto: esta tela confirma sozinha quando o pagamento cair.</li>
            </ol>
            <div className="bl-copia">
              <code>{p.pix.payload}</code>
              <Button
                size="sm"
                variant="secondary"
                icon={copiado ? "check" : "copy"}
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
            {ate && p.motivo !== "renovacao" && <p className="bl-fina">Este Pix vale até {ate} de hoje.</p>}
          </div>
        </div>
      ) : (
        p.url && (
          <div className="bl-cartao">
            <h3 className="bl-h3">Pague na página segura do cartão</h3>
            <p>
              {pedido?.abriuAba ? "Abrimos a página da instituição de pagamento numa aba nova. " : ""}
              Digite o cartão lá e volte para esta aba: ela confirma sozinha quando o pagamento for aprovado.
            </p>
            <a className="sm-btn sm-btn--secondary bl-link-btn" href={p.url} target="_blank" rel="noopener noreferrer">
              <Icon name="external-link" size={18} />
              Abrir a página de pagamento
            </a>
          </div>
        )
      )}
      <div className="bl-esperando" aria-live="polite">
        <span className="sm-spin" aria-hidden="true" /> Esperando a confirmação da instituição de pagamento…
      </div>
      {msg && <p className="bl-erro">{msg}</p>}
      <div className="bl-acoes">
        <Button variant="secondary" icon="refresh-cw" onClick={conferir} loading={conferindo}>
          Já paguei: conferir
        </Button>
        {/* o Pix que é a própria cobrança da renovação do cartão não se cancela (apagaria a cobrança da assinatura) */}
        {p.cancelavel !== false && (
          <Button variant="ghost" onClick={cancelar}>
            Cancelar este pagamento
          </Button>
        )}
      </div>
    </div>
  );
}

/** Renovação no cartão recusada: o acesso pausou; a MESMA cobrança vira Pix (sem cobrança em dobro). */
export function RenovacaoPendente({ pendente, onPedido, onErro }) {
  const { backend } = useSession();
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="ev-panel bl-pendente" role="alert" data-testid="cobranca-renovacao-falhou">
      <IconTile name="circle-alert" tone="danger" size={44} />
      <div>
        <h3 className="bl-h3">A renovação no cartão não passou</h3>
        <p>
          Seu acesso pago está pausado desde hoje. Pague a renovação ({brl(pendente.valor_centavos)}) por Pix e ele volta assim que o pagamento for confirmado. Se o
          cartão for aprovado numa nova tentativa, o acesso também volta sozinho, sem cobrança em dobro.
        </p>
        <div className="bl-acoes">
          <Button
            icon="qr-code"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                onPedido(await payRenewalByPix(backend));
              } catch (e) {
                onErro?.(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Pagar agora por Pix
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlanoVitrine({ p, vendas, onEscolher }) {
  const [ciclo, setCiclo] = React.useState("mensal");
  const aberto = p.a_venda && vendas;
  const mensal = p.mensal_centavos;
  const tri = p.trimestral_centavos;
  const economia = mensal && tri ? mensal * 3 - tri : 0;
  return (
    <div className={`ev-panel bl-plano${p.a_venda ? " bl-plano--venda" : " bl-plano--breve"}`} data-testid={`cobranca-plano-${p.codigo}`}>
      <div className="bl-plano__head">
        <h3 className="bl-h3">{p.nome}</h3>
        {p.a_venda ? <Badge tone="pro">Disponível</Badge> : <Badge>Em breve</Badge>}
      </div>
      {p.descricao && <p className="pn-desc">{p.descricao}</p>}
      <div className="bl-opts" role="radiogroup" aria-label={`Ciclo do ${p.nome}`}>
        {["mensal", "trimestral"].map((c) => {
          const valor = c === "mensal" ? mensal : tri;
          return (
            <BillingOption
              key={c}
              title={CICLO[c]}
              price={brl(valor)}
              period={c === "mensal" ? "/mês" : " à vista"}
              note={c === "trimestral" ? `equivale a ${brl(Math.round(valor / 3))}/mês${economia > 0 ? ` · economia de ${brl(economia)}` : ""}` : "renova todo mês"}
              badge={c === "trimestral" && economia > 0 && p.a_venda ? "Economize" : undefined}
              selected={aberto && ciclo === c}
              onClick={() => aberto && setCiclo(c)}
            />
          );
        })}
      </div>
      {aberto ? (
        <Button iconRight="arrow-right" onClick={() => onEscolher({ tipo: "plano", codigo: p.codigo, ciclo, planoNome: p.nome, nome: `${p.nome} ${ciclo}`, valor: ciclo === "mensal" ? mensal : tri })}>
          Assinar o {p.nome} {ciclo}
        </Button>
      ) : (
        <p className="bl-fina">{p.a_venda ? "As vendas abrem em breve." : "Em breve: abre junto com a 2ª fase."}</p>
      )}
    </div>
  );
}

export function BillingSection({ onEnabled, go, pedidoInicial }) {
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

  // voltou da página de pagamento com ?pedido=<id> (quando o "endereço de volta" estiver ligado): mostra como ficou
  React.useEffect(() => {
    if (!pedidoInicial || !/^[0-9a-f-]{36}$/.test(pedidoInicial)) return undefined;
    let alive = true;
    getOrder(backend, pedidoInicial)
      .then((x) => alive && x?.id && setPedido(x))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [backend, pedidoInicial]);

  const reload = React.useCallback(() => {
    setTick((n) => n + 1);
    Promise.resolve(refresh?.()).catch(() => undefined);
  }, [refresh]);

  if (!ov?.enabled) return null;
  const planos = ov.vitrine?.planos ?? [];
  const extras = ov.vitrine?.extras ?? [];
  const contrato = ov.contrato && new Date(ov.contrato.periodo_fim) > new Date() ? ov.contrato : null;
  // os pedidos abertos do resumo vêm sem "status" (são todos abertos): sem isto, a tela não mostrava o pagamento em aberto ao voltar
  const aberto = pedido ?? pedidoDoResumo(ov);
  const vendas = Boolean(ov.vendas_ligadas);

  return (
    <section className="pn-sec bl" aria-label="Assinatura e pagamentos" data-testid="cobranca">
      {ov.mode === "test" && <Badge tone="warning">Modo de teste: nenhum valor real é cobrado</Badge>}
      {ov.renovacao_pendente && !aberto && <RenovacaoPendente pendente={ov.renovacao_pendente} onPedido={setPedido} onErro={(m) => (setAviso(m), reload())} />}
      {aberto && (
        <PedidoAberto
          pedido={aberto}
          onChange={reload}
          onNovo={() => {
            setPedido(null);
            reload();
          }}
        />
      )}
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
        !(aberto && aberto.status === "aberto" && aberto.motivo !== "renovacao") && (
          <>
            {contrato ? (
              <div className="ev-panel bl-minha" data-testid="cobranca-minha">
                <IconTile name="badge-check" tone="pro" size={44} />
                <div className="bl-minha__txt">
                  <h2 className="ev-h2">Sua assinatura</h2>
                  <p>
                    <b>{contrato.plano.toUpperCase()}</b> {CICLO[contrato.ciclo]?.toLowerCase()} · {contrato.metodo === "pix" ? "Pix" : "cartão de crédito"} · {brl(contrato.valor_centavos)}
                  </p>
                  <p>{contrato.renova ? `Próximo vencimento: ${dateBR(contrato.periodo_fim)}.` : `Acesso até ${dateBR(contrato.periodo_fim)}, sem renovação.`}</p>
                </div>
                {go && (
                  <Button variant="secondary" iconRight="arrow-right" onClick={() => go("perfil", { secao: "assinatura" })}>
                    Gerenciar assinatura
                  </Button>
                )}
              </div>
            ) : (
              <div className="bl-planos">
                <h2 className="ev-h2">Escolha seu plano</h2>
                {!vendas && <p className="pn-note">As vendas ainda não estão abertas.</p>}
                <div className="bl-vitrine">
                  {planos.map((p) => (
                    <PlanoVitrine key={p.codigo} p={p} vendas={vendas} onEscolher={setAlvo} />
                  ))}
                </div>
                <p className="bl-fina bl-garantias">
                  <Icon name="shield-check" size={16} /> {textoFormas(ov)}, sempre à vista · sem multa e sem juros · cancele quando quiser · 7 dias para desistir com devolução integral
                </p>
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
          </>
        )
      )}
      {aviso && (
        <p className="pn-note" role="status">
          {aviso}
        </p>
      )}
    </section>
  );
}
