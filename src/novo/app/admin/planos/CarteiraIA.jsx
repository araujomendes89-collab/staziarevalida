// Administração › Planos › "Carteira de IA" (migração …013680, ETAPA 2 dos planos, decisões do dono de 17/10).
// Só o administrador. Mostra os números REAIS da carteira (hoje e no mês): pedidos de IA, créditos, custo em reais e quantos alunos
// a regra nova teria barrado (em modo sombra nada é barrado: a carteira só registra). Edita: teto de custo do dia, reserva por
// recurso, pacotes extras (IA Boost/Plus/Max), planos "à venda" e as regras de devolução. Dá e cancela créditos de cortesia
// (com motivo, registrados). Consulta a carteira de um aluno e simula uma devolução (só o cálculo; nenhum estorno acontece).
import React from "react";
import { Badge, Banner, Button, Card, Switch, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, messageOf, useLoad } from "../common.jsx";
import { centavosParaReais, reaisParaCentavos } from "./DireitosPorFase.jsx";

const RECURSO = {
  tutor_texto: "Tutor por texto",
  tutor_janela: "Janelinha do Tutor",
  tutor_abertura: "Abertura do Tutor (IA)",
  dica_questao: "Dica na questão",
  correcao_estacao_ia: "Correção de estação por IA",
  voz_ao_vivo: "Voz ao vivo (além da franquia)",
};
const num = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const reais = (v) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const decimal = (t) => String(t ?? "").trim().replace(",", ".");

function Secao({ titulo, texto, children }) {
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h3 style={{ margin: 0, font: "var(--type-h4)" }}>{titulo}</h3>
          {texto && <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", font: "var(--type-body-sm)" }}>{texto}</p>}
        </div>
        {children}
      </div>
    </Card>
  );
}

const grade = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 };

function Numero({ rotulo, valor, dica }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{rotulo}</span>
      <span style={{ font: "var(--type-h4)" }}>{valor}</span>
      {dica && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{dica}</span>}
    </div>
  );
}

/** O resumo de um período (hoje ou mês). */
export function ResumoPeriodo({ titulo, r }) {
  if (!r) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <b>{titulo}</b>
      <div style={grade}>
        <Numero rotulo="Pedidos de IA" valor={num(r.pedidos)} />
        <Numero rotulo="Créditos" valor={num(r.creditos)} />
        <Numero rotulo="Custo real" valor={reais(r.custo_brl)} dica={`US$ ${num(r.custo_usd)}`} />
        <Numero rotulo="Alunos que usaram" valor={num(r.alunos)} />
        <Numero rotulo="Pedidos que a regra nova barraria" valor={num(r.teriam_sido_barrados)} dica={`${num(r.alunos_que_seriam_barrados)} aluno(s)`} />
      </div>
      {Object.keys(r.por_recurso ?? {}).length > 0 && (
        <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>
          {Object.entries(r.por_recurso).map(([k, v]) => `${RECURSO[k] ?? k}: ${num(v.pedidos)} pedidos, ${num(v.creditos)} créditos`).join(" · ")}
        </span>
      )}
    </div>
  );
}

