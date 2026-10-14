// Fila de auditoria da vigilância científica: o que a vigilância encontrou (mudança no documento, nova versão, retratação,
// quarentena, link fora do ar, fonte nova), com a fonte, quando foi detectado, o resumo, as versões candidatas e as questões
// afetadas. A equipe marca como vista, bloqueia (com motivo obrigatório) ou desbloqueia, resolve e pede a análise do que mudou;
// toda ação passa por uma confirmação antes de ir ao banco. Nada aqui publica nada nem muda gabarito.
import React from "react";
import { Badge, Banner, Button, Chip, EmptyState, Icon } from "../../../../ds";
import { useSession } from "../../../session.jsx";
import { LoadError, Loading, TextArea, useLoad } from "../../common.jsx";
import { isMissingFunction } from "../AiRequests.jsx";
import { Label, Section, useAction } from "../ui.jsx";
import { Confiabilidade } from "./Confiabilidade.jsx";
import {
  ANALISE_DESLIGADA,
  AvisoFaltaBanco,
  chamar,
  Confirmacao,
  dia,
  escolher,
  FILTROS,
  legenda,
  linkSeguro,
  nivelDaFonte,
  NOTA_MINIMA,
  plural,
  quando,
  SITUACAO,
  STATUS_FONTE,
  tentar,
  texto,
  TIPO,
} from "./comum.jsx";

const PAGINA = 20;

/** As ações da fila: o que o botão diz, a confirmação e o que avisar depois. */
const ACOES = {
  vista: {
    acao: "vista",
    titulo: "Marcar este item como visto?",
    explica: "Fica registrado que a equipe viu este aviso. Nada muda na fonte nem nas questões.",
    confirmar: "Sim, marcar como vista",
    icone: "eye",
    nota: null,
    feito: "Item marcado como visto.",
  },
  bloquear: {
    acao: "bloquear",
    titulo: "Bloquear esta fonte?",
    explica: "Fonte bloqueada não deve ser usada como evidência até alguém desbloquear. Nada é apagado. O motivo fica registrado.",
    confirmar: "Sim, bloquear",
    icone: "ban",
    nota: "obrigatoria",
    feito: "Fonte bloqueada. O motivo ficou registrado.",
  },
  desbloquear: {
    acao: "desbloquear",
    titulo: "Desbloquear esta fonte?",
    explica: "A fonte deixa de estar bloqueada por decisão da equipe. Se quiser, explique o motivo.",
    confirmar: "Sim, desbloquear",
    icone: "lock-open",
    nota: "opcional",
    feito: "Fonte desbloqueada.",
  },
  resolver: {
    acao: "resolver",
    titulo: "Marcar como resolvido?",
    explica: "Use quando o que a vigilância apontou já foi tratado. Se quiser, diga o que foi feito.",
    confirmar: "Sim, resolver",
    icone: "check",
    nota: "opcional",
    feito: "Item resolvido.",
  },
  analise: {
    titulo: "Pedir a análise do que mudou?",
    explica: "A IA da função “Análise do que mudou” escreve um resumo do que mudou, para a equipe revisar. Nada é publicado nem muda nas questões sem a equipe. Pode gerar custo com o serviço de IA.",
    confirmar: "Sim, pedir a análise",
    icone: "sparkles",
    nota: null,
  },
};

function QuestoesAfetadas({ n }) {
  if (n == null) return <span style={legenda}>Questões afetadas: ainda não calculado</span>;
  if (Number(n) === 0) return <Badge size="sm">Nenhuma questão afetada</Badge>;
  return (
    <Badge size="sm" tone="warning" icon="file-warning">
      {plural(Number(n), "questão afetada", "questões afetadas")}
    </Badge>
  );
}

