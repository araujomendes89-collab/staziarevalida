// Administração › Planos › "Planos por fase e cadeados" (migração …013640, ETAPA 1 dos planos, decisões do dono de 17/10).
// Só o administrador. Mostra e edita: a chave do modo sombra, a 2ª fase aberta aos alunos (só na regra nova), a amostra do teste,
// o valor do crédito, os 3 planos por fase (preços mensal e trimestral, créditos por dia/mês e minutos de voz por mês) e a
// amostra de cada recurso. Nada aqui vende nem tranca: a cobrança está desligada e, em modo sombra, a regra nova só informa.
// O diagnóstico mostra, para um aluno, o que ele teria liberado/trancado pela regra nova ao lado da regra de hoje.
import React from "react";
import { Badge, Banner, Button, Card, SelectField, Switch, TextField } from "../../../ds";
import { useSession } from "../../session.jsx";
import { LoadError, Loading, messageOf, useLoad } from "../common.jsx";

const FASE_LABEL = { teoria: "1ª fase", pratica: "2ª fase", comum: "As duas fases" };
const ACESSO = {
  liberado: { label: "Liberado", tone: "success" },
  amostra: { label: "Amostra", tone: "warning" },
  trancado: { label: "Trancado", tone: "danger" },
  nao_existe: { label: "Ainda não existe", tone: "neutral" },
  desligado: { label: "Desligado", tone: "neutral" },
};
const PERFIL = {
  elite: "ELITE (as duas fases)",
  pro: "PRO (1ª fase)",
  pratica: "PRÁTICA (2ª fase)",
  teste: "Em teste grátis",
  vencido: "Teste ou plano vencido (amostra)",
  sem_acesso: "Sem acesso",
  equipe: "Equipe ou revisor (acesso completo)",
};
const SITUACAO = { paga: "Paga", teste: "Em teste", vencida: "Vencida (amostra)", sem_acesso: "Sem acesso" };
const MOTIVO = {
  teste_acabou: "o teste acabou",
  plano_acabou: "o plano venceu",
  plano_cancelado: "plano cancelado",
  sem_teste: "cadastro sem teste",
  teste_repetido_telefone: "WhatsApp já usado em outro teste",
  fora_do_plano: "fora do plano pago",
  fora_da_escolha_do_teste: "fora da fase escolhida no teste",
  pagamento_pendente: "pagamento pendente (vale até o fim do período; sem tolerância)",
  pagamento_nao_confirmado: "renovação sem pagamento confirmado",
};
const MODOS_CONTEUDO = [
  { value: "por_dia", label: "Limite por dia" },
  { value: "do_dia", label: "Só os do dia" },
  { value: "livre", label: "Livre na amostra" },
  { value: "trancado", label: "Fora da amostra" },
];
const MODOS = {
  conteudo: MODOS_CONTEUDO,
  credito: [{ value: "creditos", label: "Créditos da amostra" }, { value: "trancado", label: "Fora da amostra" }],
  minutos: [{ value: "minutos_total", label: "Minutos do teste" }, { value: "trancado", label: "Fora da amostra" }],
};

/** "99,90" → 9990; vazio ou ilegível → NaN. */
export function reaisParaCentavos(texto) {
  const raw = String(texto ?? "").replace(/R\$|\s/g, "");
  if (!raw) return NaN;
  const limpo = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return NaN;
  return Math.round(Number(limpo) * 100);
}
export const centavosParaReais = (c) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
const inteiro = (v) => /^\d{1,7}$/.test(String(v ?? "").trim());