function Ajustes({ data, setData }) {
  const { backend } = useSession();
  const [f, setF] = React.useState(() => ({
    teto: data.config.teto_custo_dia_usd == null ? "" : String(data.config.teto_custo_dia_usd).replace(".", ","),
    desconto: String(data.config.devolucao_desconto_pct ?? 10).replace(".", ","),
    abusoQtd: String(data.config.devolucao_abuso_qtd ?? 2),
    abusoDias: String(data.config.devolucao_abuso_dias ?? 180),
    recursos: data.recursos.map((r) => ({ ...r, reserva: String(r.reserva_creditos ?? "").replace(".", ",") })),
    pacotes: data.pacotes.map((p) => ({ ...p, preco: centavosParaReais(p.preco_centavos), cred: String(p.creditos), min: String(p.voz_minutos), dias: String(p.validade_dias) })),
    venda: data.planos_a_venda.map((p) => ({ codigo: p.codigo, nome: p.nome, a_venda: p.a_venda, fases: p.fases })),
  }));
  const [st, setSt] = React.useState({ saving: false, error: null, ok: false });
  const salvar = async () => {
    const pacotes = f.pacotes.map((p) => ({ codigo: p.codigo, nome: p.nome, preco_centavos: reaisParaCentavos(p.preco), creditos: decimal(p.cred), voz_minutos: p.min.trim(), validade_dias: p.dias.trim() }));
    if (pacotes.some((p) => !Number.isFinite(p.preco_centavos))) return setSt({ saving: false, error: "Preço de pacote inválido. Use, por exemplo, 24,90.", ok: false });
    setSt({ saving: true, error: null, ok: false });
    try {
      const novo = await backend.rpc("app_admin_carteira_salvar", {
        p_dados: {
          config: { teto_custo_dia_usd: decimal(f.teto), devolucao_desconto_pct: decimal(f.desconto), devolucao_abuso_qtd: f.abusoQtd.trim(), devolucao_abuso_dias: f.abusoDias.trim() },
          recursos: f.recursos.map((r) => ({ codigo: r.codigo, reserva_creditos: decimal(r.reserva) })),
          pacotes,
          planos_a_venda: f.venda.map((p) => ({ codigo: p.codigo, a_venda: p.a_venda })),
        },
      });
      setData(novo);
      setSt({ saving: false, error: null, ok: true });
    } catch (err) {
      setSt({ saving: false, error: messageOf(err), ok: false });
    }
  };
  const muda = (lista, i, campo, valor) => setF((x) => ({ ...x, [lista]: x[lista].map((it, j) => (j === i ? { ...it, [campo]: valor } : it)) }));
  return (
    <Secao titulo="Ajustes da carteira" texto="O teto do dia vale para a conta inteira: passou dele, a IA dos alunos para até o dia seguinte (só com os cadeados ligados). A reserva é o que se separa antes de chamar a IA; o custo real é acertado depois.">
      <div style={grade}>
        <TextField label="Teto de custo por dia (US$)" value={f.teto} onChange={(e) => setF({ ...f, teto: e.target.value })} hint="Vazio = sem teto" />
        <TextField label="Desconto da devolução (%)" value={f.desconto} onChange={(e) => setF({ ...f, desconto: e.target.value })} hint="Trimestral e extras depois de 7 dias" />
        <TextField label="Abuso: devoluções em 7 dias" value={f.abusoQtd} onChange={(e) => setF({ ...f, abusoQtd: e.target.value })} hint="A partir disso, a devolução vai para a equipe" />
        <TextField label="Abuso: nos últimos (dias)" value={f.abusoDias} onChange={(e) => setF({ ...f, abusoDias: e.target.value })} />
      </div>
      <b>Reserva antes de chamar a IA (créditos)</b>
      <div style={grade}>
        {f.recursos.map((r, i) => (
          <TextField key={r.codigo} label={r.nome} value={r.reserva} onChange={(e) => muda("recursos", i, "reserva", e.target.value)} />
        ))}
      </div>
      <b>Pacotes extras (validade própria; consumo depois da franquia, do mais antigo para o mais novo)</b>
      {f.pacotes.map((p, i) => (
        <div key={p.codigo} style={grade} data-pacote={p.codigo}>
          <TextField label="Nome" value={p.nome} onChange={(e) => muda("pacotes", i, "nome", e.target.value)} />
          <TextField label="Preço (R$)" value={p.preco} onChange={(e) => muda("pacotes", i, "preco", e.target.value)} />
          <TextField label="Créditos" value={p.cred} onChange={(e) => muda("pacotes", i, "cred", e.target.value)} />
          <TextField label="Minutos de voz" value={p.min} onChange={(e) => muda("pacotes", i, "min", e.target.value)} />
          <TextField label="Validade (dias)" value={p.dias} onChange={(e) => muda("pacotes", i, "dias", e.target.value)} />
        </div>
      ))}
      <b>Planos à venda</b>
      <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
        Até a 2ª fase abrir, só o PRO vale à venda; os planos com a 2ª fase aparecem "em breve". A cobrança ainda está desligada: nada é vendido.
      </span>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {f.venda.map((p, i) => (
          <Switch key={p.codigo} label={`${p.nome} à venda`} checked={p.a_venda} onChange={(v) => muda("venda", i, "a_venda", typeof v === "boolean" ? v : v?.target?.checked)} />
        ))}
      </div>
      {st.error && <Banner tone="danger">{st.error}</Banner>}
      {st.ok && <Banner tone="success">Salvo.</Banner>}
      <div>
        <Button onClick={salvar} loading={st.saving}>Salvar ajustes</Button>
      </div>
    </Secao>
  );
}