function VersoesCandidatas({ versoes }) {
  if (!Array.isArray(versoes) || versoes.length === 0) return null;
  return (
    <>
      <Label>Versões candidatas</Label>
      <ul aria-label="Versões candidatas" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
        {versoes.map((v, i) => {
          const url = linkSeguro(v.url);
          const nome = v.titulo || v.url || "Versão sem título";
          const extra = [v.data ? `data: ${dia(v.data)}` : null, v.ato ? `ato: ${v.ato}` : null].filter(Boolean).join(" · ");
          return (
            <li key={`${v.url ?? ""}-${i}`} style={{ font: "var(--type-body-sm)", overflowWrap: "anywhere" }}>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {nome}
                </a>
              ) : (
                nome
              )}
              {extra && <div style={legenda}>{extra}</div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ItemFila({ item, analiseLigada, aoConcluir, aoMudarFonte }) {
  const { backend } = useSession();
  const acao = useAction();
  const [pedido, setPedido] = React.useState(null);
  const [nota, setNota] = React.useState("");
  const [analisePedida, setAnalisePedida] = React.useState(null);
  const [verConfiabilidade, setVerConfiabilidade] = React.useState(false);
  const f = item.fonte ?? {};
  const [tipoRotulo, tipoTom, tipoIcone] = escolher(TIPO, item.tipo) ?? ["Aviso da vigilância", "neutral", "radar"];
  const situacao = escolher(SITUACAO, item.situacao);
  const statusFonte = escolher(STATUS_FONTE, f.status);
  const nivel = nivelDaFonte(f.nivel);
  const url = linkSeguro(f.url);
  const s = item.situacao;
  const resolvida = s === "resolvida";
  const temAnalise = !resolvida && (item.tipo === "mudanca" || item.tipo === "nova_versao");
  const cfg = pedido ? ACOES[pedido] : null;
  const notaCurta = cfg?.nota === "obrigatoria" && nota.trim().length < NOTA_MINIMA;
  const abrir = (qual) => {
    setPedido(qual);
    setNota("");
    setAnalisePedida(null);
  };
  const confirmar = async () => {
    if (pedido === "analise") {
      const r = await tentar(acao, () => chamar(backend, "app_admin_vigilance_request_analysis", { p_item_id: item.id }));
      if (!r.ok) return;
      setPedido(null);
      setAnalisePedida("Pedido de análise enviado. A análise roda no servidor; nada é publicado sem a equipe.");
      return;
    }
    const r = await tentar(acao, () => chamar(backend, "app_admin_vigilance_mark", { p_id: item.id, p_action: cfg.acao, p_note: nota.trim() || null }));
    if (!r.ok) return;
    setPedido(null);
    setNota("");
    aoConcluir(cfg.feito);
  };
  return (
    <div role="group" aria-label={`${tipoRotulo}: ${f.titulo ?? "fonte sem título"}`} style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: 12, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Badge size="sm" tone={tipoTom} icon={tipoIcone}>
          {tipoRotulo}
        </Badge>
        {situacao && (
          <Badge size="sm" tone={situacao[1]}>
            {situacao[0]}
          </Badge>
        )}
        <span style={legenda}>detectado em {quando(item.detectado_em)}</span>
      </div>
      <strong style={{ font: "var(--type-body)", fontWeight: 600, marginTop: 6, overflowWrap: "anywhere" }}>{f.titulo || "Fonte sem título"}</strong>
      {f.orgao && <span style={texto}>{f.orgao}</span>}
      {f.versao && <span style={{ ...legenda, overflowWrap: "anywhere" }}>Versão: {f.versao}</span>}
      {(nivel || statusFonte) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
          {nivel && (
            <Badge size="sm" tone="info">
              <span title={nivel.longo}>{nivel.curto}</span>
            </Badge>
          )}
          {statusFonte && (
            <Badge size="sm" tone={statusFonte[1]}>
              {statusFonte[0]}
            </Badge>
          )}
        </div>
      )}
      {item.resumo && (
        <>
          <Label>O que a vigilância encontrou</Label>
          <div style={{ font: "var(--type-body-sm)", overflowWrap: "anywhere" }}>{item.resumo}</div>
        </>
      )}
      <VersoesCandidatas versoes={item.versoes_candidatas} />
      <div style={{ marginTop: 8 }}>
        <QuestoesAfetadas n={item.questoes_afetadas} />
      </div>
      {item.nota && (
        <>
          <Label>Nota da equipe</Label>
          <div style={{ font: "var(--type-body-sm)", overflowWrap: "anywhere" }}>{item.nota}</div>
        </>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {s === "pendente" && (
          <Button size="sm" variant="secondary" icon="eye" onClick={() => abrir("vista")}>
            Marcar como vista
          </Button>
        )}
        {s === "bloqueada" ? (
          <Button size="sm" variant="secondary" icon="lock-open" onClick={() => abrir("desbloquear")}>
            Desbloquear
          </Button>
        ) : (
          !resolvida && (
            <Button size="sm" variant="secondary" icon="ban" onClick={() => abrir("bloquear")}>
              Bloquear
            </Button>
          )
        )}
        {!resolvida && (
          <Button size="sm" variant="secondary" icon="check" onClick={() => abrir("resolver")}>
            Resolver
          </Button>
        )}
        {url && (
          <a className="sm-btn sm-btn--ghost sm-btn--sm" href={url} target="_blank" rel="noopener noreferrer">
            <Icon name="external-link" size={16} />
            Abrir fonte
          </a>
        )}
        {f.id && (
          <Button size="sm" variant="ghost" icon="gauge" aria-expanded={verConfiabilidade} onClick={() => setVerConfiabilidade((v) => !v)}>
            {verConfiabilidade ? "Fechar confiabilidade" : "Ver confiabilidade"}
          </Button>
        )}
        {temAnalise && (
          <Button size="sm" variant="secondary" icon="sparkles" disabled={!analiseLigada} onClick={() => abrir("analise")}>
            Pedir análise do que mudou
          </Button>
        )}
      </div>
      {temAnalise && !analiseLigada && <span style={legenda}>{ANALISE_DESLIGADA}</span>}
      {cfg && (
        <div style={{ marginTop: 8 }}>
          <Confirmacao titulo={cfg.titulo} rotulo={cfg.confirmar} icone={cfg.icone} ocupado={acao.busy} bloqueado={notaCurta} aoConfirmar={confirmar} aoCancelar={() => (setPedido(null), setNota(""))}>
            <span style={texto}>
              {cfg.explica}
              {pedido === "desbloquear" && item.tipo === "retratada" ? " Atenção: artigo retratado não deve voltar a ser usado como evidência." : ""}
            </span>
            {cfg.nota && (
              <TextArea
                label={cfg.nota === "obrigatoria" ? `Motivo do bloqueio (obrigatório, pelo menos ${NOTA_MINIMA} caracteres)` : "Nota (opcional)"}
                value={nota}
                onChange={setNota}
                rows={2}
                maxLength={1000}
              />
            )}
          </Confirmacao>
        </div>
      )}
      {acao.feedback}
      {analisePedida && <Banner tone="success">{analisePedida}</Banner>}
      {verConfiabilidade && f.id && <Confiabilidade fonteId={f.id} aoMudar={aoMudarFonte} />}
    </div>
  );
}

export function FilaAuditoria({ analiseLigada, recarregar = 0, aoMudar }) {
  const { backend } = useSession();
  const [filtro, setFiltro] = React.useState("pendentes");
  const [pagina, setPagina] = React.useState(0);
  const [feito, setFeito] = React.useState(null);
  const fila = useLoad(() => backend.rpc("app_admin_vigilance_queue", { p_filter: filtro, p_limit: PAGINA, p_offset: pagina * PAGINA }), [backend, filtro, pagina, recarregar]);
  const itens = Array.isArray(fila.data?.items) ? fila.data.items : [];
  const contado = fila.data?.total == null ? NaN : Number(fila.data.total);
  const total = Number.isFinite(contado) ? contado : itens.length;
  const paginas = Math.max(Math.ceil(total / PAGINA), 1);
  React.useEffect(() => {
    // depois de resolver itens a última página pode sumir: volta para a última que existe
    if (fila.data && pagina > 0 && pagina >= paginas) setPagina(paginas - 1);
  }, [fila.data, pagina, paginas]);
  const trocarFiltro = (valor) => {
    setFiltro(valor);
    setPagina(0);
    setFeito(null);
  };
  const concluido = (mensagem) => {
    setFeito(mensagem);
    fila.reload();
    aoMudar?.();
  };
  const fonteMudou = () => {
    fila.reload();
    aoMudar?.();
  };
  return (
    <Section title="Fila de auditoria">
      {isMissingFunction(fila.error) ? (
        <AvisoFaltaBanco titulo="Fila de auditoria ainda indisponível" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div role="group" aria-label="Filtrar a fila" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {FILTROS.map((f) => (
              <Chip key={f.value} selected={filtro === f.value} onClick={() => trocarFiltro(f.value)}>
                {f.label}
              </Chip>
            ))}
          </div>
          {feito && <Banner tone="success">{feito}</Banner>}
          {fila.error && <LoadError error={fila.error} retry={fila.reload} />}
          {!fila.data && !fila.error && <Loading />}
          {fila.data && itens.length === 0 && <EmptyState icon="radar" title="Nada nesta fila" description="Quando a vigilância encontrar mudança, nova versão, retratação, fonte em quarentena ou link fora do ar, o aviso aparece aqui." />}
          {itens.map((item) => (
            <ItemFila key={item.id} item={item} analiseLigada={analiseLigada} aoConcluir={concluido} aoMudarFonte={fonteMudou} />
          ))}
          {paginas > 1 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
              <Button size="sm" variant="secondary" disabled={pagina === 0} onClick={() => (setPagina(pagina - 1), setFeito(null))}>
                Anterior
              </Button>
              <span style={{ font: "var(--type-label)" }}>
                {pagina + 1}/{paginas}
              </span>
              <Button size="sm" variant="secondary" disabled={pagina + 1 >= paginas} onClick={() => (setPagina(pagina + 1), setFeito(null))}>
                Próxima
              </Button>
            </div>
          )}
          {fila.data && <span style={legenda}>{plural(total, "item nesta fila", "itens nesta fila")}</span>}
        </div>
      )}
    </Section>
  );
}
