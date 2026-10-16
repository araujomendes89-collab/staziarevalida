import React from "react";
import { docParaUnidade } from "../../../../shared/docRico";
import { sanearPagina, PAGINA_PADRAO } from "../../../../shared/docRico/modulos/pagina";
import { useSession } from "../../session.jsx";

const SUGESTOES_MARCA_DAGUA = ["RASCUNHO — NÃO DISTRIBUIR", "USO INTERNO DA EQUIPE"];

// Margem em mm: a pessoa digita à vontade; grava ao sair do campo (ou Enter), limitada a 5–50 (o saneador recusa o resto).
function CampoMargem({ id, rotulo, valor, desabilitado, aoMudar }) {
  const [texto, setTexto] = React.useState(String(valor));
  React.useEffect(() => setTexto(String(valor)), [valor]);
  const gravar = () => {
    const n = Math.round(Number(texto.replace(",", ".")));
    if (!Number.isFinite(n) || texto.trim() === "") return setTexto(String(valor));
    const limitado = Math.min(50, Math.max(5, n));
    setTexto(String(limitado));
    if (limitado !== valor) aoMudar(limitado);
  };
  return (
    <div className="ep-pg-campo">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        type="number"
        min={5}
        max={50}
        className="ep-pg-input"
        value={texto}
        disabled={desabilitado}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={gravar}
        onKeyDown={(e) => e.key === "Enter" && gravar()}
      />
    </div>
  );
}