/** A carteira de um aluno, a cortesia e a simulação de devolução. */
export function CarteiraDoAluno() {
  const { backend } = useSession();
  const [busca, setBusca] = React.useState("");
  const [st, setSt] = React.useState({ loading: false, error: null, data: null });
  const [cort, setCort] = React.useState({ creditos: "", minutos: "0", dias: "30", motivo: "" });
  const [cortSt, setCortSt] = React.useState({ saving: false, error: null });
  const consultar = async (e) => {
    e?.preventDefault?.();
    if (!busca.trim()) return setSt({ loading: false, error: "Informe o e-mail do aluno.", data: null });
    setSt({ loading: true, error: null, data: null });
    try {
      setSt({ loading: false, error: null, data: await backend.rpc("app_admin_carteira_aluno", { p_busca: busca.trim() }) });
    } catch (err) {
      setSt({ loading: false, error: messageOf(err), data: null });
    }
  };
  const darCortesia = async () => {
    setCortSt({ saving: true, error: null });
    try {
      const d = await backend.rpc("app_admin_carteira_cortesia", {
        p_busca: busca.trim(), p_creditos: Number(decimal(cort.creditos) || 0), p_voz_minutos: Number(cort.minutos || 0),
        p_validade_dias: Number(cort.dias || 0), p_motivo: cort.motivo,
      });
      setSt({ loading: false, error: null, data: d });
      setCort({ creditos: "", minutos: "0", dias: "30", motivo: "" });
      setCortSt({ saving: false, error: null });
    } catch (err) {
      setCortSt({ saving: false, error: messageOf(err) });
    }
  };
  const cancelar = async (id) => {
    const motivo = window.prompt("Motivo para cancelar esta cortesia:");
    if (!motivo) return;
    try {
      setSt({ loading: false, error: null, data: await backend.rpc("app_admin_carteira_cortesia_cancelar", { p_id: id, p_motivo: motivo }) });
    } catch (err) {
      setSt((x) => ({ ...x, error: messageOf(err) }));
    }
  };
  const d = st.data;
  return (
    <Secao titulo="Carteira de um aluno e cortesia" texto="Créditos de cortesia só valem com os cadeados ligados. Cada cortesia fica registrada no histórico, com o motivo.">
      <form onSubmit={consultar} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }} noValidate>
        <div style={{ flex: "1 1 260px" }}>
          <TextField label="E-mail do aluno" type="email" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="aluno@exemplo.com" />
        </div>
        <Button type="submit" variant="secondary" loading={st.loading}>Ver carteira</Button>
      </form>
      {st.error && <Banner tone="danger">{st.error}</Banner>}
      {d && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <b>{d.aluno.email}</b>
            <Badge tone="brand">{d.perfil}</Badge>
            <Badge>{d.modo === "ligado" ? "Cadeados ligados" : "Modo sombra"}</Badge>
            {d.devolucoes_integrais_recentes > 0 && <Badge tone="warning">{d.devolucoes_integrais_recentes} devolução(ões) em 7 dias recentes</Badge>}
          </div>
          {d.creditos?.ilimitado ? (
            <span>Equipe: sem limite.</span>
          ) : (
            <div style={grade}>
              <Numero rotulo="Créditos hoje" valor={`${num(d.creditos.usado_dia)} de ${num(d.creditos.franquia_dia)}`} />
              <Numero rotulo="Créditos no mês" valor={d.creditos.franquia_mes == null ? "—" : `${num(d.creditos.usado_mes)} de ${num(d.creditos.franquia_mes)}`} />
              <Numero rotulo="Extras válidos" valor={`${num(d.creditos.extras)} créditos`} dica={d.creditos.extras_valem ? "valendo" : "só valem com os cadeados ligados"} />
              <Numero rotulo="Voz" valor={`${Math.floor((d.voz.usado_s ?? 0) / 60)} de ${Math.floor((d.voz.franquia_s ?? 0) / 60)} min`} dica={d.voz.periodo === "mes" ? "no mês" : "no teste"} />
            </div>
          )}
          {d.extras.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <b>Extras</b>
              {d.extras.map((x) => (
                <div key={x.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", font: "var(--type-body-sm)" }}>
                  <Badge size="sm" tone={x.origem === "cortesia" ? "brand" : "neutral"}>{x.origem === "cortesia" ? "Cortesia" : x.pacote ?? "Compra"}</Badge>
                  <span>{num(x.creditos_usados)} de {num(x.creditos)} créditos · {num(x.voz_usados_min)} de {num(x.voz_minutos)} min · até {new Date(x.valido_ate).toLocaleDateString("pt-BR")}</span>
                  {x.motivo && <span style={{ color: "var(--text-tertiary)" }}>({x.motivo})</span>}
                  {x.cancelado_em ? <Badge size="sm" tone="danger">Cancelada</Badge> : x.origem === "cortesia" && (
                    <Button size="sm" variant="ghost" onClick={() => cancelar(x.id)}>Cancelar</Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <b>Dar cortesia</b>
            <div style={grade}>
              <TextField label="Créditos" value={cort.creditos} onChange={(e) => setCort({ ...cort, creditos: e.target.value })} />
              <TextField label="Minutos de voz" value={cort.minutos} onChange={(e) => setCort({ ...cort, minutos: e.target.value })} />
              <TextField label="Validade (dias)" value={cort.dias} onChange={(e) => setCort({ ...cort, dias: e.target.value })} />
            </div>
            <TextField label="Motivo (obrigatório)" value={cort.motivo} onChange={(e) => setCort({ ...cort, motivo: e.target.value })} />
            {cortSt.error && <Banner tone="danger">{cortSt.error}</Banner>}
            <div>
              <Button onClick={darCortesia} loading={cortSt.saving} variant="secondary">Dar cortesia</Button>
            </div>
          </div>
          {d.movimentos.length > 0 && (
            <details>
              <summary>Últimos pedidos ({d.movimentos.length})</summary>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, font: "var(--type-body-sm)" }}>
                {d.movimentos.map((m, i) => (
                  <li key={i}>
                    {new Date(m.em).toLocaleString("pt-BR")} · {RECURSO[m.recurso] ?? m.recurso} · {m.situacao} · {m.recurso === "voz_ao_vivo" ? `${Math.round(m.voz_s / 60)} min` : `${num(m.creditos)} créditos`}
                    {m.modo === "sombra" ? " (sombra)" : ""}{m.teria_bloqueado ? ` · a regra nova barraria (${m.motivo})` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Secao>
  );
}

/** Simular uma devolução (só o cálculo, sem estorno). */
export function SimularDevolucao() {
  const { backend } = useSession();
  const [f, setF] = React.useState({ ciclo: "trimestral", preco: "269,70", contratado: "", cancelado: "" });
  const [st, setSt] = React.useState({ error: null, data: null });
  const simular = async () => {
    try {
      const dados = { ciclo: f.ciclo, preco_centavos: reaisParaCentavos(f.preco), contratado_em: f.contratado, cancelado_em: f.cancelado || null };
      setSt({ error: null, data: await backend.rpc("app_admin_carteira_devolucao", { p_dados: dados }) });
    } catch (err) {
      setSt({ error: messageOf(err), data: null });
    }
  };
  return (
    <Secao titulo="Simular devolução" texto="Em até 7 dias: tudo de volta. Mensal depois de 7 dias: sem devolução. Trimestral depois de 7 dias: meses inteiros não iniciados − desconto. Extras depois de 7 dias: créditos não usados × preço por crédito − desconto. Só o cálculo; nenhum estorno acontece aqui.">
      <div style={grade}>
        <TextField label="Ciclo (mensal ou trimestral)" value={f.ciclo} onChange={(e) => setF({ ...f, ciclo: e.target.value.trim() })} />
        <TextField label="Preço pago (R$)" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} />
        <TextField label="Contratado em" type="date" value={f.contratado} onChange={(e) => setF({ ...f, contratado: e.target.value })} />
        <TextField label="Cancelado em (vazio = hoje)" type="date" value={f.cancelado} onChange={(e) => setF({ ...f, cancelado: e.target.value })} />
      </div>
      <div>
        <Button variant="secondary" onClick={simular}>Calcular</Button>
      </div>
      {st.error && <Banner tone="danger">{st.error}</Banner>}
      {st.data && (
        <Banner tone={st.data.abuso ? "warning" : "info"} title={`Devolução: ${reais((st.data.valor_centavos ?? 0) / 100)}`}>
          {st.data.regra === "integral_7_dias" ? "Dentro de 7 dias: devolução integral." : st.data.regra === "mensal_sem_devolucao" ? "Mensal depois de 7 dias: sem devolução." : `${st.data.meses_nao_iniciados} mês(es) não iniciado(s), menos ${st.data.desconto_pct}%.`}
          {st.data.abuso ? " Atenção: este aluno já teve devoluções em 7 dias; a devolução vai para a equipe decidir." : ""}
        </Banner>
      )}
    </Secao>
  );
}

const SEM_FUNCAO = /could not find the function|schema cache|does not exist|PGRST202|42883/i;

/** O bloco inteiro "Carteira de IA" da aba Planos. Sem a migração 013680, só um aviso discreto. */
export function CarteiraIA() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_carteira"), [backend]);
  let corpo;
  if (error && SEM_FUNCAO.test(String(error?.message ?? error))) corpo = <Banner tone="info" title="Carteira de IA">Ainda não está no banco (migração 013680).</Banner>;
  else if (error) corpo = <LoadError error={error} retry={reload} />;
  else if (!data) corpo = <Loading />;
  else corpo = (
    <>
      <Secao titulo="Uso real de IA" texto={data.modo === "ligado" ? "Cadeados ligados: a carteira decide." : "Modo sombra: as cotas de hoje continuam valendo; a carteira só registra o custo real e o que a regra nova faria."}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge tone={data.teto.estourado ? "danger" : "neutral"}>
            Custo de hoje: US$ {num(data.teto.gasto_hoje_usd)}{data.teto.teto_usd != null ? ` de US$ ${num(data.teto.teto_usd)} (teto)` : " (sem teto)"}
          </Badge>
          <Badge>Cotação: R$ {String(data.config.cotacao_dolar ?? "—").replace(".", ",")}</Badge>
          <Badge>Extras ativos: {num(data.extras.ativos)} ({num(data.extras.creditos_restantes)} créditos)</Badge>
        </div>
        <ResumoPeriodo titulo="Hoje" r={data.resumo.hoje} />
        <ResumoPeriodo titulo="Este mês" r={data.resumo.mes} />
        {data.top_alunos_mes.length > 0 && (
          <details>
            <summary>Quem mais usou no mês ({data.top_alunos_mes.length})</summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, font: "var(--type-body-sm)" }}>
              {data.top_alunos_mes.map((a) => (
                <li key={a.email}>{a.email}: {num(a.creditos)} créditos, {num(a.pedidos)} pedidos{a.teriam_sido_barrados ? `, ${a.teriam_sido_barrados} barrados pela regra nova` : ""}</li>
              ))}
            </ul>
          </details>
        )}
      </Secao>
      <Ajustes key={JSON.stringify(data.config) + JSON.stringify(data.pacotes) + JSON.stringify(data.planos_a_venda)} data={data} setData={setData} />
      <CarteiraDoAluno />
      <SimularDevolucao />
    </>
  );
  return (
    <section aria-label="Carteira de IA" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: "8px 0 0", font: "var(--type-h3)" }}>Carteira de IA</h2>
      {corpo}
    </section>
  );
}
