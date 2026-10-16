import React from "react";
import { useOptionalSession } from "../../session.jsx";
import { controleDe } from "./controle.js";
import { EstadoRascunho } from "./IndicadorRascunho.jsx";
import ParagrafoRico from "../leitor/ParagrafoRico.jsx";
import LeitorDoc from "../leitor/LeitorDoc.jsx";

export function formatarDataHoraCompleta(dataOuIso) {
  if (!dataOuIso) return "—";
  const d = typeof dataOuIso === "number" || typeof dataOuIso === "string" ? new Date(dataOuIso) : dataOuIso;
  if (isNaN(d.getTime())) return "—";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  const hora = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${ano} ${hora}:${min}`;
}

const ROTULOS_STATUS = {
  draft: "Rascunho",
  awaiting_review: "Aguardando revisão",
  approved: "Aprovada",
  published: "No ar",
  needs_update: "Precisa de atualização",
  retired: "Retirada",
};

const CONFIRMACAO_RESTAURAR =
  "O texto atual desta versão será trocado por este. Se o conteúdo mudar, as aprovações desta versão deixam de valer e os materiais precisam ser gerados de novo. Se mudar só a formatação, as aprovações continuam. O que você ainda não salvou no editor fica guardado no rascunho.";

export default function PainelHistorico({ editor, ctx, backend: propBackend }) {
  const controle = controleDe(editor);
  const sessao = useOptionalSession();
  const backend = propBackend ?? sessao?.backend ?? null;

  const versionId = ctx?.contexto?.versionId;

  const [dados, setDados] = React.useState(null);
  const [carregando, setCarregando] = React.useState(false);
  const [mensagem, setMensagem] = React.useState(null);
  const [previaId, setPreviaId] = React.useState(null);
  const [previaConteudo, setPreviaConteudo] = React.useState(null);
  const [carregandoPrevia, setCarregandoPrevia] = React.useState(false);
  const [restaurando, setRestaurando] = React.useState(false);

  if (controle) {
    controle.atualizarCtx(ctx);
  }

  const carregarHistorico = React.useCallback(async () => {
    if (!backend || !versionId) return;
    setCarregando(true);
    try {
      const res = await backend.rpc("app_ch_doc_historico", {
        p_version_id: versionId,
      });
      setDados(res);
    } catch (err) {
      setMensagem({ tipo: "erro", texto: err?.message || String(err) });
    } finally {
      setCarregando(false);
    }
  }, [backend, versionId]);

  React.useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);

  if (!versionId) {
    return (
      <div className="eph-painel">
        <div className="eph-desligado">
          O histórico aparece quando você abre uma aula da Central.
        </div>
      </div>
    );
  }

  const aoAbrirPrevia = async ({ chave, historicoId, versaoId }) => {
    if (previaId === chave) {
      setPreviaId(null);
      setPreviaConteudo(null);
      return;
    }

    if (!backend || !versionId) return;
    setCarregandoPrevia(true);
    setPreviaId(chave);
    setPreviaConteudo(null);

    try {
      const args = { p_version_id: versionId };
      if (historicoId) args.p_historico_id = historicoId;
      if (versaoId) args.p_de_versao_id = versaoId;

      const res = await backend.rpc("app_ch_doc_historico_abrir", args);
      setPreviaConteudo(res?.content ?? null);
    } catch (err) {
      setMensagem({ tipo: "erro", texto: err?.message || String(err) });
      setPreviaId(null);
    } finally {
      setCarregandoPrevia(false);
    }
  };

  const aoRestaurar = async ({ historicoId, versaoId }) => {
    const ok = window.confirm(CONFIRMACAO_RESTAURAR);
    if (!ok) return;

    if (!backend || !versionId) return;
    setRestaurando(true);
    setMensagem(null);

    try {
      const args = { p_version_id: versionId };
      if (historicoId) args.p_historico_id = historicoId;
      if (versaoId) args.p_de_versao_id = versaoId;

      const res = await backend.rpc("app_ch_doc_restaurar", args);

      if (res?.so_formatacao) {
        setMensagem({ tipo: "sucesso", texto: "Formatação restaurada. As aprovações continuam valendo." });
      } else {
        setMensagem({ tipo: "sucesso", texto: "Texto restaurado. As aprovações desta versão deixaram de valer." });
      }

      ctx?.contexto?.aoRecarregar?.();
      await carregarHistorico();
    } catch (err) {
      setMensagem({ tipo: "erro", texto: err?.message || String(err) });
    } finally {
      setRestaurando(false);
    }
  };

  const renderPrevia = (chave) => {
    if (previaId !== chave) return null;

    return (
      <div className="eph-previa">
        <div className="eph-previa-cabecalho">
          <span>Prévia do texto</span>
          <button
            type="button"
            className="eph-btn"
            onClick={() => {
              setPreviaId(null);
              setPreviaConteudo(null);
            }}
          >
            Fechar
          </button>
        </div>
        {carregandoPrevia && <div className="eph-vazio">Carregando prévia…</div>}
        {!carregandoPrevia && previaConteudo && (
          <div className="eph-previa-conteudo">
            {Array.isArray(previaConteudo.sections) ? (
              previaConteudo.sections.map((sec, sIdx) => (
                <div key={sIdx}>
                  {sec.heading && <div className="eph-previa-secao-titulo">{sec.heading}</div>}
                  {(sec.paragraphs || []).map((p, pIdx) => (
                    <ParagrafoRico key={pIdx} texto={p.text} rico={p.rico} />
                  ))}
                </div>
              ))
            ) : previaConteudo.type === "doc" ? (
              <LeitorDoc doc={previaConteudo} />
            ) : (
              <div className="eph-vazio">Sem conteúdo para exibir.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const salvamentos = dados?.salvamentos ?? [];
  const versoes = dados?.versoes ?? [];

  return (
    <div className="eph-painel">
      {controle && <EstadoRascunho controle={controle} ctx={ctx} emBloco={true} />}

      <div className="eph-barra-acoes">
        <button
          type="button"
          className="eph-btn"
          disabled={carregando}
          onClick={carregarHistorico}
        >
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {mensagem && (
        <div className={`eph-mensagem eph-mensagem--${mensagem.tipo}`}>
          {mensagem.texto}
        </div>
      )}

      {/* 1. Salvamentos desta versão */}
      <div className="eph-secao">
        <h3 className="eph-secao-titulo">Salvamentos desta versão</h3>
        {salvamentos.length === 0 && !carregando && (
          <div className="eph-vazio">Nenhum salvamento registrado ainda.</div>
        )}
        <ul className="eph-lista">
          {salvamentos.map((s) => {
            const rotuloOrigem =
              s.origem === "anterior"
                ? "Texto antes do histórico começar"
                : s.origem === "salvo"
                ? "Salvo"
                : s.origem === "restaurado"
                ? `Restaurado${s.detalhe ? ` (${s.detalhe})` : ""}`
                : s.origem;

            const chave = `s-${s.id}`;
            const podeRestaurar = !s.igual_ao_atual && !ctx?.somenteLeitura && !restaurando;

            return (
              <li key={s.id} className="eph-item">
                <div className="eph-item-topo">
                  <span className="eph-item-titulo">{rotuloOrigem}</span>
                  <span className="eph-item-data">{formatarDataHoraCompleta(s.em)}</span>
                </div>
                <div className="eph-item-meta">
                  <span>Por: {s.quem || "—"}</span>
                </div>
                <div className="eph-selos">
                  {s.so_formatacao && (
                    <span className="eph-selo eph-selo--sucesso">
                      Só formatação (aprovações mantidas)
                    </span>
                  )}
                  {s.igual_ao_atual && (
                    <span className="eph-selo eph-selo--marca">
                      Igual ao texto atual
                    </span>
                  )}
                </div>
                <div className="eph-item-acoes">
                  <button
                    type="button"
                    className="eph-btn"
                    onClick={() => aoAbrirPrevia({ chave, historicoId: s.id })}
                  >
                    {previaId === chave ? "Fechar" : "Abrir"}
                  </button>
                  <button
                    type="button"
                    className="eph-btn"
                    disabled={!podeRestaurar}
                    onClick={() => aoRestaurar({ historicoId: s.id })}
                  >
                    Restaurar este texto
                  </button>
                </div>
                {renderPrevia(chave)}
              </li>
            );
          })}
        </ul>
      </div>

      {/* 2. Versões desta aula */}
      <div className="eph-secao">
        <h3 className="eph-secao-titulo">Versões desta aula</h3>
        {versoes.length === 0 && !carregando && (
          <div className="eph-vazio">Nenhuma versão encontrada.</div>
        )}
        <ul className="eph-lista">
          {versoes.map((v) => {
            const rotuloStatus = ROTULOS_STATUS[v.status] ?? v.status;
            const ehAtual = v.atual || v.id === versionId;
            const chave = `v-${v.id}`;
            const podeRestaurar = !ehAtual && !v.igual_ao_atual && !ctx?.somenteLeitura && !restaurando;

            return (
              <li key={v.id} className={`eph-item${ehAtual ? " eph-item--atual" : ""}`}>
                <div className="eph-item-topo">
                  <span className="eph-item-titulo">Versão {v.version}</span>
                  <span className="eph-item-data">{formatarDataHoraCompleta(v.em)}</span>
                </div>
                <div className="eph-item-meta">
                  <span>Situação: {rotuloStatus}</span>
                  <span>Por: {v.quem || "—"}</span>
                </div>
                <div className="eph-selos">
                  {ehAtual && (
                    <span className="eph-selo eph-selo--marca">
                      Aberta agora
                    </span>
                  )}
                  {!ehAtual && v.igual_ao_atual && (
                    <span className="eph-selo eph-selo--info">
                      Igual ao texto atual
                    </span>
                  )}
                </div>
                <div className="eph-item-acoes">
                  <button
                    type="button"
                    className="eph-btn"
                    onClick={() => aoAbrirPrevia({ chave, versaoId: v.id })}
                  >
                    {previaId === chave ? "Fechar" : "Abrir"}
                  </button>
                  <button
                    type="button"
                    className="eph-btn"
                    disabled={!podeRestaurar}
                    onClick={() => aoRestaurar({ versaoId: v.id })}
                  >
                    Restaurar este texto
                  </button>
                </div>
                {renderPrevia(chave)}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