export function PainelPagina({ editor, ctx, buscarPrevia }) {
  let backend = null;
  try {
    const session = useSession();
    backend = session?.backend;
  } catch {
    // Modo de teste ou sem SessionProvider
  }

  const cfg = sanearPagina(ctx.config?.pagina) ?? PAGINA_PADRAO;
  const desabilitado = Boolean(ctx.somenteLeitura);

  const atualizar = (parcial) => {
    if (desabilitado) return;
    ctx.mudarConfig?.("pagina", { ...cfg, ...parcial });
  };

  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState(null);
  const [previaPdfUrl, setPreviaPdfUrl] = React.useState(null);
  const [previaHtml, setPreviaHtml] = React.useState(null);
  const [aviso503, setAviso503] = React.useState(null);

  const previaUrlRef = React.useRef(previaPdfUrl);
  previaUrlRef.current = previaPdfUrl;

  const iframeRef = React.useRef(null);

  React.useEffect(() => {
    return () => {
      if (previaUrlRef.current) {
        URL.revokeObjectURL(previaUrlRef.current);
      }
    };
  }, []);

  const gerarPrevia = async () => {
    if (!editor) return;
    setCarregando(true);
    setErro(null);

    if (previaUrlRef.current) {
      URL.revokeObjectURL(previaUrlRef.current);
      setPreviaPdfUrl(null);
    }
    setPreviaHtml(null);
    setAviso503(null);

    try {
      const unidade = docParaUnidade(editor.getJSON(), null);
      const sections = (unidade.sections ?? []).map((s) => ({
        heading: s.heading ?? "",
        paragraphs: (s.paragraphs ?? []).map((p) => ({
          text: p.text ?? "",
          ...(p.rico !== undefined ? { rico: p.rico } : {}),
        })),
      }));

      const body = {
        titulo: ctx.contexto?.titulo ?? "Prévia da aula",
        sections,
        ...(ctx.config?.pagina ? { doc_config: { pagina: ctx.config.pagina } } : {}),
      };

      if (buscarPrevia) {
        const res = await buscarPrevia(body);
        await processarResposta(res);
        return;
      }

      const token = backend?.accessToken ? await backend.accessToken() : null;
      if (!token) {
        setErro("A prévia precisa do servidor: entre de novo.");
        return;
      }

      const res = await fetch("/api/content-hub/previa-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      await processarResposta(res);
    } catch (err) {
      setErro(err?.message || "Falha ao gerar prévia.");
    } finally {
      setCarregando(false);
    }
  };

  const processarResposta = async (res) => {
    if (!res) return;
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviaPdfUrl(url);
    } else if (res.status === 503) {
      const data = await res.json();
      setPreviaHtml(data.html);
      setAviso503(data.error);
    } else {
      let msg = `Erro ${res.status} ao gerar prévia.`;
      try {
        const data = await res.json();
        if (data.error) msg = data.error;
      } catch {
        // resposta sem corpo json
      }
      setErro(msg);
    }
  };

  return (
    <div className="ep-pg-painel">
      <p className="ep-pg-aviso">
        O layout de página vale para o PDF e a impressão. O aluno no celular continua lendo em tela corrida.
      </p>

      {/* Margens */}
      <div className="ep-pg-secao">
        <span className="ep-pg-titulo-secao">Margens (mm)</span>
        <div className="ep-pg-grid-2">
          <CampoMargem id="ep-pg-m-topo" rotulo="Superior" valor={cfg.margens.topo} desabilitado={desabilitado} aoMudar={(n) => atualizar({ margens: { ...cfg.margens, topo: n } })} />
          <CampoMargem id="ep-pg-m-base" rotulo="Inferior" valor={cfg.margens.base} desabilitado={desabilitado} aoMudar={(n) => atualizar({ margens: { ...cfg.margens, base: n } })} />
          <CampoMargem id="ep-pg-m-esq" rotulo="Esquerda" valor={cfg.margens.esquerda} desabilitado={desabilitado} aoMudar={(n) => atualizar({ margens: { ...cfg.margens, esquerda: n } })} />
          <CampoMargem id="ep-pg-m-dir" rotulo="Direita" valor={cfg.margens.direita} desabilitado={desabilitado} aoMudar={(n) => atualizar({ margens: { ...cfg.margens, direita: n } })} />
        </div>
      </div>

      {/* Cabeçalho */}
      <div className="ep-pg-secao">
        <span className="ep-pg-titulo-secao">Cabeçalho</span>
        <div className="ep-pg-campo">
          <label htmlFor="ep-pg-cab-txt">Texto do cabeçalho</label>
          <input
            id="ep-pg-cab-txt"
            type="text"
            maxLength={100}
            className="ep-pg-input"
            placeholder="Ex.: StaziaMed — Módulo 1"
            value={cfg.cabecalho.texto}
            disabled={desabilitado}
            onChange={(e) =>
              atualizar({ cabecalho: { ...cfg.cabecalho, texto: e.target.value } })
            }
          />
        </div>
        <div className="ep-pg-campo">
          <label htmlFor="ep-pg-cab-alin">Alinhamento</label>
          <select
            id="ep-pg-cab-alin"
            className="ep-pg-select"
            value={cfg.cabecalho.alinhamento}
            disabled={desabilitado}
            onChange={(e) =>
              atualizar({ cabecalho: { ...cfg.cabecalho, alinhamento: e.target.value } })
            }
          >
            <option value="esquerda">À esquerda</option>
            <option value="centro">Ao centro</option>
            <option value="direita">À direita</option>
          </select>
        </div>
      </div>

      {/* Rodapé */}
      <div className="ep-pg-secao">
        <span className="ep-pg-titulo-secao">Rodapé</span>
        <label className="ep-pg-checkbox-linha">
          <input
            type="checkbox"
            checked={cfg.rodape.padrao}
            disabled={desabilitado}
            onChange={(e) =>
              atualizar({ rodape: { ...cfg.rodape, padrao: e.target.checked } })
            }
          />
          <span>Rodapé padrão StaziaMed (título · versão · data)</span>
        </label>
        <div className="ep-pg-campo">
          <label htmlFor="ep-pg-rod-txt">Texto adicional</label>
          <input
            id="ep-pg-rod-txt"
            type="text"
            maxLength={100}
            className="ep-pg-input"
            placeholder="Texto do rodapé"
            value={cfg.rodape.texto}
            disabled={desabilitado}
            onChange={(e) =>
              atualizar({ rodape: { ...cfg.rodape, texto: e.target.value } })
            }
          />
        </div>
        <div className="ep-pg-campo">
          <label htmlFor="ep-pg-rod-alin">Alinhamento do texto adicional</label>
          <select
            id="ep-pg-rod-alin"
            className="ep-pg-select"
            value={cfg.rodape.alinhamento}
            disabled={desabilitado}
            onChange={(e) =>
              atualizar({ rodape: { ...cfg.rodape, alinhamento: e.target.value } })
            }
          >
            <option value="esquerda">À esquerda</option>
            <option value="centro">Ao centro</option>
            <option value="direita">À direita</option>
          </select>
        </div>
      </div>

      {/* Numeração */}
      <div className="ep-pg-secao">
        <span className="ep-pg-titulo-secao">Numeração de páginas</span>
        <div className="ep-pg-campo">
          <label htmlFor="ep-pg-num-pos">Posição</label>
          <select
            id="ep-pg-num-pos"
            className="ep-pg-select"
            value={cfg.numeracao.posicao}
            disabled={desabilitado}
            onChange={(e) =>
              atualizar({ numeracao: { ...cfg.numeracao, posicao: e.target.value } })
            }
          >
            <option value="nenhuma">Nenhuma</option>
            <option value="rodape-direita">Rodapé à direita</option>
            <option value="rodape-centro">Rodapé ao centro</option>
            <option value="rodape-esquerda">Rodapé à esquerda</option>
            <option value="cabecalho-direita">Cabeçalho à direita</option>
          </select>
        </div>
        <div className="ep-pg-campo">
          <label htmlFor="ep-pg-num-fmt">Formato</label>
          <select
            id="ep-pg-num-fmt"
            className="ep-pg-select"
            value={cfg.numeracao.formato}
            disabled={desabilitado}
            onChange={(e) =>
              atualizar({ numeracao: { ...cfg.numeracao, formato: e.target.value } })
            }
          >
            <option value="pagina-de">página 2 de 6</option>
            <option value="pagina">página 2</option>
            <option value="numero">apenas número (2)</option>
          </select>
        </div>
      </div>

      {/* Primeira página diferente */}
      <div className="ep-pg-secao">
        <label className="ep-pg-checkbox-linha">
          <input
            type="checkbox"
            checked={cfg.primeiraDiferente}
            disabled={desabilitado}
            onChange={(e) => atualizar({ primeiraDiferente: e.target.checked })}
          />
          <span>1ª página sem cabeçalho e rodapé</span>
        </label>
      </div>

      {/* Marca-d'água */}
      <div className="ep-pg-secao">
        <span className="ep-pg-titulo-secao">Marca-d'água</span>
        <div className="ep-pg-campo">
          <label htmlFor="ep-pg-marca">Texto da marca-d'água</label>
          <input
            id="ep-pg-marca"
            type="text"
            maxLength={60}
            className="ep-pg-input"
            placeholder="Ex.: RASCUNHO — NÃO DISTRIBUIR"
            value={cfg.marcaDagua}
            disabled={desabilitado}
            onChange={(e) => atualizar({ marcaDagua: e.target.value })}
          />
        </div>
        <div className="ep-pg-sugestoes">
          {SUGESTOES_MARCA_DAGUA.map((sug) => (
            <button
              key={sug}
              type="button"
              className="ep-pg-sugestao-btn"
              disabled={desabilitado}
              onClick={() => atualizar({ marcaDagua: sug })}
            >
              {sug}
            </button>
          ))}
          {cfg.marcaDagua && (
            <button
              type="button"
              className="ep-pg-sugestao-btn"
              disabled={desabilitado}
              onClick={() => atualizar({ marcaDagua: "" })}
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Paginação do conteúdo */}
      <div className="ep-pg-secao">
        <span className="ep-pg-titulo-secao">Paginação do conteúdo</span>
        <label className="ep-pg-checkbox-linha">
          <input
            type="checkbox"
            checked={cfg.secaoNovaPagina}
            disabled={desabilitado}
            onChange={(e) => atualizar({ secaoNovaPagina: e.target.checked })}
          />
          <span>Cada seção começa em página nova</span>
        </label>
        <label className="ep-pg-checkbox-linha">
          <input
            type="checkbox"
            checked={cfg.orfasViuvas}
            disabled={desabilitado}
            onChange={(e) => atualizar({ orfasViuvas: e.target.checked })}
          />
          <span>Evitar linhas sozinhas (órfãs/viúvas)</span>
        </label>
      </div>

      {/* Ações do painel */}
      <div className="ep-pg-acoes">
        <button
          type="button"
          className="ep-pg-btn-restaurar"
          disabled={desabilitado}
          onClick={() => ctx.mudarConfig?.("pagina", undefined)}
        >
          Restaurar padrão
        </button>
        <button
          type="button"
          className="ep-pg-btn-previa"
          disabled={carregando}
          onClick={gerarPrevia}
        >
          {carregando ? "Gerando prévia..." : "Prévia do PDF"}
        </button>
      </div>

      {erro && <div className="ep-pg-erro">{erro}</div>}

      {/* Visualização da prévia */}
      {previaPdfUrl && (
        <div className="ep-pg-previa-area">
          <div className="ep-pg-previa-topo">
            <span className="ep-pg-titulo-secao">Documento em PDF</span>
            <a
              href={previaPdfUrl}
              target="_blank"
              rel="noreferrer"
              className="ep-pg-link-externo"
            >
              Abrir em outra aba
            </a>
          </div>
          <iframe title="Prévia do PDF" src={previaPdfUrl} className="ep-pg-iframe" />
        </div>
      )}

      {previaHtml && (
        <div className="ep-pg-previa-area">
          {aviso503 && <p className="ep-pg-aviso ep-pg-aviso--alerta">{aviso503}</p>}
          <div className="ep-pg-previa-topo">
            <span className="ep-pg-titulo-secao">Prévia para impressão</span>
            <button
              type="button"
              className="ep-pg-btn-imprimir"
              onClick={() => iframeRef.current?.contentWindow?.print()}
            >
              Imprimir / salvar em PDF
            </button>
          </div>
          <iframe
            ref={iframeRef}
            title="Prévia para impressão"
            sandbox="allow-same-origin allow-modals"
            srcDoc={previaHtml}
            className="ep-pg-iframe"
          />
        </div>
      )}
    </div>
  );
}