function Secao({ titulo, children, texto }) {
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

function formDe(data) {
  return {
    config: {
      cadeados_ligados: data.config.cadeados_ligados,
      fase2_aberta_alunos: data.config.fase2_aberta_alunos,
      amostra_creditos_dia: String(data.config.amostra_creditos_dia),
      amostra_voz_minutos_total: String(data.config.amostra_voz_minutos_total),
      credito_valor: centavosParaReais(data.config.credito_valor_centavos),
      cotacao_dolar: data.config.cotacao_dolar == null ? "" : String(data.config.cotacao_dolar).replace(".", ","),
    },
    planos: data.planos.map((p) => ({
      codigo: p.codigo,
      nome: p.nome,
      descricao: p.descricao ?? "",
      mensal: centavosParaReais(p.preco_mensal_centavos),
      trimestral: centavosParaReais(p.preco_trimestral_centavos),
      creditos_dia: String(p.creditos_dia),
      creditos_mes: String(p.creditos_mes),
      voz_minutos_mes: String(p.voz_minutos_mes),
    })),
    recursos: Object.fromEntries(data.recursos.map((r) => [r.codigo, { modo: r.amostra_modo, limite: r.amostra_limite == null ? "" : String(r.amostra_limite), confirmar: false }])),
  };
}

/** Monta o que vai para app_admin_direitos_salvar; devolve { dados } ou { erro }. Só manda os recursos que mudaram ou foram confirmados. */
export function montarSalvar(data, form) {
  const c = form.config;
  for (const [campo, nome] of [["amostra_creditos_dia", "Créditos por dia da amostra"], ["amostra_voz_minutos_total", "Minutos de voz no teste"]]) {
    if (!inteiro(c[campo])) return { erro: `${nome}: número inteiro, 0 ou mais.` };
  }
  const credito = reaisParaCentavos(c.credito_valor);
  if (Number.isNaN(credito) || credito < 1) return { erro: "Valor do crédito: em reais, por exemplo 0,10." };
  let cotacao = null;
  if (String(c.cotacao_dolar).trim()) {
    const n = Number(String(c.cotacao_dolar).trim().replace(",", "."));
    if (!Number.isFinite(n) || n < 0.5 || n > 50) return { erro: "Cotação do dólar: um valor entre 0,50 e 50 (ex.: 5,40)." };
    cotacao = String(Math.round(n * 10000) / 10000);
  }
  const planos = [];
  for (const p of form.planos) {
    const mensal = reaisParaCentavos(p.mensal);
    const trimestral = reaisParaCentavos(p.trimestral);
    if (!p.nome.trim()) return { erro: "Informe o nome de cada plano." };
    if (Number.isNaN(mensal) || Number.isNaN(trimestral)) return { erro: `Preço inválido no plano ${p.nome}. Use, por exemplo, 99,90.` };
    if (![p.creditos_dia, p.creditos_mes, p.voz_minutos_mes].every(inteiro)) return { erro: `Créditos e minutos do plano ${p.nome}: números inteiros.` };
    if (Number(p.creditos_dia) > Number(p.creditos_mes)) return { erro: `No plano ${p.nome}, os créditos por dia não podem passar dos créditos por mês.` };
    planos.push({
      codigo: p.codigo, nome: p.nome.trim(), descricao: p.descricao, preco_mensal_centavos: mensal, preco_trimestral_centavos: trimestral,
      creditos_dia: Number(p.creditos_dia), creditos_mes: Number(p.creditos_mes), voz_minutos_mes: Number(p.voz_minutos_mes),
    });
  }
  const recursos = [];
  for (const r of data.recursos) {
    const f = form.recursos[r.codigo];
    const limite = f.modo === "por_dia" ? f.limite : "";
    if (f.modo === "por_dia" && !/^\d{1,4}$/.test(String(limite).trim())) return { erro: `${r.nome}: informe quantos por dia na amostra.` };
    const mudou = f.modo !== r.amostra_modo || (f.modo === "por_dia" && Number(limite) !== r.amostra_limite);
    if (mudou || f.confirmar) recursos.push({ codigo: r.codigo, amostra_modo: f.modo, amostra_limite: f.modo === "por_dia" ? Number(limite) : null });
  }
  return {
    dados: {
      config: {
        cadeados_ligados: c.cadeados_ligados, fase2_aberta_alunos: c.fase2_aberta_alunos, amostra_creditos_dia: Number(c.amostra_creditos_dia),
        amostra_voz_minutos_total: Number(c.amostra_voz_minutos_total), credito_valor_centavos: credito, cotacao_dolar: cotacao,
      },
      planos,
      recursos,
    },
  };
}

export function DireitosPorFase({ data, setData }) {
  const { backend } = useSession();
  const [form, setForm] = React.useState(() => formDe(data));
  const [state, setState] = React.useState({ saving: false, error: null, done: false });
  React.useEffect(() => {
    setForm(formDe(data));
  }, [data]);
  const mexe = (fn) => (setForm((f) => fn(structuredClone(f))), setState({ saving: false, error: null, done: false }));
  const setCfg = (patch) => mexe((f) => ((f.config = { ...f.config, ...patch }), f));
  const setPlano = (i, patch) => mexe((f) => ((f.planos[i] = { ...f.planos[i], ...patch }), f));
  const setRecurso = (codigo, patch) => mexe((f) => ((f.recursos[codigo] = { ...f.recursos[codigo], ...patch }), f));
  const ligando = form.config.cadeados_ligados && !data.config.cadeados_ligados;

  const salvar = async (event) => {
    event.preventDefault();
    const { dados, erro } = montarSalvar(data, form);
    if (erro) return setState({ saving: false, error: erro, done: false });
    setState({ saving: true, error: null, done: false });
    try {
      setData(await backend.rpc("app_admin_direitos_salvar", { p_dados: dados }));
      setState({ saving: false, error: null, done: true });
    } catch (err) {
      setState({ saving: false, error: messageOf(err), done: false });
    }
  };
  const resumo = data.resumo ?? {};

  return (
    <form onSubmit={salvar} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
      <Banner tone={data.config.cadeados_ligados ? "warning" : "info"} title={data.config.cadeados_ligados ? "Cadeados: chave LIGADA" : "Modo sombra: nada é trancado"}>
        {data.config.cadeados_ligados
          ? "A chave está ligada, mas nesta versão do app nada passou a ser trancado ainda: as telas e o banco só vão obedecer a ela nas próximas etapas (cadeados no banco e nas telas)."
          : "A regra nova por fase (PRO = 1ª fase, PRÁTICA = 2ª fase, ELITE = as duas) já é calculada para cada aluno, mas só informa. Os alunos continuam com o acesso de hoje. Use o diagnóstico abaixo para conferir antes de ligar."}
      </Banner>

      <Secao titulo="Chaves" texto="Toda mudança fica no Registro.">
        <Switch
          label="Cadeados ligados"
          description="Desligado = modo sombra (a regra nova só informa; as cotas e acessos de hoje continuam). Ligado = a carteira de IA decide os créditos e minutos, e os cadeados do banco passam a valer (questões, simulados, flashcards, estações). As telas com cadeado e a mensagem de compra vêm na etapa 4."
          checked={form.config.cadeados_ligados}
          onChange={(e) => setCfg({ cadeados_ligados: e.target.checked })}
        />
        {ligando && <Banner tone="warning" title="Confira antes de ligar">Pelo resumo, {resumo.perderiam_algo ?? 0} aluno(s) teriam algo trancado ou reduzido para amostra quando os cadeados valerem. Salve só se tiver certeza.</Banner>}
        <Switch
          label="2ª fase aberta aos alunos (regra nova)"
          description="Desligada: na regra nova, estações, checklists e o resto da prática ficam fechados e o teste da 2ª fase não existe. Não muda as telas de hoje: a 2ª fase continua fechada no app."
          checked={form.config.fase2_aberta_alunos}
          onChange={(e) => setCfg({ fase2_aberta_alunos: e.target.checked })}
        />
      </Secao>

      <Secao titulo="Teste grátis e amostra" texto={`O teste dura ${data.config.teste_dias} dias (em Configurações) e ${data.config.teste_no_cadastro ? "é oferecido no cadastro" : "NÃO é oferecido no cadastro"} (plano Teste grátis, abaixo). No teste e depois que vence, o aluno fica com a amostra do dia; os limites de cada recurso estão na tabela de recursos.`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <TextField label="Créditos de IA por dia na amostra" inputMode="numeric" value={form.config.amostra_creditos_dia} onChange={(e) => setCfg({ amostra_creditos_dia: e.target.value.replace(/\D/g, "") })} />
          <TextField label="Minutos de voz no total do teste" inputMode="numeric" value={form.config.amostra_voz_minutos_total} onChange={(e) => setCfg({ amostra_voz_minutos_total: e.target.value.replace(/\D/g, "") })} />
        </div>
      </Secao>

      <Secao titulo="Créditos de IA" texto="Gastam crédito: Tutor por texto, janelinha do Tutor, correção de estação por IA e dica na questão. A voz ao vivo conta em minutos, à parte. Nesta etapa o saldo só é calculado: nada é descontado nem bloqueado.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <TextField label="1 crédito vale (R$ de custo de IA)" inputMode="decimal" value={form.config.credito_valor} onChange={(e) => setCfg({ credito_valor: e.target.value })} />
          <TextField
            label="Cotação do dólar (R$)"
            inputMode="decimal"
            placeholder="ex.: 5,40"
            value={form.config.cotacao_dolar}
            hint={form.config.cotacao_dolar.trim() ? "O custo registrado em US$ vira créditos por esta cotação." : "Pendente: sem cotação, o cálculo conta 1 crédito por mensagem do Tutor."}
            onChange={(e) => setCfg({ cotacao_dolar: e.target.value })}
          />
        </div>
      </Secao>

      <Secao titulo="Planos por fase" texto="Preços guardados para quando a cobrança existir. Nenhum plano está à venda: a cobrança está desligada e o aluno não vê preço.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
          {form.planos.map((p, i) => {
            const orig = data.planos[i];
            return (
              <div key={p.codigo} data-plano={p.codigo} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 16, border: "1px solid var(--border-default)", background: "var(--surface-subtle)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b style={{ font: "var(--type-h5, var(--type-body-md))" }}>{orig.nome}</b>
                  {orig.fases.map((f) => (
                    <Badge key={f} size="sm" tone="brand">{FASE_LABEL[f]}</Badge>
                  ))}
                  <Badge size="sm">Fora de venda</Badge>
                </div>
                <TextField label={`Nome (${orig.codigo})`} maxLength={60} value={p.nome} onChange={(e) => setPlano(i, { nome: e.target.value })} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <TextField label={`Mensal (R$) · ${orig.nome}`} inputMode="decimal" value={p.mensal} onChange={(e) => setPlano(i, { mensal: e.target.value })} />
                  <TextField label={`Trimestral (R$) · ${orig.nome}`} inputMode="decimal" value={p.trimestral} onChange={(e) => setPlano(i, { trimestral: e.target.value })} />
                  <TextField label={`Créditos por dia · ${orig.nome}`} inputMode="numeric" value={p.creditos_dia} onChange={(e) => setPlano(i, { creditos_dia: e.target.value.replace(/\D/g, "") })} />
                  <TextField label={`Créditos por mês · ${orig.nome}`} inputMode="numeric" value={p.creditos_mes} onChange={(e) => setPlano(i, { creditos_mes: e.target.value.replace(/\D/g, "") })} />
                  <TextField label={`Voz ao vivo (min/mês) · ${orig.nome}`} inputMode="numeric" value={p.voz_minutos_mes} onChange={(e) => setPlano(i, { voz_minutos_mes: e.target.value.replace(/\D/g, "") })} />
                </div>
              </div>
            );
          })}
        </div>
      </Secao>

      <Secao titulo="Recursos: o que cada fase abre e a amostra" texto="PRO abre a 1ª fase; PRÁTICA abre a 2ª fase; ELITE abre as duas. 'As duas fases' abre com qualquer plano. A amostra vale no teste e para quem venceu ou cancelou.">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.recursos.map((r) => {
            const f = form.recursos[r.codigo];
            return (
              <div key={r.codigo} data-recurso={r.codigo} style={{ display: "grid", gridTemplateColumns: "minmax(180px,2fr) minmax(160px,1.4fr) minmax(110px,1fr)", gap: 10, alignItems: "end", padding: "10px 0", borderBottom: "1px solid var(--border-subtle, var(--border-default))" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <b style={{ font: "var(--type-label)" }}>{r.nome}</b>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Badge size="sm" tone={r.fase === "comum" ? "neutral" : "brand"}>{FASE_LABEL[r.fase]}</Badge>
                    {!r.existe && <Badge size="sm">Ainda não está no app</Badge>}
                    {!r.decidido && <Badge size="sm" tone="warning">Proposta: confirme</Badge>}
                  </span>
                  {!r.decidido && <label style={{ font: "var(--type-caption)", display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.confirmar} onChange={(e) => setRecurso(r.codigo, { confirmar: e.target.checked })} />Confirmo esta amostra</label>}
                </div>
                <SelectField label={`Amostra · ${r.nome}`} value={f.modo} options={MODOS[r.tipo]} onChange={(e) => setRecurso(r.codigo, { modo: e.target.value })} />
                {f.modo === "por_dia" ? (
                  <TextField label={`Por dia · ${r.nome}`} inputMode="numeric" value={f.limite} hint={r.unidade ?? undefined} onChange={(e) => setRecurso(r.codigo, { limite: e.target.value.replace(/\D/g, "") })} />
                ) : (
                  <span style={{ font: "var(--type-body-sm)", color: "var(--text-tertiary)", paddingBottom: 12 }}>
                    {f.modo === "creditos" ? `${form.config.amostra_creditos_dia} créditos/dia` : f.modo === "minutos_total" ? `${form.config.amostra_voz_minutos_total} min no teste` : f.modo === "do_dia" ? "só os do dia" : f.modo === "livre" ? "sem limite" : "trancado"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Secao>

      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
        {state.done && <span style={{ font: "var(--type-body-sm)", color: "var(--success-text)" }}>Planos por fase salvos.</span>}
        <Button type="submit" loading={state.saving}>
          Salvar planos por fase
        </Button>
      </div>

      <Secao titulo="Resumo da regra nova" texto="Alunos (sem equipe e revisores), se os cadeados valessem hoje.">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge>Alunos: {resumo.alunos ?? 0}</Badge>
          {Object.entries(resumo.por_perfil ?? {}).map(([k, n]) => (
            <Badge key={k} tone="brand">{PERFIL[k] ?? k}: {n}</Badge>
          ))}
          <Badge tone="danger">Perderiam algo: {resumo.perderiam_algo ?? 0}</Badge>
          <Badge tone="success">Ganhariam algo: {resumo.ganhariam_algo ?? 0}</Badge>
          {resumo.teste_repetido_telefone > 0 && <Badge tone="warning">Teste com WhatsApp repetido: {resumo.teste_repetido_telefone}</Badge>}
        </div>
      </Secao>
    </form>
  );
}

const tempo = (s) => (s == null ? "—" : s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}` : `${s} s`);

/** Diagnóstico: o que o aluno X teria liberado/trancado pela regra nova, ao lado da regra de hoje. Só lê. */
export function DiagnosticoDireitos() {
  const { backend } = useSession();
  const [busca, setBusca] = React.useState("");
  const [state, setState] = React.useState({ loading: false, error: null, data: null });
  const consultar = async (event) => {
    event.preventDefault();
    if (!busca.trim()) return setState({ loading: false, error: "Informe o e-mail do aluno.", data: null });
    setState({ loading: true, error: null, data: null });
    try {
      setState({ loading: false, error: null, data: await backend.rpc("app_admin_direitos_aluno", { p_busca: busca.trim() }) });
    } catch (err) {
      setState({ loading: false, error: messageOf(err), data: null });
    }
  };
  const d = state.data;
  const nova = d?.regra_nova;
  return (
    <Secao titulo="Diagnóstico: o que este aluno teria" texto="Compara a regra de hoje com a regra nova, recurso por recurso. Só consulta: não muda nada para o aluno.">
      <form onSubmit={consultar} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }} noValidate>
        <div style={{ flex: "1 1 260px" }}>
          <TextField label="E-mail do aluno" type="email" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="aluno@exemplo.com" />
        </div>
        <Button type="submit" loading={state.loading} variant="secondary">
          Ver direitos
        </Button>
      </form>
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {d && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <b>{d.aluno.nome || d.aluno.email}</b>
            <Badge tone="brand">{PERFIL[nova.perfil] ?? nova.perfil}</Badge>
            <Badge>{nova.modo === "sombra" ? "Modo sombra" : "Cadeados ligados"}</Badge>
            {nova.teste?.repetido_telefone && <Badge tone="warning">WhatsApp já usado em outro teste</Badge>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["teoria", "pratica"].map((f) => (
              <Badge key={f} tone={nova.fases[f].situacao === "paga" ? "success" : nova.fases[f].situacao === "teste" ? "warning" : "neutral"}>
                {FASE_LABEL[f]}: {SITUACAO[nova.fases[f].situacao] ?? nova.fases[f].situacao}
                {MOTIVO[nova.fases[f].motivo] ? ` · ${MOTIVO[nova.fases[f].motivo]}` : ""}
                {f === "pratica" && !nova.fases.pratica.aberta ? " · 2ª fase fechada" : ""}
              </Badge>
            ))}
          </div>
          {!nova.equipe && (
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-secondary)" }}>
              Créditos de IA: {nova.creditos.usados_hoje}/{nova.creditos.franquia_dia} hoje
              {nova.creditos.franquia_mes != null ? ` · ${nova.creditos.usados_mes}/${nova.creditos.franquia_mes} no mês` : ""}
              {nova.creditos.base === "mensagens" ? " (1 por mensagem, até informar a cotação)" : ""} · Voz: {tempo(nova.voz.usado_s)} de {tempo(nova.voz.limite_s)}
              {nova.voz.periodo === "mes" ? " no mês" : nova.voz.periodo === "teste_total" ? " no teste" : ""}
            </div>
          )}
          <Banner tone={d.diferencas.length ? "warning" : "success"} title={d.diferencas.length ? `${d.diferencas.length} diferença(s) entre hoje e a regra nova` : "Sem diferença entre hoje e a regra nova"}>
            {d.diferencas.length ? d.diferencas.map((x) => `${x.nome}: hoje ${ACESSO[x.hoje]?.label.toLowerCase() ?? x.hoje} → ${ACESSO[x.regra_nova]?.label.toLowerCase() ?? x.regra_nova}`).join(" · ") : "Ligar os cadeados não mudaria nada para este aluno."}
          </Banner>
          <div role="table" aria-label="Recursos do aluno" style={{ display: "flex", flexDirection: "column" }}>
            <div role="row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, font: "var(--type-label)", padding: "6px 0", borderBottom: "1px solid var(--border-default)" }}>
              <span role="columnheader">Recurso</span>
              <span role="columnheader">Hoje</span>
              <span role="columnheader">Regra nova</span>
            </div>
            {Object.entries(nova.recursos).map(([codigo, r]) => {
              const hoje = d.regra_atual[codigo];
              return (
                <div role="row" key={codigo} data-recurso={codigo} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--border-subtle, var(--border-default))", alignItems: "start" }}>
                  <span role="cell" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span>{r.nome}</span>
                    {r.mensagem && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{r.mensagem}</span>}
                    {r.ofertas?.length > 0 && (
                      <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>
                        Convite: {r.ofertas.map((o) => (o.tipo === "testar" ? `testar a ${FASE_LABEL[o.fase]}` : `assinar ${o.nome}`)).join(", ")}
                      </span>
                    )}
                  </span>
                  <span role="cell"><Badge size="sm" tone={ACESSO[hoje]?.tone}>{ACESSO[hoje]?.label ?? hoje}</Badge></span>
                  <span role="cell">
                    <Badge size="sm" tone={ACESSO[r.acesso]?.tone}>{ACESSO[r.acesso]?.label ?? r.acesso}</Badge>
                    {r.amostra?.limite != null && <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", marginLeft: 6 }}>{r.amostra.limite} {r.amostra.unidade ?? ""}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Secao>
  );
}

const SEM_FUNCAO = /could not find the function|schema cache|does not exist|PGRST202|42883/i;

/** O bloco inteiro da aba Planos. Se o banco ainda não tem a migração 013640, mostra só um aviso discreto (o resto da aba segue). */
export function PlanosPorFase() {
  const { backend } = useSession();
  const { data, error, reload, setData } = useLoad(() => backend.rpc("app_admin_direitos"), [backend]);
  let corpo;
  if (error && SEM_FUNCAO.test(String(error?.message ?? error))) corpo = <Banner tone="info" title="Planos por fase">Ainda não estão no banco (migração 013640).</Banner>;
  else if (error) corpo = <LoadError error={error} retry={reload} />;
  else if (!data) corpo = <Loading />;
  else corpo = (
    <>
      <DireitosPorFase data={data} setData={setData} />
      <DiagnosticoDireitos />
    </>
  );
  return (
    <section aria-label="Planos por fase e cadeados" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: "8px 0 0", font: "var(--type-h3)" }}>Planos por fase e cadeados</h2>
      {corpo}
    </section>
  );
}
